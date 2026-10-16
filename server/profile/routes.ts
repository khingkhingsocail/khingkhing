import express, { type Express, type Request, type Response } from "express";
import multer from "multer";
import { randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import {
  PROFILE_IMAGE_MAX_BYTES,
  PROFILE_IMAGE_MIME_TYPES,
  normalizeAccountProfileFields,
  validateAccountProfileFields,
  type AccountProfileFields,
  type AccountProfileSavePayload,
  type ProfileImageMimeType,
} from "../../shared/profile";
import { users, userProfiles } from "../../drizzle/schema";
import { getDb } from "../db";
import { sdk } from "../_core/sdk";
import { inspectEvidence } from "../verification/media";
import { syncPublishedCreator } from "../mediaCreator";

type ProfileDB = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type ProfileImageField = "avatar" | "cover";

const MAX_PROFILE_REQUEST_BYTES = PROFILE_IMAGE_MAX_BYTES * 2 + 32 * 1024;
const PROFILE_JSON_MAX_BYTES = 8 * 1024;
const allowedImageTypes = new Set<string>(PROFILE_IMAGE_MIME_TYPES);

class ProfileError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

const multipart = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: PROFILE_IMAGE_MAX_BYTES,
    files: 2,
    fields: 1,
    fieldNameSize: 32,
    fieldSize: PROFILE_JSON_MAX_BYTES,
    parts: 3,
  },
}).fields([
  { name: "avatar", maxCount: 1 },
  { name: "cover", maxCount: 1 },
]);

function route(fn: (req: Request, res: Response) => Promise<unknown>) {
  return (req: Request, res: Response) => {
    void fn(req, res).catch((cause: unknown) => {
      if (res.headersSent) return;
      const error = cause instanceof ProfileError ? cause : null;
      if (!error) console.error("[Account profile] Request failed");
      res.status(error?.status ?? 503).json({
        error: error?.message ?? "โปรไฟล์บัญชียังไม่พร้อม กรุณาลองใหม่",
      });
    });
  };
}

function setPrivateHeaders(_req: Request, res: Response, next: () => void) {
  res.set({
    "Cache-Control": "private, no-store",
    Pragma: "no-cache",
    "X-Content-Type-Options": "nosniff",
  });
  next();
}

async function authenticatedUser(req: Request) {
  if (req.get("X-Khing-Profile") !== "1")
    throw new ProfileError(403, "คำขอโปรไฟล์ไม่ถูกต้อง");
  try {
    const user = await sdk.authenticateRequest(req);
    if (user.isCron || !Number.isSafeInteger(user.id) || user.id <= 0)
      throw new Error("Invalid account session");
    return user;
  } catch {
    throw new ProfileError(401, "เข้าสู่ระบบขิงขิงก่อนเปิดโปรไฟล์บัญชี");
  }
}

async function dbReady(): Promise<ProfileDB> {
  const db = await getDb();
  if (!db)
    throw new ProfileError(503, "ฐานข้อมูลยังไม่พร้อม กรุณาลองใหม่ภายหลัง");
  return db;
}

function parseMultipart(req: Request, res: Response): Promise<void> {
  const contentLength = req.get("content-length");
  if (contentLength !== undefined) {
    if (!/^\d+$/.test(contentLength))
      return Promise.reject(new ProfileError(400, "ขนาดคำขอไม่ถูกต้อง"));
    if (Number(contentLength) > MAX_PROFILE_REQUEST_BYTES)
      return Promise.reject(
        new ProfileError(413, "ข้อมูลโปรไฟล์มีขนาดใหญ่เกินไป")
      );
  }
  return new Promise((resolve, reject) => {
    multipart(req, res, error => {
      if (!error) return resolve();
      if (error instanceof multer.MulterError) {
        const status =
          error.code === "LIMIT_FILE_SIZE" || error.code === "LIMIT_FIELD_VALUE"
            ? 413
            : 400;
        const message =
          error.code === "LIMIT_FILE_SIZE"
            ? "รูปภาพต้องมีขนาดไม่เกิน 5 MB ต่อไฟล์"
            : status === 413
              ? "ข้อมูลโปรไฟล์มีขนาดใหญ่เกินไป"
              : "ข้อมูลอัปโหลดไม่ถูกต้อง";
        return reject(new ProfileError(status, message));
      }
      reject(new ProfileError(400, "อ่านข้อมูลอัปโหลดไม่สำเร็จ"));
    });
  });
}

