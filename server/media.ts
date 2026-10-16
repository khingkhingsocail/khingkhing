import { createHash, randomBytes } from "node:crypto";
import express, { type Express, type Request, type Response } from "express";
import { and, desc, eq, lt, or, sql } from "drizzle-orm";
import { getDb } from "./db";
import {
  publicMedia,
  publicMediaCreators,
  publicMediaViewTotals,
  users,
} from "../drizzle/schema";
import type {
  PublicMediaKind,
  PublicMediaPage,
  PublicMediaSummary,
  PublicMediaUploadResult,
} from "../shared/publicMedia";
import { sdk } from "./_core/sdk";
import { canClaimMedia, validMediaToken } from "./mediaOwnership";
import { streamChunkedAsset } from "./public-upload/asset";
import {
  ensureMediaCreator,
  creatorProjection,
  CREATOR_IMAGE_TYPES,
} from "./mediaCreator";

const mediaSelection = {
  id: publicMedia.id,
  title: publicMedia.title,
  description: publicMedia.description,
  kind: publicMedia.kind,
  mimeType: publicMedia.mimeType,
  size: publicMedia.size,
  createdAt: publicMedia.createdAt,
  viewCount: sql<number>`COALESCE(${publicMediaViewTotals.total}, 0)`.mapWith(
    Number
  ),
  ownerUserId: publicMedia.ownerUserId,
  creatorId: publicMediaCreators.id,
  creatorName: publicMediaCreators.displayName,
  creatorHandle: publicMediaCreators.handle,
  creatorAvatarMime: publicMediaCreators.avatarMime,
  creatorRevision: publicMediaCreators.revision,
};

async function mediaAccount(req: Request): Promise<number | null> {
  try {
    const user = await sdk.authenticateRequest(req);
    return !user.isCron && Number.isSafeInteger(user.id) && user.id > 0
      ? user.id
      : null;
  } catch {
    return null;
  }
}

export { MAX_PUBLIC_MEDIA_BYTES } from "../shared/publicUpload";
// Old clients retain the bounded single-request endpoint; current clients use 4 MiB chunks.
const LEGACY_UPLOAD_BYTES = 20 * 1024 * 1024;
const PAGE_SIZE = 40;
const MAX_PAGE_SIZE = 100;
const MAX_CONCURRENT_UPLOADS = 3;
const VALID_ID = /^[a-f0-9]{32}$/;
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/webm",
]);

type MediaCursor = { createdAt: Date; id: string };

function noStore(_req: Request, res: Response, next: () => void) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("X-Content-Type-Options", "nosniff");
  next();
}

function normalizedText(
  value: unknown,
  maximum: number,
  fallback = ""
): string {
  if (typeof value !== "string") return fallback;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return Array.from(cleaned).slice(0, maximum).join("") || fallback;
}

function decodeCursor(value: unknown): MediaCursor | null | false {
  if (value === undefined) return null;
  if (typeof value !== "string" || value.length > 512) return false;
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8")
    );
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !("createdAt" in parsed) ||
      !("id" in parsed)
    )
      return false;
    const fields = parsed as { createdAt?: unknown; id?: unknown };
    if (
      typeof fields.createdAt !== "string" ||
      typeof fields.id !== "string" ||
      !VALID_ID.test(fields.id)
    )
      return false;
    const createdAt = new Date(fields.createdAt);
    if (Number.isNaN(createdAt.getTime())) return false;
    return { createdAt, id: fields.id };
  } catch {
    return false;
  }
}

