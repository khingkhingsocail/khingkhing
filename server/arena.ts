import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import express, { type Express, type Request, type Response } from "express";
import { and, eq, sql } from "drizzle-orm";
import { arenaEntries, arenaProfiles } from "../drizzle/schema";
import { getDb } from "./db";
import {
  arenaBoards,
  entryInputSchema,
  profileInputSchema,
  rankArenaEntries,
  validMonth,
  type ArenaBoard,
  type ArenaEntry,
  type ArenaProfile,
} from "../shared/arena";
import { detectPublicMediaKind } from "./media";
import { effectiveReview } from "./verification/core";
import { registerVerificationRoutes } from "./verification/routes";

const ID = /^[a-f0-9]{32}$/;
export function hashArenaToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
export function arenaTokenMatches(token: string, hash: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token) || !/^[a-f0-9]{64}$/.test(hash))
    return false;
  return timingSafeEqual(
    Buffer.from(hashArenaToken(token), "hex"),
    Buffer.from(hash, "hex")
  );
}
export function validArenaAvatar(avatar: string | null) {
  if (avatar === null) return true;
  const match =
    /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(
      avatar
    );
  if (!match) return false;
  const data = Buffer.from(match[2], "base64");
  return (
    data.length > 0 &&
    data.length <= 200 * 1024 &&
    detectPublicMediaKind(data, match[1]) === "image"
  );
}
export function customArenaBoard(input: {
  title: string;
  unit: string;
  direction: "higher" | "lower";
}): ArenaBoard {
  const title = input.title.trim().normalize("NFC");
  const unit = input.unit.trim().normalize("NFC");
  const identity = JSON.stringify([
    title.toLocaleLowerCase("th-TH"),
    unit.toLocaleLowerCase("th-TH"),
    input.direction,
  ]);
  return {
    key: `world:${createHash("sha256").update(identity).digest("hex").slice(0, 32)}`,
    category: "world",
    metric: "custom",
    title,
    unit,
    direction: input.direction,
  };
}
export function publicArenaProfile(
  row: typeof arenaProfiles.$inferSelect
): ArenaProfile {
  return {
    id: row.id,
    displayName: row.displayName,
    handle: row.handle,
    bio: row.bio,
    avatar: row.avatar,
    createdAt: row.createdAt.toISOString(),
  };
}
function entryOutput(
  row: typeof arenaEntries.$inferSelect,
  profile: typeof arenaProfiles.$inferSelect
): ArenaEntry {
  return {
    id: row.id,
    profileId: row.profileId,
    boardKey: row.boardKey,
    title: row.title,
    category: row.category,
    unit: row.unit,
    direction: row.direction,
    value: Number(row.value),
    period: row.period,
    observedAt: row.observedAt,
    evidenceUrl: row.evidenceUrl,
    ...effectiveReview(row, profile),
    revision: row.revision,
    updatedAt: row.updatedAt.toISOString(),
  };
}
function error(res: Response, status: number, message: string) {
  return res.status(status).json({ error: message });
}
function route(handler: (req: Request, res: Response) => Promise<unknown>) {
  return (req: Request, res: Response) => {
    void handler(req, res).catch(() => {
      if (!res.headersSent)
        error(res, 503, "เวทีขิงขิงยังไม่พร้อม ลองใหม่ภายหลัง");
    });
  };
}