function parseSavePayload(raw: unknown): AccountProfileSavePayload {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new ProfileError(400, "ข้อมูลโปรไฟล์ไม่ถูกต้อง");
  const body = raw as Record<string, unknown>;
  const allowedKeys = new Set([
    "displayName",
    "handle",
    "bio",
    "location",
    "website",
    "category",
    "expectedRevision",
    "removeAvatar",
    "removeCover",
  ]);
  if (Object.keys(body).some(key => !allowedKeys.has(key)))
    throw new ProfileError(400, "ข้อมูลโปรไฟล์มีฟิลด์ที่ไม่รองรับ");

  const textKeys = [
    "displayName",
    "handle",
    "bio",
    "location",
    "website",
    "category",
  ] as const;
  const fields = {} as AccountProfileFields;
  for (const key of textKeys) {
    if (typeof body[key] !== "string")
      throw new ProfileError(400, "ข้อมูลโปรไฟล์ไม่ครบถ้วน");
    fields[key] = body[key] as string;
  }
  if (
    body.expectedRevision !== null &&
    (typeof body.expectedRevision !== "string" ||
      !/^[a-f0-9]{32}$/.test(body.expectedRevision))
  )
    throw new ProfileError(400, "รุ่นโปรไฟล์ที่แก้ไขไม่ถูกต้อง");
  const removeAvatar = body.removeAvatar ?? false;
  const removeCover = body.removeCover ?? false;
  if (typeof removeAvatar !== "boolean" || typeof removeCover !== "boolean")
    throw new ProfileError(400, "คำสั่งจัดการรูปโปรไฟล์ไม่ถูกต้อง");

  const normalized = normalizeAccountProfileFields(fields);
  const validationError = validateAccountProfileFields(normalized);
  if (validationError) throw new ProfileError(400, validationError);
  return {
    ...normalized,
    expectedRevision: body.expectedRevision as string | null,
    removeAvatar,
    removeCover,
  };
}

function uploadedFile(
  req: Request,
  field: ProfileImageField
): Express.Multer.File | undefined {
  const files = req.files as Record<string, Express.Multer.File[]> | undefined;
  return files?.[field]?.[0];
}

async function validateImage(file: Express.Multer.File | undefined) {
  if (!file) return null;
  if (
    !allowedImageTypes.has(file.mimetype) ||
    !file.buffer.length ||
    file.size > PROFILE_IMAGE_MAX_BYTES
  )
    throw new ProfileError(
      415,
      "รองรับเฉพาะไฟล์ JPG, PNG หรือ WebP ขนาดไม่เกิน 5 MB"
    );
  try {
    const checked = await inspectEvidence(file.buffer, file.mimetype);
    if (checked.kind !== "image") throw new Error("Not an image");
  } catch {
    throw new ProfileError(
      400,
      "เปิดรูปภาพนี้ไม่ได้ กรุณาเลือกไฟล์ JPG, PNG หรือ WebP ที่ถูกต้อง"
    );
  }
  return {
    data: file.buffer,
    mimeType: file.mimetype as ProfileImageMimeType,
  };
}

function imageMetadata(
  field: ProfileImageField,
  mimeType: string | null,
  size: number | string | null
) {
  const byteCount = Number(size ?? 0);
  if (
    !mimeType ||
    !allowedImageTypes.has(mimeType) ||
    !Number.isSafeInteger(byteCount) ||
    byteCount <= 0
  )
    return null;
  return {
    url: `/api/profile/me/${field}`,
    mimeType: mimeType as ProfileImageMimeType,
    size: byteCount,
  };
}