export function detectPublicMediaKind(
  data: Buffer,
  mimeType: string
): PublicMediaKind | null {
  if (data.length < 4 || !ALLOWED_MIME_TYPES.has(mimeType)) return null;

  if (
    mimeType === "image/jpeg" &&
    data[0] === 0xff &&
    data[1] === 0xd8 &&
    data[2] === 0xff
  )
    return "image";
  if (
    mimeType === "image/png" &&
    data
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return "image";
  if (
    mimeType === "image/webp" &&
    data.toString("ascii", 0, 4) === "RIFF" &&
    data.toString("ascii", 8, 12) === "WEBP"
  )
    return "image";
  if (
    mimeType === "video/mp4" &&
    data.length >= 12 &&
    data.toString("ascii", 4, 8) === "ftyp"
  )
    return "video";
  if (
    mimeType === "video/webm" &&
    data.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
  )
    return "video";
  return null;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function toSummary(
  row: {
    id: string;
    title: string;
    description: string;
    kind: "image" | "video";
    mimeType: string;
    size: number;
    createdAt: Date;
    viewCount?: number;
    ownerUserId?: number | null;
    creatorId?: string | null;
    creatorName?: string | null;
    creatorHandle?: string | null;
    creatorAvatarMime?: string | null;
    creatorRevision?: string | null;
  },
  viewerId: number | null = null
): PublicMediaSummary {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    kind: row.kind,
    mimeType: row.mimeType,
    size: row.size,
    createdAt: row.createdAt.toISOString(),
    viewCount: row.viewCount ?? 0,
    accountLinked: row.ownerUserId != null,
    isMine: viewerId !== null && row.ownerUserId === viewerId,
    creator:
      row.creatorId && row.creatorName && row.creatorRevision
        ? creatorProjection({
            id: row.creatorId,
            displayName: row.creatorName,
            handle: row.creatorHandle ?? "",
            avatarMime: row.creatorAvatarMime,
            revision: row.creatorRevision,
          })
        : null,
  };
}

export function parsePublicMediaRange(
  header: string | undefined,
  size: number
): { start: number; end: number } | "invalid" | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (!match[1] && !match[2])) return "invalid";

  let start: number;
  let end: number;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return "invalid";
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < 0 ||
      end < start ||
      start >= size
    )
      return "invalid";
    end = Math.min(end, size - 1);
  }
  if (size === 0 || start >= size) return "invalid";
  return { start, end };
}

function respondJsonError(res: Response, status: number, error: string) {
  return res.status(status).json({ error });
}

async function uploadPublicMedia(req: Request, res: Response) {
  const data: unknown = req.body;
  if (!Buffer.isBuffer(data) || data.length === 0)
    return respondJsonError(res, 400, "เลือกไฟล์ก่อนโพสต์");
  if (data.length > LEGACY_UPLOAD_BYTES)
    return respondJsonError(
      res,
      413,
      "กรุณารีโหลดหน้าโพสต์เพื่ออัปโหลดแบบแบ่งส่วนได้ถึง 1,000 MB"
    );

  const encodedMetadata = req.get("x-media-meta");
  if (!encodedMetadata || encodedMetadata.length > 4096)
    return respondJsonError(res, 400, "ข้อมูลประกอบไฟล์ไม่ถูกต้อง");

  let metadata: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(encodedMetadata, "base64url").toString("utf8")
    );
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new Error("Invalid metadata");
    metadata = parsed as Record<string, unknown>;
  } catch {
    return respondJsonError(res, 400, "อ่านข้อมูลประกอบไฟล์ไม่สำเร็จ");
  }

  const mimeType =
    typeof metadata.mimeType === "string"
      ? metadata.mimeType.toLowerCase()
      : "";
  const kind = detectPublicMediaKind(data, mimeType);
  if (!kind)
    return respondJsonError(
      res,
      415,
      "รองรับเฉพาะภาพ JPEG, PNG, WebP และวิดีโอ MP4, WebM ที่ตรวจชนิดไฟล์ได้"
    );

  const title = normalizedText(metadata.title, 100, "ผลงานใหม่");
  const description = normalizedText(metadata.description, 240);
  const id = randomBytes(16).toString("hex");
  const deleteToken = randomBytes(32).toString("base64url");
  const deleteTokenHash = sha256(deleteToken);
  const db = await getDb();
  if (!db)
    return respondJsonError(res, 503, "ฐานข้อมูลยังไม่พร้อม ลองใหม่ภายหลัง");

  const accountRequested = req.get("X-Khing-Media-Account") === "1";
  const ownerUserId = await mediaAccount(req);
  if (accountRequested && ownerUserId === null)
    return respondJsonError(res, 401, "เข้าสู่ระบบก่อนโพสต์ด้วยบัญชีของคุณ");

  try {
    const createdAt = new Date();
    const creator = await db.transaction(async tx => {
      const identity =
        ownerUserId !== null ? await ensureMediaCreator(tx, ownerUserId) : null;
      await tx.insert(publicMedia).values({
        id,
        title,
        description,
        kind,
        mimeType,
        size: data.length,
        data,
        deleteTokenHash,
        createdAt,
        ownerUserId,
      });
      return identity;
    });
    const response: PublicMediaUploadResult = {
      item: {
        ...toSummary(
          {
            id,
            title,
            description,
            kind,
            mimeType,
            size: data.length,
            createdAt,
            ownerUserId,
          },
          ownerUserId
        ),
        creator,
      },
      deleteToken,
    };
    return res.status(201).json(response);
  } catch (error) {
    console.error("[Public media] Upload failed");
    return respondJsonError(
      res,
      500,
      "บันทึกโพสต์ไม่สำเร็จ ลองอีกครั้งภายหลัง"
    );
  }
}

