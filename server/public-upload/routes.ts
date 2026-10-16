import express, { type Express, type Request, type Response } from "express";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, lt, sql } from "drizzle-orm";
import {
  publicMedia,
  publicMediaCreators,
  publicMediaViewTotals,
  publicUploadChunks,
  publicUploadAllocator,
  publicUploadSessions,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { sdk } from "../_core/sdk";
import { validMediaToken } from "../mediaOwnership";
import { ensureMediaCreator, creatorProjection } from "../mediaCreator";
import {
  MAX_PUBLIC_MEDIA_BYTES,
  PUBLIC_UPLOAD_CHUNK_BYTES,
  PUBLIC_UPLOAD_SIZE_LABEL,
} from "../../shared/publicUpload";
import { normalizePublicUpload } from "./normalize";
import {
  expectedChunkSize,
  PublicUploadError,
  storeMediaChunks,
} from "./storage";
const validId = /^[a-f0-9]{32}$/;
const hash = (s: string | Buffer) =>
  createHash("sha256").update(s).digest("hex");
const safeText = (s: unknown, max: number) =>
  typeof s === "string"
    ? Array.from(s.replace(/[\u0000-\u001f\u007f]/g, " ").trim())
        .slice(0, max)
        .join("")
    : "";
async function account(req: Request) {
  try {
    const u = await sdk.authenticateRequest(req);
    return !u.isCron && Number.isSafeInteger(u.id) && u.id > 0 ? u.id : null;
  } catch {
    return null;
  }
}
async function authorizedSession(tx: any, req: Request, userId: number | null) {
  const [row] = await tx
    .select()
    .from(publicUploadSessions)
    .where(eq(publicUploadSessions.id, req.params.id))
    .limit(1)
    .for("update");
  if (!row || !validMediaToken(req.get("X-Upload-Token") ?? "", row.tokenHash))
    throw new PublicUploadError(403, "ไม่มีสิทธิ์ใช้งานการอัปโหลดนี้");
  if (row.ownerUserId !== null && row.ownerUserId !== userId)
    throw new PublicUploadError(401, "เข้าสู่ระบบบัญชีเดิมก่อนอัปโหลดต่อ");
  if (new Date(row.expiresAt).getTime() <= Date.now())
    throw new PublicUploadError(
      410,
      "การอัปโหลดหมดอายุ เลือกไฟล์อีกครั้งเพื่อเริ่มใหม่"
    );
  return row;
}
function fail(res: Response, cause: unknown) {
  const e = cause as { status?: number; message?: string };
  const status =
    Number.isInteger(e?.status) && e.status! >= 400 && e.status! < 500
      ? e.status!
      : 503;
  if (status === 503) console.error("[Public upload] Operation failed");
  if (!res.headersSent)
    res.status(status).json({
      error:
        status === 503
          ? "อัปโหลดไม่สำเร็จ กรุณาลองอีกครั้งโดยใช้ไฟล์เดิม"
          : e.message,
    });
}
export function registerPublicUploadRoutes(app: Express) {
  const router = express.Router();
  const starts = new Map<string, { count: number; until: number }>();
  let requests = 0;
  router.use((req, res, next) => {
    res.set({
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    if (req.get("X-Khing-Upload") !== "1")
      return res.status(403).json({ error: "คำขออัปโหลดไม่ถูกต้อง" });
    if (requests >= 8)
      return res
        .status(429)
        .json({ error: "มีคำขออัปโหลดพร้อมกันมาก กรุณาลองใหม่" });
    if (req.method === "POST" && req.path === "/") {
      const key = req.ip ?? req.socket.remoteAddress ?? "unknown";
      const now = Date.now();
      const current = starts.get(key);
      if (current && current.until > now && current.count >= 20)
        return res
          .status(429)
          .json({ error: "เริ่มอัปโหลดบ่อยเกินไป กรุณารอ 10 นาที" });
      if (starts.size > 10000)
        for (const [key, v] of starts) if (v.until <= now) starts.delete(key);
      if (starts.size > 10000 && !current)
        return res
          .status(429)
          .json({ error: "ระบบอัปโหลดมีผู้ใช้งานมาก กรุณาลองใหม่" });
      starts.set(key, {
        count: current && current.until > now ? current.count + 1 : 1,
        until: current && current.until > now ? current.until : now + 600000,
      });
    }
    requests++;
    let released = false;
    const release = () => {
      if (!released) {
        released = true;
        requests--;
      }
    };
    res.once("finish", release);
    res.once("close", release);
    next();
  });
  const json = express.json({ limit: "16kb" });
  const raw = express.raw({
    type: "application/octet-stream",
    limit: PUBLIC_UPLOAD_CHUNK_BYTES,
    inflate: false,
  });
  router.post("/", json, async (req, res) => {
    try {
      const size = req.body?.size;
      if (
        !Number.isSafeInteger(size) ||
        size <= 0 ||
        size > MAX_PUBLIC_MEDIA_BYTES
      )
        throw new PublicUploadError(
          413,
          `ไฟล์ต้องมีขนาดไม่เกิน ${PUBLIC_UPLOAD_SIZE_LABEL}`
        );
      const userId = await account(req);
      if (req.get("X-Khing-Media-Account") === "1" && userId === null)
        throw new PublicUploadError(401, "เข้าสู่ระบบก่อนโพสต์ด้วยบัญชีของคุณ");
      const db = await getDb();
      if (!db) throw new Error();
      // Staging is ephemeral. It is never public and expires after 24 h.
      const expired = await db
        .select({ id: publicUploadSessions.id })
        .from(publicUploadSessions)
        .where(lt(publicUploadSessions.expiresAt, new Date()))
        .limit(25);
      for (const row of expired)
        await db
          .delete(publicUploadSessions)
          .where(
            and(
              eq(publicUploadSessions.id, row.id),
              lt(publicUploadSessions.expiresAt, new Date())
            )
          );
      const id = randomBytes(16).toString("hex"),
        token = randomBytes(32).toString("base64url");
      await db.transaction(async tx => {
        await tx
          .insert(publicUploadAllocator)
          .values({ id: 1 })
          .onDuplicateKeyUpdate({ set: { id: 1 } });
        await tx
          .select({ id: publicUploadAllocator.id })
          .from(publicUploadAllocator)
          .where(eq(publicUploadAllocator.id, 1))
          .for("update");
        const [usage] = await tx
          .select({
            count: sql<number>`COUNT(*)`,
            bytes: sql<number>`COALESCE(SUM(${publicUploadSessions.size}),0)`,
          })
          .from(publicUploadSessions)
          .where(sql`${publicUploadSessions.state} <> 'complete'`);
        if (
          Number(usage?.count) >= 100 ||
          Number(usage?.bytes) + size > 2 * 1024 * 1024 * 1024
        )
          throw new PublicUploadError(
            429,
            "พื้นที่อัปโหลดชั่วคราวเต็ม กรุณาลองภายหลัง"
          );
        await tx.insert(publicUploadSessions).values({
          id,
          tokenHash: hash(token),
          ownerUserId: userId,
          title: safeText(req.body.title, 100) || "ผลงานใหม่",
          description: safeText(req.body.description, 240),
          filename: safeText(req.body.filename, 160),
          size,
          expiresAt: new Date(Date.now() + 86400000),
          updatedAt: new Date(),
        });
      });
      res
        .status(201)
        .json({ id, token, chunkBytes: PUBLIC_UPLOAD_CHUNK_BYTES });
    } catch (cause) {
      fail(res, cause);
    }
  });
  router.put("/:id/chunks/:index", raw, async (req, res) => {
    try {
      const index = Number(req.params.index);
      if (!validId.test(req.params.id) || !/^\d{1,2}$/.test(req.params.index))
        throw new PublicUploadError(400, "ลำดับส่วนของไฟล์ไม่ถูกต้อง");
      const data = req.body;
      if (!Buffer.isBuffer(data) || !data.length)
        throw new PublicUploadError(400, "ส่วนของไฟล์ว่างเปล่า");
      const userId = await account(req),
        db = await getDb();
      if (!db) throw new Error();
      await db.transaction(async tx => {
        const session = await authorizedSession(tx, req, userId);
        if (session.state !== "uploading")
          throw new PublicUploadError(409, "ไฟล์นี้เริ่มประมวลผลแล้ว");
        if (data.length !== expectedChunkSize(session.size, index))
          throw new PublicUploadError(400, "ขนาดส่วนของไฟล์ไม่ตรงกับต้นฉบับ");
        const [old] = await tx
          .select({ sha256: publicUploadChunks.sha256 })
          .from(publicUploadChunks)
          .where(
            and(
              eq(publicUploadChunks.uploadId, session.id),
              eq(publicUploadChunks.sequence, index)
            )
          )
          .limit(1);
        if (old && old.sha256 !== hash(data))
          throw new PublicUploadError(
            409,
            "ส่วนของไฟล์เดิมมีข้อมูลต่างกัน กรุณาเริ่มอัปโหลดใหม่"
          );
        if (!old)
          await tx.insert(publicUploadChunks).values({
            uploadId: session.id,
            sequence: index,
            sha256: hash(data),
            data,
          });
      });
      res.status(204).end();
    } catch (cause) {
      fail(res, cause);
    }
  });
  let active = 0;
  router.post("/:id/complete", async (req, res) => {
    if (!validId.test(req.params.id))
      return res.status(400).json({ error: "รหัสการอัปโหลดไม่ถูกต้อง" });
    if (active >= 2) {
      res.set("Retry-After", "5");
      return res
        .status(429)
        .json({ error: "กำลังประมวลผลไฟล์อื่น กรุณาลองอีกครั้ง" });
    }
    active++;
    let lease: string | null = null;
    let db: Awaited<ReturnType<typeof getDb>> = null;
    try {
      db = await getDb();
      if (!db) throw new Error();
      const userId = await account(req);
      const session = await db.transaction(async tx => {
        const row = await authorizedSession(tx, req, userId);
        if (row.state === "complete") return row;
        if (
          row.state === "processing" &&
          Date.now() - new Date(row.updatedAt).getTime() < 12 * 60000
        )
          throw new PublicUploadError(
            409,
            "ไฟล์กำลังประมวลผล กรุณารอสักครู่แล้วลองใหม่"
          );
        const [count] = await tx
          .select({ count: sql<number>`COUNT(*)` })
          .from(publicUploadChunks)
          .where(eq(publicUploadChunks.uploadId, row.id));
        if (
          Number(count?.count) !==
          Math.ceil(row.size / PUBLIC_UPLOAD_CHUNK_BYTES)
        )
          throw new PublicUploadError(
            409,
            "อัปโหลดไฟล์ยังไม่ครบ กรุณาส่งส่วนที่เหลือ"
          );
        lease = randomBytes(16).toString("hex");
        await tx
          .update(publicUploadSessions)
          .set({
            state: "processing",
            processingKey: lease,
            updatedAt: new Date(),
          })
          .where(eq(publicUploadSessions.id, row.id));
        return row;
      });
      const token = req.get("X-Upload-Token")!;
      const already = session.state === "complete";
      let creator: Awaited<ReturnType<typeof ensureMediaCreator>> | null = null;
      if (!already) {
        const buffers: Buffer[] = [];
        // Read one 4 MiB row at a time, not one >64 MiB result packet.
        for (
          let i = 0;
          i < Math.ceil(session.size / PUBLIC_UPLOAD_CHUNK_BYTES);
          i++
        ) {
          const [part] = await db
            .select({ data: publicUploadChunks.data })
            .from(publicUploadChunks)
            .where(
              and(
                eq(publicUploadChunks.uploadId, session.id),
                eq(publicUploadChunks.sequence, i)
              )
            )
            .limit(1);
          if (!part) throw new PublicUploadError(409, "ไฟล์อัปโหลดไม่ครบ");
          const buffer = Buffer.from(part.data);
          if (buffer.length !== expectedChunkSize(session.size, i))
            throw new PublicUploadError(409, "ส่วนของไฟล์ไม่ครบ");
          buffers.push(buffer);
        }
        const normalized = await normalizePublicUpload(
          Buffer.concat(buffers, session.size)
        );
        buffers.length = 0;
        await db.transaction(async tx => {
          const row = await authorizedSession(tx, req, userId);
          if (row.state !== "processing" || row.processingKey !== lease)
            throw new PublicUploadError(
              409,
              "การประมวลผลเวอร์ชันนี้หมดอายุแล้ว"
            );
          creator =
            session.ownerUserId !== null
              ? await ensureMediaCreator(tx, session.ownerUserId)
              : null;
          await tx.insert(publicMedia).values({
            id: session.id,
            title: session.title,
            description: session.description,
            kind: normalized.kind,
            mimeType: normalized.mimeType,
            size: normalized.data.length,
            data: Buffer.alloc(0),
            storageMode: "chunks",
            deleteTokenHash: hash(token),
            ownerUserId: session.ownerUserId,
            createdAt: new Date(),
          });
          await storeMediaChunks(tx, session.id, normalized.data);
          await tx
            .delete(publicUploadChunks)
            .where(eq(publicUploadChunks.uploadId, session.id));
          await tx
            .update(publicUploadSessions)
            .set({
              state: "complete",
              processingKey: null,
              updatedAt: new Date(),
            })
            .where(eq(publicUploadSessions.id, session.id));
        });
      }
      const [item] = await db
        .select({
          id: publicMedia.id,
          title: publicMedia.title,
          description: publicMedia.description,
          kind: publicMedia.kind,
          mimeType: publicMedia.mimeType,
          size: publicMedia.size,
          createdAt: publicMedia.createdAt,
          viewCount:
            sql<number>`COALESCE(${publicMediaViewTotals.total},0)`.mapWith(
              Number
            ),
        })
        .from(publicMedia)
        .leftJoin(
          publicMediaViewTotals,
          eq(publicMedia.id, publicMediaViewTotals.mediaId)
        )
        .where(eq(publicMedia.id, session.id))
        .limit(1);
      if (!item)
        throw new PublicUploadError(
          410,
          "โพสต์นี้ถูกลบแล้ว ไม่สามารถเผยแพร่ซ้ำได้"
        );
      if (already && session.ownerUserId !== null) {
        const [identity] = await db
          .select({
            id: publicMediaCreators.id,
            displayName: publicMediaCreators.displayName,
            handle: publicMediaCreators.handle,
            avatarMime: publicMediaCreators.avatarMime,
            revision: publicMediaCreators.revision,
          })
          .from(publicMediaCreators)
          .where(eq(publicMediaCreators.userId, session.ownerUserId))
          .limit(1);
        if (identity) creator = creatorProjection(identity);
      }
      res.status(already ? 200 : 201).json({
        item: {
          ...item,
          createdAt: item.createdAt.toISOString(),
          viewCount: 0,
          accountLinked: session.ownerUserId !== null,
          isMine:
            session.ownerUserId !== null && session.ownerUserId === userId,
          creator,
        },
        deleteToken: token,
      });
    } catch (cause) {
      if (lease && db) {
        try {
          await db
            .update(publicUploadSessions)
            .set({
              state: "uploading",
              processingKey: null,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(publicUploadSessions.id, req.params.id),
                eq(publicUploadSessions.processingKey, lease),
                eq(publicUploadSessions.state, "processing")
              )
            );
        } catch {
          /* Lease expires safely after interruption. */
        }
      }
      fail(res, cause);
    } finally {
      active--;
    }
  });
  router.use(
    (err: any, _req: Request, res: Response, _next: express.NextFunction) => {
      res.status(err?.status === 413 ? 413 : 400).json({
        error:
          err?.status === 413
            ? "ส่วนของไฟล์ใหญ่เกิน 4 MB"
            : "อ่านคำขออัปโหลดไม่สำเร็จ",
      });
    }
  );
  app.use("/api/media/uploads", router);
}