async function readProfile(
  db: { select: (fields: any) => any },
  userId: number
) {
  const [row] = await db
    .select({
      displayName: userProfiles.displayName,
      handle: userProfiles.handle,
      bio: userProfiles.bio,
      location: userProfiles.location,
      website: userProfiles.website,
      category: userProfiles.category,
      revision: userProfiles.revision,
      avatarMime: userProfiles.avatarMime,
      avatarSize: sql<number | null>`OCTET_LENGTH(${userProfiles.avatar})`,
      coverMime: userProfiles.coverMime,
      coverSize: sql<number | null>`OCTET_LENGTH(${userProfiles.cover})`,
      updatedAt: userProfiles.updatedAt,
    })
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);
  if (!row) return null;
  return {
    displayName: row.displayName,
    handle: row.handle,
    bio: row.bio,
    location: row.location,
    website: row.website,
    category: row.category,
    revision: row.revision,
    avatar: imageMetadata("avatar", row.avatarMime, row.avatarSize),
    cover: imageMetadata("cover", row.coverMime, row.coverSize),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function serveImage(
  req: Request,
  res: Response,
  field: ProfileImageField
) {
  const user = await authenticatedUser(req);
  const db = await dbReady();
  const isAvatar = field === "avatar";
  const [row] = await db
    .select({
      data: isAvatar ? userProfiles.avatar : userProfiles.cover,
      mimeType: isAvatar ? userProfiles.avatarMime : userProfiles.coverMime,
    })
    .from(userProfiles)
    .where(eq(userProfiles.userId, user.id))
    .limit(1);
  if (!row?.data || !row.mimeType || !allowedImageTypes.has(row.mimeType))
    throw new ProfileError(404, "ไม่พบรูปโปรไฟล์ที่บันทึกไว้");
  const data = Buffer.isBuffer(row.data) ? row.data : Buffer.from(row.data);
  return res
    .status(200)
    .set({
      "Content-Type": row.mimeType,
      "Content-Length": String(data.length),
      "Content-Disposition": "inline",
    })
    .end(data);
}

export function registerProfileRoutes(app: Express) {
  const router = express.Router();
  router.use(setPrivateHeaders);

  router.get(
    "/me",
    route(async (req, res) => {
      const user = await authenticatedUser(req);
      const db = await dbReady();
      const profile = await readProfile(db, user.id);
      return res.status(200).json({ profile });
    })
  );

  router.put(
    "/me",
    route(async (req, res) => {
      const user = await authenticatedUser(req);
      await parseMultipart(req, res);
      const profileField = req.body?.profile;
      if (
        typeof profileField !== "string" ||
        profileField.length > PROFILE_JSON_MAX_BYTES
      )
        throw new ProfileError(400, "ข้อมูลโปรไฟล์ไม่ถูกต้อง");
      let rawPayload: unknown;
      try {
        rawPayload = JSON.parse(profileField);
      } catch {
        throw new ProfileError(400, "อ่านข้อมูลโปรไฟล์ไม่สำเร็จ");
      }
      const payload = parseSavePayload(rawPayload);
      const avatarFile = uploadedFile(req, "avatar");
      const coverFile = uploadedFile(req, "cover");
      if (
        (avatarFile && payload.removeAvatar) ||
        (coverFile && payload.removeCover)
      )
        throw new ProfileError(
          400,
          "เลือกได้ว่าจะเปลี่ยนหรือเอารูปออกอย่างใดอย่างหนึ่ง"
        );
      const [avatar, cover] = await Promise.all([
        validateImage(avatarFile),
        validateImage(coverFile),
      ]);
      const db = await dbReady();
      const revision = randomBytes(16).toString("hex");

      const savedProfile = await db.transaction(async tx => {
        // Lock the owning account first: this also serializes two first-time creates
        // before either one can see a user_profiles row to lock.
        const [account] = await tx
          .select({ id: users.id })
          .from(users)
          .where(eq(users.id, user.id))
          .limit(1)
          .for("update");
        if (!account) throw new ProfileError(401, "บัญชีผู้ใช้ไม่พร้อมใช้งาน");
        const [current] = await tx
          .select({ revision: userProfiles.revision })
          .from(userProfiles)
          .where(eq(userProfiles.userId, user.id))
          .limit(1)
          .for("update");
        if (
          (payload.expectedRevision === null && current) ||
          (payload.expectedRevision !== null &&
            (!current || current.revision !== payload.expectedRevision))
        )
          throw new ProfileError(
            409,
            "โปรไฟล์นี้มีการเปลี่ยนแปลงแล้ว กรุณาโหลดข้อมูลปัจจุบันก่อนบันทึก"
          );

        const changedFields: AccountProfileFields = {
          displayName: payload.displayName,
          handle: payload.handle,
          bio: payload.bio,
          location: payload.location,
          website: payload.website,
          category: payload.category,
        };
        if (current) {
          const updates: Record<string, unknown> = {
            ...changedFields,
            revision,
            updatedAt: new Date(),
          };
          if (avatar) {
            updates.avatar = avatar.data;
            updates.avatarMime = avatar.mimeType;
          } else if (payload.removeAvatar) {
            updates.avatar = null;
            updates.avatarMime = null;
          }
          if (cover) {
            updates.cover = cover.data;
            updates.coverMime = cover.mimeType;
          } else if (payload.removeCover) {
            updates.cover = null;
            updates.coverMime = null;
          }
          await tx
            .update(userProfiles)
            .set(updates as typeof userProfiles.$inferInsert)
            .where(eq(userProfiles.userId, user.id));
        } else {
          await tx.insert(userProfiles).values({
            userId: user.id,
            ...changedFields,
            avatar: avatar?.data ?? null,
            avatarMime: avatar?.mimeType ?? null,
            cover: cover?.data ?? null,
            coverMime: cover?.mimeType ?? null,
            revision,
            updatedAt: new Date(),
          });
        }
        const canonical = await readProfile(tx, user.id);
        if (!canonical) throw new Error("Saved profile row was not readable");
        await syncPublishedCreator(
          tx,
          user.id,
          {
            displayName: payload.displayName,
            handle: payload.handle,
            revision,
          },
          avatar,
          payload.removeAvatar
        );
        return canonical;
      });
      return res.status(200).json({ profile: savedProfile });
    })
  );

  router.get(
    "/me/:field",
    route(async (req, res) => {
      const field = req.params.field;
      if (field !== "avatar" && field !== "cover")
        throw new ProfileError(404, "ไม่พบรูปโปรไฟล์ที่ร้องขอ");
      return serveImage(req, res, field);
    })
  );

  router.use((_req, res) =>
    res.status(404).json({ error: "ไม่พบเส้นทางโปรไฟล์บัญชีนี้" })
  );

  app.use("/api/profile", router);
}
