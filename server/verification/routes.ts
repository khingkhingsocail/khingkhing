import { randomBytes } from "node:crypto";
import { createHash } from "node:crypto";
import express, { type Express, type Request, type Response } from "express";
import multer from "multer";
import { and, eq, gte, sql } from "drizzle-orm";
import {
  arenaEntries,
  arenaEvidence,
  arenaProfiles,
  arenaReviews,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { sdk } from "../_core/sdk";
import { arenaTokenMatches } from "../arena";
import { claimSnapshot, EvidenceError } from "./core";
import { inspectEvidence } from "./media";
import { inspectWithAI } from "./ai";
import {
  decisionSchema,
  MAX_EVIDENCE_BYTES,
  MAX_EVIDENCE_FILES,
  MAX_EVIDENCE_TOTAL_BYTES,
  reviewRequestSchema,
  type EvidenceReview,
  type ReviewStatus,
} from "../../shared/verification";

const ID = /^[a-f0-9]{32}$/;
const prefix = "/api/arena/verification";
let mediaSlots = 0;
let aiSlots = 0;
function randomId() {
  return randomBytes(16).toString("hex");
}
const evidenceFields = {
  id: arenaEvidence.id,
  entryId: arenaEvidence.entryId,
  claimRevision: arenaEvidence.claimRevision,
  filename: arenaEvidence.filename,
  kind: arenaEvidence.kind,
  mimeType: arenaEvidence.mimeType,
  size: arenaEvidence.size,
  sha256: arenaEvidence.sha256,
  duration: arenaEvidence.duration,
  createdAt: arenaEvidence.createdAt,
};
function respondError(res: Response, cause: unknown) {
  const status = cause instanceof EvidenceError ? cause.status : 503;
  res.status(status).json({
    error:
      cause instanceof EvidenceError
        ? cause.message
        : "ระบบตรวจหลักฐานยังไม่พร้อม กรุณาลองใหม่",
  });
}
function route(handler: (req: Request, res: Response) => Promise<unknown>) {
  return (req: Request, res: Response) => {
    void handler(req, res).catch(cause => {
      if (!res.headersSent) respondError(res, cause);
    });
  };
}
async function requireDb() {
  const db = await getDb();
  if (!db) throw new EvidenceError(503, "ฐานข้อมูลยังไม่พร้อม");
  return db;
}
async function requireAdmin(req: Request) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (user.role !== "admin" || user.isCron) throw new Error();
    return user;
  } catch {
    throw new EvidenceError(403, "ต้องเป็นผู้ดูแลที่เข้าสู่ระบบแล้ว");
  }
}
async function getEntryAccess(req: Request, id: string, ownerOnly = false) {
  if (!ID.test(id)) throw new EvidenceError(404, "ไม่พบสถิติ");
  const db = await requireDb();
  const [record] = await db
    .select({ entry: arenaEntries, profile: arenaProfiles })
    .from(arenaEntries)
    .innerJoin(arenaProfiles, eq(arenaEntries.profileId, arenaProfiles.id))
    .where(eq(arenaEntries.id, id))
    .limit(1);
  if (!record) throw new EvidenceError(404, "ไม่พบสถิติ");
  if (
    !arenaTokenMatches(
      req.get("x-arena-token") ?? "",
      record.profile.editTokenHash
    )
  ) {
    if (ownerOnly)
      throw new EvidenceError(403, "ต้องถือรหัสแก้โปรไฟล์เจ้าของสถิติ");
    await requireAdmin(req);
  }
  return { db, ...record };
}
function evidenceProjection(
  row: Omit<typeof arenaEvidence.$inferSelect, "data">,
  revision: string
) {
  return {
    id: row.id,
    entryId: row.entryId,
    filename: row.filename,
    kind: row.kind,
    mimeType: row.mimeType,
    size: row.size,
    sha256: row.sha256,
    duration: row.duration === null ? null : Number(row.duration),
    createdAt: row.createdAt.toISOString(),
    stale: row.claimRevision !== revision,
  };
}
function reviewProjection(
  row: typeof arenaReviews.$inferSelect,
  currentSnapshot: string
): EvidenceReview {
  const stale = row.snapshot !== currentSnapshot;
  const expired =
    row.status === "running" && Date.now() - row.createdAt.getTime() > 300000;
  return {
    id: row.id,
    entryId: row.entryId,
    snapshot: row.snapshot,
    status: (stale ? "stale" : expired ? "failed" : row.status) as ReviewStatus,
    report: row.report ? JSON.parse(row.report) : null,
    sources: row.sources ? JSON.parse(row.sources) : [],
    coverage: row.coverage ? JSON.parse(row.coverage) : [],
    model: row.model,
    error: expired ? "งานก่อนหน้าหมดเวลา สามารถลองใหม่ได้" : row.error,
    decision: row.decision,
    decisionReason: row.decisionReason,
    createdAt: row.createdAt.toISOString(),
    stale,
  };
}
export function registerVerificationRoutes(app: Express) {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: MAX_EVIDENCE_BYTES,
      files: 1,
      fields: 2,
      fieldSize: 1000,
    },
  }).single("file");
  app.post(
    prefix + "/entries/:id/evidence",
    route(async (req, res) => {
      const access = await getEntryAccess(req, req.params.id, true);
      if (mediaSlots >= 2)
        throw new EvidenceError(429, "มีงานประมวลผลหลักฐานอยู่ กรุณารอสักครู่");
      mediaSlots++;
      try {
        await new Promise<void>((resolve, reject) =>
          upload(req, res, cause =>
            cause
              ? reject(
                  new EvidenceError(
                    400,
                    "รับหลักฐานไม่ได้ จำกัด 20 MiB ต่อไฟล์"
                  )
                )
              : resolve()
          )
        );
        if (req.body?.consent !== "true")
          throw new EvidenceError(
            400,
            "ยืนยันให้จัดเก็บหลักฐานสำหรับการตรวจสอบก่อน"
          );
        const file = req.file;
        if (!file) throw new EvidenceError(400, "กรุณาเลือกภาพหรือวิดีโอ");
        const media = await inspectEvidence(file.buffer, file.mimetype);
        const revision = req.body?.revision;
        if (revision !== access.entry.revision)
          throw new EvidenceError(
            409,
            "สถิติเปลี่ยนแล้ว กรุณารีเฟรชก่อนส่งหลักฐาน"
          );
        const id = randomId();
        await access.db.transaction(async tx => {
          await tx
            .select({ id: arenaProfiles.id })
            .from(arenaProfiles)
            .where(eq(arenaProfiles.id, access.profile.id))
            .for("update")
            .limit(1);
          const [fresh] = await tx
            .select()
            .from(arenaEntries)
            .where(eq(arenaEntries.id, access.entry.id))
            .for("update")
            .limit(1);
          if (fresh.revision !== revision)
            throw new EvidenceError(409, "สถิติเปลี่ยนระหว่างส่งหลักฐาน");
          const records = await tx
            .select({ size: arenaEvidence.size })
            .from(arenaEvidence)
            .where(
              and(
                eq(arenaEvidence.entryId, fresh.id),
                eq(arenaEvidence.claimRevision, fresh.revision)
              )
            );
          if (
            records.length >= MAX_EVIDENCE_FILES ||
            records.reduce((s, r) => s + r.size, 0) + file.size >
              MAX_EVIDENCE_TOTAL_BYTES
          )
            throw new EvidenceError(
              400,
              "จำกัด 3 ไฟล์ รวม 50 MiB ต่อเวอร์ชันสถิติ"
            );
          const totals = await tx
            .select({ size: arenaEvidence.size })
            .from(arenaEvidence)
            .innerJoin(arenaEntries, eq(arenaEntries.id, arenaEvidence.entryId))
            .where(eq(arenaEntries.profileId, access.profile.id));
          if (
            totals.length >= 100 ||
            totals.reduce((s, r) => s + r.size, 0) + file.size >
              200 * 1024 * 1024
          )
            throw new EvidenceError(
              400,
              "หลักฐานทุกเวอร์ชันรวมได้ไม่เกิน 200 MiB และ 100 ไฟล์ต่อโปรไฟล์ กรุณาลบไฟล์เก่าก่อน"
            );
          await tx.insert(arenaEvidence).values({
            id,
            entryId: fresh.id,
            claimRevision: fresh.revision,
            filename:
              file.originalname
                .replace(/[^\p{L}\p{N}._ -]/gu, "")
                .slice(0, 100) || "evidence",
            kind: media.kind,
            mimeType: file.mimetype,
            size: file.size,
            data: file.buffer,
            sha256: createHash("sha256").update(file.buffer).digest("hex"),
            duration:
              media.duration === null ? null : media.duration.toFixed(3),
          });
          await tx
            .update(arenaEntries)
            .set({
              evidenceRevision: randomId(),
              reviewStatus: "none",
              reviewSnapshot: null,
              verification: "self-reported",
              verificationSnapshot: null,
            })
            .where(eq(arenaEntries.id, fresh.id));
        });
        return res
          .status(201)
          .json({ id, message: "เก็บหลักฐานส่วนตัวสำหรับการตรวจแล้ว" });
      } finally {
        mediaSlots--;
      }
    })
  );
  app.use(prefix, express.json({ limit: "20kb" }));
  app.get(
    prefix + "/entries/:id",
    route(async (req, res) => {
      const { db, entry, profile } = await getEntryAccess(req, req.params.id);
      const snapshot = claimSnapshot(entry, profile);
      const evidence = await db
        .select(evidenceFields)
        .from(arenaEvidence)
        .where(eq(arenaEvidence.entryId, entry.id))
        .orderBy(sql`${arenaEvidence.createdAt} DESC`);
      const reviews = await db
        .select()
        .from(arenaReviews)
        .where(eq(arenaReviews.entryId, entry.id))
        .orderBy(sql`${arenaReviews.createdAt} DESC`)
        .limit(20);
      return res.json({
        evidence: evidence.map(file =>
          evidenceProjection(file, entry.revision)
        ),
        reviews: reviews.map(r => reviewProjection(r, snapshot)),
        entryRevision: entry.revision,
        currentSnapshot: snapshot,
      });
    })
  );
  app.get(
    prefix + "/evidence/:id/file",
    route(async (req, res) => {
      if (!ID.test(req.params.id)) throw new EvidenceError(404, "ไม่พบหลักฐาน");
      const db = await requireDb();
      const [file] = await db
        .select(evidenceFields)
        .from(arenaEvidence)
        .where(eq(arenaEvidence.id, req.params.id))
        .limit(1);
      if (!file) throw new EvidenceError(404, "ไม่พบหลักฐาน");
      await getEntryAccess(req, file.entryId);
      const [binary] = await db
        .select({ data: arenaEvidence.data })
        .from(arenaEvidence)
        .where(eq(arenaEvidence.id, file.id))
        .limit(1);
      if (!binary) throw new EvidenceError(404, "หลักฐานถูกลบแล้ว");
      res.set({
        "Content-Type": file.mimeType,
        "Content-Length": String(file.size),
        "Content-Disposition": `inline; filename="evidence-${file.id}.${file.kind === "image" ? "jpg" : "mp4"}"`,
        "Cache-Control": "private, no-store",
      });
      return res.send(binary.data);
    })
  );
  app.delete(
    prefix + "/evidence/:id",
    route(async (req, res) => {
      const db = await requireDb();
      if (!ID.test(req.params.id)) throw new EvidenceError(404, "ไม่พบหลักฐาน");
      const [file] = await db
        .select({ id: arenaEvidence.id, entryId: arenaEvidence.entryId })
        .from(arenaEvidence)
        .where(eq(arenaEvidence.id, req.params.id))
        .limit(1);
      if (!file) throw new EvidenceError(404, "ไม่พบหลักฐาน");
      const access = await getEntryAccess(req, file.entryId, true);
      await db.transaction(async tx => {
        await tx
          .select({ id: arenaProfiles.id })
          .from(arenaProfiles)
          .where(eq(arenaProfiles.id, access.profile.id))
          .for("update")
          .limit(1);
        await tx
          .select()
          .from(arenaEntries)
          .where(eq(arenaEntries.id, access.entry.id))
          .for("update")
          .limit(1);
        await tx.delete(arenaEvidence).where(eq(arenaEvidence.id, file.id));
        await tx
          .update(arenaEntries)
          .set({
            evidenceRevision: randomId(),
            reviewStatus: "none",
            reviewSnapshot: null,
            verification: "self-reported",
            verificationSnapshot: null,
          })
          .where(eq(arenaEntries.id, file.entryId));
      });
      return res.json({ message: "ลบหลักฐานและยกเลิกผลตรวจเวอร์ชันเดิมแล้ว" });
    })
  );
  app.post(
    prefix + "/entries/:id/review",
    route(async (req, res) => {
      const input = reviewRequestSchema.safeParse(req.body);
      if (!input.success)
        throw new EvidenceError(
          400,
          "ต้องยืนยันการส่งหลักฐานและชื่อ/สถิติไป AI"
        );
      const access = await getEntryAccess(req, req.params.id, true);
      if (aiSlots >= 2)
        throw new EvidenceError(429, "AI มีงานตรวจอยู่ กรุณารอสักครู่");
      aiSlots++;
      let reviewId: string | undefined;
      try {
        const snapshot = claimSnapshot(access.entry, access.profile);
        await access.db.transaction(async tx => {
          const [freshProfile] = await tx
            .select()
            .from(arenaProfiles)
            .where(eq(arenaProfiles.id, access.profile.id))
            .for("update")
            .limit(1);
          const [fresh] = await tx
            .select()
            .from(arenaEntries)
            .where(eq(arenaEntries.id, access.entry.id))
            .for("update")
            .limit(1);
          if (claimSnapshot(fresh, freshProfile) !== snapshot)
            throw new EvidenceError(409, "ข้อมูลเปลี่ยนแล้ว กรุณารีเฟรช");
          const today = new Date();
          today.setUTCHours(0, 0, 0, 0);
          const daily = await tx
            .select({ attempts: arenaReviews.attempts })
            .from(arenaReviews)
            .where(
              and(
                eq(arenaReviews.profileId, access.profile.id),
                gte(arenaReviews.createdAt, today)
              )
            );
          const [previous] = await tx
            .select()
            .from(arenaReviews)
            .where(
              and(
                eq(arenaReviews.entryId, fresh.id),
                eq(arenaReviews.snapshot, snapshot)
              )
            )
            .limit(1);
          if (previous && previous.status !== "failed") {
            if (
              previous.status === "running" &&
              Date.now() - previous.createdAt.getTime() > 300000
            ) {
              await tx
                .update(arenaReviews)
                .set({ status: "failed", error: "งานเดิมหมดเวลา กรุณาลองใหม่" })
                .where(eq(arenaReviews.id, previous.id));
            } else
              throw new EvidenceError(
                409,
                "มีผลตรวจหรือกำลังตรวจเวอร์ชันนี้แล้ว เปลี่ยนหลักฐานเพื่อส่งใหม่"
              );
          }
          if (
            daily.reduce((sum, row) => sum + row.attempts, 0) >= 5 ||
            (previous?.attempts ?? 0) >= 3
          )
            throw new EvidenceError(
              429,
              "จำกัดตรวจ AI 5 ครั้งต่อโปรไฟล์ต่อวัน และ retry ไม่เกิน 3 ครั้งต่อเวอร์ชัน"
            );
          reviewId = previous?.id ?? randomId();
          const values = {
            entryId: fresh.id,
            profileId: access.profile.id,
            snapshot,
            status: "running",
            attempts: (previous?.attempts ?? 0) + 1,
            model: "pending",
            error: null,
            report: null,
            sources: null,
            coverage: null,
            decision: "pending" as const,
            decisionReason: null,
            reviewerId: null,
            decidedAt: null,
            createdAt: new Date(),
            completedAt: null,
          };
          if (previous)
            await tx
              .update(arenaReviews)
              .set(values)
              .where(eq(arenaReviews.id, reviewId));
          else
            await tx.insert(arenaReviews).values({ id: reviewId, ...values });
          await tx
            .update(arenaEntries)
            .set({ reviewStatus: "running", reviewSnapshot: snapshot })
            .where(eq(arenaEntries.id, fresh.id));
        });
        const evidence = await access.db
          .select()
          .from(arenaEvidence)
          .where(
            and(
              eq(arenaEvidence.entryId, access.entry.id),
              eq(arenaEvidence.claimRevision, access.entry.revision)
            )
          );
        const result = await inspectWithAI(
          access.entry,
          access.profile,
          evidence,
          input.data.sourceUrls,
          input.data.publicLookup
        );
        await access.db
          .update(arenaReviews)
          .set({
            status: result.report.verdict,
            report: JSON.stringify(result.report),
            sources: JSON.stringify(result.sources),
            coverage: JSON.stringify(result.coverage),
            model: result.model,
            completedAt: new Date(),
          })
          .where(eq(arenaReviews.id, reviewId!));
        await access.db
          .update(arenaEntries)
          .set({
            reviewStatus: result.report.verdict,
            reviewSnapshot: snapshot,
          })
          .where(
            and(
              eq(arenaEntries.id, access.entry.id),
              eq(arenaEntries.revision, access.entry.revision),
              eq(arenaEntries.evidenceRevision, access.entry.evidenceRevision)
            )
          );
        return res.json({
          message: "AI ตรวจเสร็จแล้ว ผล AI ไม่ใช่การรับรองโดยผู้ดูแล",
          status: result.report.verdict,
        });
      } catch (cause) {
        if (reviewId) {
          await access.db
            .update(arenaReviews)
            .set({
              status: "failed",
              error: "ตรวจไม่สำเร็จ ไม่มีการรับรองสถิติ กรุณาลองใหม่",
              completedAt: new Date(),
            })
            .where(eq(arenaReviews.id, reviewId));
          await access.db
            .update(arenaEntries)
            .set({ reviewStatus: "failed" })
            .where(
              and(
                eq(arenaEntries.id, access.entry.id),
                eq(
                  arenaEntries.reviewSnapshot,
                  claimSnapshot(access.entry, access.profile)
                )
              )
            );
        }
        throw cause;
      } finally {
        aiSlots--;
      }
    })
  );
  app.get(
    prefix + "/admin/queue",
    route(async (req, res) => {
      await requireAdmin(req);
      const db = await requireDb();
      const records = await db
        .select({
          review: arenaReviews,
          entry: arenaEntries,
          profile: arenaProfiles,
        })
        .from(arenaReviews)
        .innerJoin(arenaEntries, eq(arenaEntries.id, arenaReviews.entryId))
        .innerJoin(arenaProfiles, eq(arenaProfiles.id, arenaEntries.profileId))
        .where(eq(arenaReviews.decision, "pending"))
        .orderBy(sql`${arenaReviews.createdAt} DESC`)
        .limit(100);
      return res.json({
        items: records.map(r => ({
          review: reviewProjection(r.review, claimSnapshot(r.entry, r.profile)),
          entry: {
            id: r.entry.id,
            title: r.entry.title,
            value: Number(r.entry.value),
            unit: r.entry.unit,
            period: r.entry.period,
            observedAt: r.entry.observedAt,
          },
          profile: {
            id: r.profile.id,
            displayName: r.profile.displayName,
            handle: r.profile.handle,
          },
        })),
      });
    })
  );
  app.post(
    prefix + "/reviews/:id/decision",
    route(async (req, res) => {
      const user = await requireAdmin(req);
      const input = decisionSchema.safeParse(req.body);
      if (!input.success)
        throw new EvidenceError(
          400,
          "ต้องระบุผลตัดสินและเหตุผลอย่างน้อย 10 ตัวอักษร"
        );
      if (!ID.test(req.params.id)) throw new EvidenceError(404, "ไม่พบผลตรวจ");
      const db = await requireDb();
      await db.transaction(async tx => {
        const [initial] = await tx
          .select()
          .from(arenaReviews)
          .where(eq(arenaReviews.id, req.params.id))
          .limit(1);
        if (!initial) throw new EvidenceError(404, "ไม่พบผลตรวจ");
        const [profile] = await tx
          .select()
          .from(arenaProfiles)
          .where(eq(arenaProfiles.id, initial.profileId))
          .for("update")
          .limit(1);
        if (
          arenaTokenMatches(
            req.get("x-arena-token") ?? "",
            profile.editTokenHash
          )
        )
          throw new EvidenceError(
            403,
            "ผู้ถือรหัสเจ้าของต้องให้ผู้ดูแลคนอื่นทบทวน"
          );
        const [entry] = await tx
          .select()
          .from(arenaEntries)
          .where(eq(arenaEntries.id, initial.entryId))
          .for("update")
          .limit(1);
        const [review] = await tx
          .select()
          .from(arenaReviews)
          .where(eq(arenaReviews.id, initial.id))
          .for("update")
          .limit(1);
        const snapshot = claimSnapshot(entry, profile);
        if (review.snapshot !== snapshot || input.data.snapshot !== snapshot)
          throw new EvidenceError(
            409,
            "หลักฐานหรือสถิติเปลี่ยนแล้ว ต้องตรวจเวอร์ชันใหม่"
          );
        if (
          review.decision !== "pending" ||
          ["running", "failed"].includes(review.status)
        )
          throw new EvidenceError(
            409,
            "รายการยังตรวจไม่เสร็จหรือถูกตัดสินแล้ว"
          );
        await tx
          .update(arenaReviews)
          .set({
            decision: input.data.decision,
            decisionReason: input.data.reason,
            reviewerId: user.id,
            decidedAt: new Date(),
          })
          .where(eq(arenaReviews.id, review.id));
        await tx
          .update(arenaEntries)
          .set({
            verification:
              input.data.decision === "approved" ? "verified" : "self-reported",
            verificationSnapshot:
              input.data.decision === "approved" ? snapshot : null,
          })
          .where(eq(arenaEntries.id, entry.id));
      });
      return res.json({ message: "บันทึกผลทบทวนโดยผู้ดูแลแล้ว" });
    })
  );
  app.use(prefix, (_req, res) =>
    res.status(404).json({ error: "ไม่พบ API ตรวจหลักฐาน" })
  );
  app.use(
    prefix,
    (
      cause: unknown,
      _req: Request,
      res: Response,
      _next: express.NextFunction
    ) => respondError(res, cause)
  );
}