export function registerArenaRoutes(app: Express) {
  const requests = new Map<string, { count: number; until: number }>();
  app.use("/api/arena", (_req, res, next) => {
    res.set({
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    next();
  });
  app.use("/api/arena", (req, res, next) => {
    if (["GET", "HEAD"].includes(req.method)) return next();
    const now = Date.now();
    for (const [key, state] of requests)
      if (state.until < now) requests.delete(key);
    const key = req.ip ?? "unknown";
    const state = requests.get(key) ?? { count: 0, until: now + 60000 };
    if (state.count >= 20 || requests.size > 10000) {
      res.setHeader("Retry-After", "60");
      return error(res, 429, "ส่งคำขอบ่อยเกินไป กรุณารอหนึ่งนาที");
    }
    state.count++;
    requests.set(key, state);
    next();
  });
  registerVerificationRoutes(app);
  app.use("/api/arena", express.json({ limit: "350kb" }));
  app.use(
    "/api/arena",
    (
      cause: unknown,
      _req: Request,
      res: Response,
      next: (cause?: unknown) => void
    ) => {
      if (cause) return error(res, 400, "ข้อมูลไม่ถูกต้องหรือรูปใหญ่เกินไป");
      next();
    }
  );
  app.get(
    "/api/arena/boards",
    route(async (_req, res) => {
      const db = await getDb();
      if (!db) return error(res, 503, "ฐานข้อมูลยังไม่พร้อม");
      const custom = await db
        .selectDistinct({
          key: arenaEntries.boardKey,
          title: arenaEntries.title,
          unit: arenaEntries.unit,
          direction: arenaEntries.direction,
        })
        .from(arenaEntries)
        .where(eq(arenaEntries.category, "world"));
      return res.json({
        boards: [
          ...arenaBoards,
          ...custom.map(b => ({ ...b, category: "world", metric: "custom" })),
        ],
      });
    })
  );
  app.post(
    "/api/arena/profiles",
    route(async (req, res) => {
      const parsed = profileInputSchema.safeParse(req.body);
      if (!parsed.success)
        return error(
          res,
          400,
          parsed.error.issues[0]?.message ?? "ข้อมูลโปรไฟล์ไม่ถูกต้อง"
        );
      if (!validArenaAvatar(parsed.data.avatar))
        return error(res, 400, "รูปต้องเป็น JPG/PNG/WebP ไม่เกิน 200 KiB");
      const db = await getDb();
      if (!db) return error(res, 503, "ฐานข้อมูลยังไม่พร้อม");
      const [existing] = await db
        .select({ id: arenaProfiles.id })
        .from(arenaProfiles)
        .where(eq(arenaProfiles.handle, parsed.data.handle))
        .limit(1);
      if (existing)
        return error(res, 409, "ชื่อผู้ใช้นี้ถูกใช้แล้ว กรุณาเลือกชื่ออื่น");
      const id = randomBytes(16).toString("hex");
      const editToken = randomBytes(32).toString("base64url");
      const now = new Date();
      try {
        await db.insert(arenaProfiles).values({
          id,
          ...parsed.data,
          editTokenHash: hashArenaToken(editToken),
          createdAt: now,
          updatedAt: now,
        });
      } catch (cause) {
        if (String(cause).includes("Duplicate"))
          return error(res, 409, "ชื่อผู้ใช้นี้ถูกใช้แล้ว");
        throw cause;
      }
      return res.status(201).json({
        profile: { id, ...parsed.data, createdAt: now.toISOString() },
        editToken,
      });
    })
  );
  app.get(
    "/api/arena/profiles/:id",
    route(async (req, res) => {
      if (!ID.test(req.params.id)) return error(res, 404, "ไม่พบโปรไฟล์");
      const db = await getDb();
      if (!db) return error(res, 503, "ฐานข้อมูลยังไม่พร้อม");
      const [profile] = await db
        .select()
        .from(arenaProfiles)
        .where(eq(arenaProfiles.id, req.params.id))
        .limit(1);
      if (!profile) return error(res, 404, "ไม่พบโปรไฟล์");
      const entries = await db
        .select()
        .from(arenaEntries)
        .where(eq(arenaEntries.profileId, profile.id))
        .orderBy(sql`${arenaEntries.period} DESC`);
      return res.json({
        profile: publicArenaProfile(profile),
        entries: entries.map(entry => entryOutput(entry, profile)),
      });
    })
  );
  app.patch(
    "/api/arena/profiles/:id",
    route(async (req, res) => {
      if (!ID.test(req.params.id)) return error(res, 404, "ไม่พบโปรไฟล์");
      const parsed = profileInputSchema.safeParse(req.body);
      if (!parsed.success)
        return error(
          res,
          400,
          parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง"
        );
      if (!validArenaAvatar(parsed.data.avatar))
        return error(res, 400, "รูปต้องเป็น JPG/PNG/WebP ไม่เกิน 200 KiB");
      const db = await getDb();
      if (!db) return error(res, 503, "ฐานข้อมูลยังไม่พร้อม");
      const [profile] = await db
        .select()
        .from(arenaProfiles)
        .where(eq(arenaProfiles.id, req.params.id))
        .limit(1);
      if (
        !profile ||
        !arenaTokenMatches(
          req.get("x-arena-token") ?? "",
          profile.editTokenHash
        )
      )
        return error(res, 403, "ไม่มีสิทธิ์แก้โปรไฟล์นี้");
      const [taken] = await db
        .select({ id: arenaProfiles.id })
        .from(arenaProfiles)
        .where(eq(arenaProfiles.handle, parsed.data.handle))
        .limit(1);
      if (taken && taken.id !== profile.id)
        return error(res, 409, "ชื่อผู้ใช้นี้ถูกใช้แล้ว");
      await db
        .update(arenaProfiles)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(eq(arenaProfiles.id, profile.id));
      return res.json({
        profile: { ...publicArenaProfile(profile), ...parsed.data },
      });
    })
  );
  app.post(
    "/api/arena/entries",
    route(async (req, res) => {
      const parsed = entryInputSchema.safeParse(req.body);
      if (!parsed.success)
        return error(
          res,
          400,
          parsed.error.issues[0]?.message ?? "ข้อมูลสถิติไม่ถูกต้อง"
        );
      const input = parsed.data;
      const db = await getDb();
      if (!db) return error(res, 503, "ฐานข้อมูลยังไม่พร้อม");
      const [profile] = await db
        .select()
        .from(arenaProfiles)
        .where(eq(arenaProfiles.id, input.profileId))
        .limit(1);
      if (
        !profile ||
        !arenaTokenMatches(
          req.get("x-arena-token") ?? "",
          profile.editTokenHash
        )
      )
        return error(res, 403, "ไม่มีสิทธิ์ลงสถิติให้โปรไฟล์นี้");
      let board = arenaBoards.find(b => b.key === input.boardKey);
      if (input.boardKey === "custom" && input.custom)
        board = customArenaBoard(input.custom);
      if (
        input.boardKey === "custom" ||
        (!board && input.boardKey.startsWith("world:"))
      ) {
        const [existing] = await db
          .select()
          .from(arenaEntries)
          .where(eq(arenaEntries.boardKey, board?.key ?? input.boardKey))
          .limit(1);
        if (existing)
          board = {
            key: existing.boardKey,
            category: "world",
            metric: "custom",
            title: existing.title,
            unit: existing.unit,
            direction: existing.direction,
          };
      }
      if (!board) return error(res, 400, "ไม่พบรายการแข่งขัน");
      const value = Number(input.value.toFixed(6));
      const now = new Date();
      const values = {
        profileId: profile.id,
        boardKey: board.key,
        title: board.title,
        category: board.category,
        unit: board.unit,
        direction: board.direction,
        value: value.toFixed(6),
        period: input.period,
        observedAt: input.observedAt,
        evidenceUrl: input.evidenceUrl,
        verification: "self-reported" as const,
        revision: randomBytes(16).toString("hex"),
        evidenceRevision: "initial",
        reviewStatus: "none",
        reviewSnapshot: null,
        verificationSnapshot: null,
        updatedAt: now,
      };
      await db
        .insert(arenaEntries)
        .values({ id: randomBytes(16).toString("hex"), ...values })
        .onDuplicateKeyUpdate({ set: values });
      const [savedEntry] = await db
        .select({ id: arenaEntries.id })
        .from(arenaEntries)
        .where(
          and(
            eq(arenaEntries.profileId, profile.id),
            eq(arenaEntries.boardKey, board.key),
            eq(arenaEntries.period, input.period),
            eq(arenaEntries.revision, values.revision)
          )
        )
        .limit(1);
      if (!savedEntry)
        return error(
          res,
          409,
          "สถิติถูกแก้จากอีกหน้าต่าง กรุณารีเฟรชก่อนแนบหลักฐาน"
        );
      return res.json({
        board,
        entryId: savedEntry.id,
        revision: values.revision,
        message: "บันทึกสถิติที่ผู้ใช้รายงานเองแล้ว",
      });
    })
  );
  app.get(
    "/api/arena/leaderboard",
    route(async (req, res) => {
      const key = typeof req.query.board === "string" ? req.query.board : "";
      const period =
        typeof req.query.period === "string" ? req.query.period : "";
      const verified = req.query.verification === "verified";
      if (!validMonth(period)) return error(res, 400, "เลือกเดือน YYYY-MM");
      const db = await getDb();
      if (!db) return error(res, 503, "ฐานข้อมูลยังไม่พร้อม");
      let board = arenaBoards.find(b => b.key === key);
      if (!board && /^world:[a-f0-9]{32}$/.test(key)) {
        const [entry] = await db
          .select()
          .from(arenaEntries)
          .where(eq(arenaEntries.boardKey, key))
          .limit(1);
        if (entry)
          board = {
            key,
            category: "world",
            metric: "custom",
            title: entry.title,
            unit: entry.unit,
            direction: entry.direction,
          };
      }
      if (!board) return error(res, 400, "ไม่พบรายการแข่งขัน");
      const condition = and(
        eq(arenaEntries.boardKey, board.key),
        eq(arenaEntries.period, period)
      );
      // All participants in one comparable board/period, not a partial feed page.
      const records = await db
        .select({ entry: arenaEntries, profile: arenaProfiles })
        .from(arenaEntries)
        .innerJoin(arenaProfiles, eq(arenaEntries.profileId, arenaProfiles.id))
        .where(condition);
      const ranked = rankArenaEntries(
        records
          .map(({ entry, profile }) => ({
            ...entryOutput(entry, profile),
            profile: publicArenaProfile(profile),
          }))
          .filter(entry =>
            verified
              ? entry.verification === "verified"
              : req.query.verification === "ai-supported"
                ? entry.reviewStatus === "supported"
                : true
          ),
        board.direction
      );
      return res.json({ items: ranked, total: ranked.length, board });
    })
  );
  app.use("/api/arena", (_req, res) => error(res, 404, "ไม่พบ API เวทีขิงขิง"));
}