export function registerPublicMediaRoutes(app: Express) {
  app.use("/api/media", noStore);

  app.get("/api/media", async (req, res) => {
    const db = await getDb();
    if (!db) return respondJsonError(res, 503, "ฐานข้อมูลยังไม่พร้อม");

    const rawLimit =
      typeof req.query.limit === "string" ? Number(req.query.limit) : PAGE_SIZE;
    const limit = Number.isInteger(rawLimit)
      ? Math.max(1, Math.min(rawLimit, MAX_PAGE_SIZE))
      : PAGE_SIZE;
    const cursor = decodeCursor(req.query.cursor);
    if (cursor === false)
      return respondJsonError(res, 400, "ตัวชี้หน้าฟีดไม่ถูกต้อง");
    const condition = cursor
      ? or(
          lt(publicMedia.createdAt, cursor.createdAt),
          and(
            eq(publicMedia.createdAt, cursor.createdAt),
            lt(publicMedia.id, cursor.id)
          )
        )
      : undefined;

    try {
      const rows = await db
        .select(mediaSelection)
        .from(publicMedia)
        .leftJoin(
          publicMediaCreators,
          eq(publicMedia.ownerUserId, publicMediaCreators.userId)
        )
        .leftJoin(
          publicMediaViewTotals,
          eq(publicMedia.id, publicMediaViewTotals.mediaId)
        )
        .where(condition)
        .orderBy(desc(publicMedia.createdAt), desc(publicMedia.id))
        .limit(limit + 1);
      const hasMore = rows.length > limit;
      const viewerId = await mediaAccount(req);
      const items = rows.slice(0, limit).map(row => toSummary(row, viewerId));
      const lastRow = rows[Math.min(rows.length, limit) - 1];
      const nextCursor =
        hasMore && lastRow
          ? Buffer.from(
              JSON.stringify({
                createdAt: lastRow.createdAt.toISOString(),
                id: lastRow.id,
              })
            ).toString("base64url")
          : null;
      const page: PublicMediaPage = { items, nextCursor };
      return res.status(200).json(page);
    } catch (error) {
      console.error(
        "[Public media] List failed:",
        error instanceof Error ? error.message : "unknown error"
      );
      return respondJsonError(
        res,
        503,
        "เปิดฟีดสาธารณะไม่สำเร็จ ลองใหม่อีกครั้ง"
      );
    }
  });

  // These endpoints never read the private user_profiles table.
  app.get("/api/media/creators/:id", async (req, res) => {
    if (!VALID_ID.test(req.params.id))
      return respondJsonError(res, 404, "ไม่พบโปรไฟล์นี้");
    const db = await getDb();
    if (!db) return respondJsonError(res, 503, "ฐานข้อมูลยังไม่พร้อม");
    try {
      const [row] = await db
        .select({
          id: publicMediaCreators.id,
          displayName: publicMediaCreators.displayName,
          handle: publicMediaCreators.handle,
          avatarMime: publicMediaCreators.avatarMime,
          revision: publicMediaCreators.revision,
        })
        .from(publicMediaCreators)
        .where(eq(publicMediaCreators.id, req.params.id))
        .limit(1);
      if (!row) return respondJsonError(res, 404, "ไม่พบโปรไฟล์ผู้โพสต์นี้");
      return res.json(creatorProjection(row));
    } catch {
      return respondJsonError(res, 503, "โหลดโปรไฟล์ผู้โพสต์ไม่สำเร็จ");
    }
  });

  app.get("/api/media/creators/:id/avatar", async (req, res) => {
    if (!VALID_ID.test(req.params.id))
      return respondJsonError(res, 404, "ไม่พบรูปนี้");
    const db = await getDb();
    if (!db) return respondJsonError(res, 503, "ฐานข้อมูลยังไม่พร้อม");
    try {
      const [row] = await db
        .select({
          data: publicMediaCreators.avatar,
          mimeType: publicMediaCreators.avatarMime,
        })
        .from(publicMediaCreators)
        .where(eq(publicMediaCreators.id, req.params.id))
        .limit(1);
      if (!row?.data || !row.mimeType || !CREATOR_IMAGE_TYPES.has(row.mimeType))
        return respondJsonError(res, 404, "ไม่มีรูปโปรไฟล์สาธารณะ");
      const data = Buffer.isBuffer(row.data) ? row.data : Buffer.from(row.data);
      return res
        .set({
          "Content-Type": row.mimeType,
          "Content-Length": String(data.length),
          "Content-Disposition": "inline",
        })
        .end(data);
    } catch {
      return respondJsonError(res, 503, "โหลดรูปผู้โพสต์ไม่สำเร็จ");
    }
  });

  app.get("/api/media/creators/:id/posts", async (req, res) => {
    if (!VALID_ID.test(req.params.id))
      return respondJsonError(res, 404, "ไม่พบโปรไฟล์นี้");
    const db = await getDb();
    if (!db) return respondJsonError(res, 503, "ฐานข้อมูลยังไม่พร้อม");
    const cursor = decodeCursor(req.query.cursor);
    if (cursor === false)
      return respondJsonError(res, 400, "ตัวชี้หน้าไม่ถูกต้อง");
    const rawLimit = Number(req.query.limit ?? PAGE_SIZE);
    const limit = Number.isInteger(rawLimit)
      ? Math.max(1, Math.min(rawLimit, MAX_PAGE_SIZE))
      : PAGE_SIZE;
    try {
      const [creator] = await db
        .select({ userId: publicMediaCreators.userId })
        .from(publicMediaCreators)
        .where(eq(publicMediaCreators.id, req.params.id))
        .limit(1);
      if (!creator)
        return respondJsonError(res, 404, "ไม่พบโปรไฟล์ผู้โพสต์นี้");
      const condition = and(
        eq(publicMedia.ownerUserId, creator.userId),
        cursor
          ? or(
              lt(publicMedia.createdAt, cursor.createdAt),
              and(
                eq(publicMedia.createdAt, cursor.createdAt),
                lt(publicMedia.id, cursor.id)
              )
            )
          : undefined
      );
      const rows = await db
        .select(mediaSelection)
        .from(publicMedia)
        .leftJoin(
          publicMediaCreators,
          eq(publicMedia.ownerUserId, publicMediaCreators.userId)
        )
        .leftJoin(
          publicMediaViewTotals,
          eq(publicMedia.id, publicMediaViewTotals.mediaId)
        )
        .where(condition)
        .orderBy(desc(publicMedia.createdAt), desc(publicMedia.id))
        .limit(limit + 1);
      const viewerId = await mediaAccount(req);
      const last = rows[Math.min(rows.length, limit) - 1];
      return res.json({
        items: rows.slice(0, limit).map(row => toSummary(row, viewerId)),
        nextCursor:
          rows.length > limit && last
            ? Buffer.from(
                JSON.stringify({
                  createdAt: last.createdAt.toISOString(),
                  id: last.id,
                })
              ).toString("base64url")
            : null,
      });
    } catch {
      return respondJsonError(res, 503, "โหลดโพสต์ของโปรไฟล์ไม่สำเร็จ");
    }
  });

  app.get("/api/media/:id", async (req, res) => {
    const id = req.params.id;
    if (!VALID_ID.test(id)) return respondJsonError(res, 404, "ไม่พบโพสต์นี้");
    const db = await getDb();
    if (!db) return respondJsonError(res, 503, "ฐานข้อมูลยังไม่พร้อม");

    try {
      const [row] = await db
        .select(mediaSelection)
        .from(publicMedia)
        .leftJoin(
          publicMediaCreators,
          eq(publicMedia.ownerUserId, publicMediaCreators.userId)
        )
        .leftJoin(
          publicMediaViewTotals,
          eq(publicMedia.id, publicMediaViewTotals.mediaId)
        )
        .where(eq(publicMedia.id, id))
        .limit(1);
      if (!row) return respondJsonError(res, 404, "ไม่พบโพสต์นี้");
      return res.status(200).json(toSummary(row, await mediaAccount(req)));
    } catch (error) {
      console.error(
        "[Public media] Item lookup failed:",
        error instanceof Error ? error.message : "unknown error"
      );
      return respondJsonError(res, 503, "เปิดโพสต์ไม่สำเร็จ ลองใหม่อีกครั้ง");
    }
  });

  app.get("/api/media/:id/asset", async (req, res) => {
    const id = req.params.id;
    if (!VALID_ID.test(id)) return respondJsonError(res, 404, "ไม่พบไฟล์นี้");
    const db = await getDb();
    if (!db) return respondJsonError(res, 503, "ฐานข้อมูลยังไม่พร้อม");

    try {
      const [metadata] = await db
        .select({
          mimeType: publicMedia.mimeType,
          size: publicMedia.size,
          storageMode: publicMedia.storageMode,
        })
        .from(publicMedia)
        .where(eq(publicMedia.id, id))
        .limit(1);
      if (!metadata) return respondJsonError(res, 404, "ไม่พบไฟล์นี้");
      const commonHeaders = {
        "Content-Type": metadata.mimeType,
        "Accept-Ranges": "bytes",
        "Content-Disposition": "inline",
      };
      const range = parsePublicMediaRange(req.get("range"), metadata.size);
      if (range === "invalid") {
        res.setHeader("Content-Range", `bytes */${metadata.size}`);
        return res.status(416).end();
      }
      if (metadata.storageMode === "chunks") {
        await streamChunkedAsset(
          db,
          res,
          id,
          metadata.size,
          metadata.mimeType,
          range
        );
        return;
      }
      if (range) {
        const [part] = await db
          .select({
            body: sql<Buffer>`SUBSTRING(${publicMedia.data}, ${range.start + 1}, ${range.end - range.start + 1})`,
          })
          .from(publicMedia)
          .where(eq(publicMedia.id, id))
          .limit(1);
        if (!part) return respondJsonError(res, 404, "ไม่พบไฟล์นี้");
        const body = Buffer.isBuffer(part.body)
          ? part.body
          : Buffer.from(part.body);
        return res
          .status(206)
          .set({
            ...commonHeaders,
            "Content-Length": String(body.length),
            "Content-Range": `bytes ${range.start}-${range.end}/${metadata.size}`,
          })
          .end(body);
      }
      const [row] = await db
        .select({ data: publicMedia.data })
        .from(publicMedia)
        .where(eq(publicMedia.id, id))
        .limit(1);
      if (!row) return respondJsonError(res, 404, "ไม่พบไฟล์นี้");
      const data = Buffer.isBuffer(row.data) ? row.data : Buffer.from(row.data);
      return res
        .status(200)
        .set({ ...commonHeaders, "Content-Length": String(data.length) })
        .end(data);
    } catch (error) {
      console.error(
        "[Public media] Asset read failed:",
        error instanceof Error ? error.message : "unknown error"
      );
      if (res.headersSent) {
        res.destroy();
        return;
      }
      return respondJsonError(res, 503, "เปิดไฟล์ไม่สำเร็จ ลองใหม่อีกครั้ง");
    }
  });

  const rawUploadParser = express.raw({
    type: "application/octet-stream",
    limit: String(LEGACY_UPLOAD_BYTES),
  });
  let activeUploadRequests = 0;
  app.post("/api/media", (req, res) => {
    if (activeUploadRequests >= MAX_CONCURRENT_UPLOADS) {
      res.setHeader("Retry-After", "3");
      return respondJsonError(
        res,
        429,
        "มีคำขออัปโหลดพร้อมกันมาก กรุณาลองใหม่อีกครั้ง"
      );
    }
    activeUploadRequests += 1;
    let released = false;
    const releaseSlot = () => {
      if (released) return;
      released = true;
      activeUploadRequests -= 1;
    };
    res.once("close", releaseSlot);
    rawUploadParser(req, res, (error?: unknown) => {
      if (error) {
        releaseSlot();
        const status =
          typeof error === "object" && error !== null && "status" in error
            ? Number(error.status)
            : 400;
        const httpStatus = status === 413 ? 413 : 400;
        return respondJsonError(
          res,
          httpStatus,
          httpStatus === 413
            ? "กรุณารีโหลดหน้าโพสต์เพื่ออัปโหลดแบบแบ่งส่วนได้ถึง 1,000 MB"
            : "อ่านไฟล์อัปโหลดไม่สำเร็จ"
        );
      }
      void uploadPublicMedia(req, res)
        .catch((cause: unknown) => {
          console.error(
            "[Public media] Upload route failed:",
            cause instanceof Error ? cause.message : "unknown error"
          );
          if (!res.headersSent)
            respondJsonError(
              res,
              500,
              "บันทึกโพสต์ไม่สำเร็จ ลองอีกครั้งภายหลัง"
            );
        })
        .finally(releaseSlot);
    });
  });

  app.post("/api/media/:id/claim", async (req, res) => {
    const id = req.params.id;
    if (!VALID_ID.test(id)) return respondJsonError(res, 404, "ไม่พบโพสต์นี้");
    if (req.get("X-Khing-Media-Account") !== "1")
      return respondJsonError(res, 403, "คำขอผูกบัญชีไม่ถูกต้อง");
    const userId = await mediaAccount(req);
    if (userId === null)
      return respondJsonError(res, 401, "เข้าสู่ระบบก่อนผูกโพสต์กับบัญชี");
    const db = await getDb();
    if (!db) return respondJsonError(res, 503, "ฐานข้อมูลยังไม่พร้อม");
    try {
      const result = await db.transaction(async tx => {
        const [account] = await tx
          .select({ id: users.id })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1)
          .for("update");
        if (!account) return 401;
        const [row] = await tx
          .select({
            ownerUserId: publicMedia.ownerUserId,
            deleteTokenHash: publicMedia.deleteTokenHash,
          })
          .from(publicMedia)
          .where(eq(publicMedia.id, id))
          .limit(1)
          .for("update");
        if (!row) return 404;
        if (
          !canClaimMedia(
            row.ownerUserId,
            userId,
            req.get("X-Delete-Token") ?? "",
            row.deleteTokenHash
          )
        )
          return 403;
        await ensureMediaCreator(tx, userId);
        await tx
          .update(publicMedia)
          .set({ ownerUserId: userId })
          .where(eq(publicMedia.id, id));
        return 204;
      });
      if (result !== 204)
        return respondJsonError(
          res,
          result,
          result === 404 ? "ไม่พบโพสต์นี้" : "ไม่มีสิทธิ์ผูกโพสต์นี้กับบัญชี"
        );
      return res.status(204).end();
    } catch {
      return respondJsonError(res, 503, "ผูกโพสต์ไม่สำเร็จ กรุณาลองใหม่");
    }
  });

  app.delete("/api/media/:id", async (req, res) => {
    const id = req.params.id;
    if (!VALID_ID.test(id)) return respondJsonError(res, 404, "ไม่พบโพสต์นี้");
    const token = req.get("x-delete-token") ?? "";
    const userId =
      req.get("X-Khing-Media-Account") === "1" ? await mediaAccount(req) : null;
    const db = await getDb();
    if (!db) return respondJsonError(res, 503, "ฐานข้อมูลยังไม่พร้อม");
    try {
      const result = await db.transaction(async tx => {
        const [row] = await tx
          .select({
            ownerUserId: publicMedia.ownerUserId,
            deleteTokenHash: publicMedia.deleteTokenHash,
          })
          .from(publicMedia)
          .where(eq(publicMedia.id, id))
          .limit(1)
          .for("update");
        if (!row) return 404;
        if (
          !(userId !== null && row.ownerUserId === userId) &&
          !validMediaToken(token, row.deleteTokenHash)
        )
          return 403;
        await tx.delete(publicMedia).where(eq(publicMedia.id, id));
        return 204;
      });
      if (result !== 204)
        return respondJsonError(
          res,
          result,
          result === 404 ? "โพสต์นี้อาจถูกลบไปแล้ว" : "ไม่มีสิทธิ์ลบโพสต์นี้"
        );
      return res.status(204).end();
    } catch {
      return respondJsonError(res, 503, "ลบโพสต์ไม่สำเร็จ ลองใหม่อีกครั้ง");
    }
  });
}
