import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { and, eq, gte, sql } from "drizzle-orm";
import {
  feedPreferenceEvents,
  feedPreferences,
  publicMedia,
  publicMediaCreators,
  users,
} from "../../drizzle/schema";
import {
  applyFeedSignal,
  emptyFeedPreferences,
  isFeedPreferences,
  parseFeedSignal,
  type FeedPreferences,
} from "../../shared/feedPersonalization";
import { getDb } from "../db";
import { sdk } from "../_core/sdk";

type FeedDB = NonNullable<Awaited<ReturnType<typeof getDb>>>;

const MAX_JSON_BYTES = 4 * 1024;
const MAX_DAILY_SIGNALS = 3000;
const REQUEST_WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 120;
const MAX_RATE_ENTRIES = 10_000;
const RATE_CLEANUP_INTERVAL_MS = 30_000;

class FeedError extends Error {
  constructor(
    public status: number,
    message: string,
    public retryAfter?: number
  ) {
    super(message);
  }
}

const requestRates = new Map<number, { count: number; until: number }>();
let nextRateCleanup = 0;

function withinRequestLimit(userId: number): boolean {
  const now = Date.now();
  if (now >= nextRateCleanup) {
    for (const [id, state] of requestRates) {
      if (state.until <= now) requestRates.delete(id);
    }
    nextRateCleanup = now + RATE_CLEANUP_INTERVAL_MS;
  }

  const current = requestRates.get(userId);
  if (current && current.until > now) {
    if (current.count >= MAX_REQUESTS_PER_WINDOW) return false;
    current.count += 1;
    return true;
  }
  if (!current && requestRates.size >= MAX_RATE_ENTRIES) return false;
  requestRates.set(userId, { count: 1, until: now + REQUEST_WINDOW_MS });
  return true;
}

function route(fn: (req: Request, res: Response) => Promise<unknown>) {
  return (req: Request, res: Response) => {
    void fn(req, res).catch((cause: unknown) => {
      if (res.headersSent) return;
      const error = cause instanceof FeedError ? cause : null;
      if (!error) console.error("[Feed personalization] Request failed");
      if (error?.retryAfter) res.set("Retry-After", String(error.retryAfter));
      res.status(error?.status ?? 503).json({
        error: error?.message ?? "ระบบแนะนำเนื้อหายังไม่พร้อม กรุณาลองใหม่",
      });
    });
  };
}

function setPrivateHeaders(_req: Request, res: Response, next: NextFunction) {
  res.set({
    "Cache-Control": "private, no-store",
    Pragma: "no-cache",
    "X-Content-Type-Options": "nosniff",
  });
  next();
}

async function authenticatedUserId(req: Request): Promise<number> {
  try {
    const user = await sdk.authenticateRequest(req);
    if (user.isCron || !Number.isSafeInteger(user.id) || user.id <= 0)
      throw new Error("Invalid account session");
    if (!withinRequestLimit(user.id))
      throw new FeedError(
        429,
        "ส่งคำขอถี่เกินไป กรุณารอสักครู่แล้วลองใหม่",
        Math.ceil(REQUEST_WINDOW_MS / 1000)
      );
    return user.id;
  } catch (cause) {
    if (cause instanceof FeedError) throw cause;
    throw new FeedError(401, "เข้าสู่ระบบขิงขิงก่อนใช้การแนะนำเนื้อหา");
  }
}

function authenticateBeforeBody(
  req: Request,
  res: Response,
  next: NextFunction
) {
  void authenticatedUserId(req)
    .then(userId => {
      res.locals.feedUserId = userId;
      next();
    })
    .catch((cause: unknown) => {
      if (res.headersSent) return;
      const error = cause instanceof FeedError ? cause : null;
      if (!error) console.error("[Feed personalization] Request failed");
      if (error?.retryAfter) res.set("Retry-After", String(error.retryAfter));
      res.status(error?.status ?? 503).json({
        error: error?.message ?? "ระบบแนะนำเนื้อหายังไม่พร้อม กรุณาลองใหม่",
      });
    });
}

async function dbReady(): Promise<FeedDB> {
  const db = await getDb();
  if (!db) throw new FeedError(503, "ฐานข้อมูลยังไม่พร้อม กรุณาลองใหม่ภายหลัง");
  return db;
}

function canonicalPreferences(value: unknown): FeedPreferences {
  if (!isFeedPreferences(value))
    throw new Error("Invalid stored feed preferences");
  return {
    version: 1,
    weights: Object.fromEntries(Object.entries(value.weights)),
    dismissed: [...value.dismissed],
  };
}

function decodePreferences(payload: string): FeedPreferences {
  try {
    return canonicalPreferences(JSON.parse(payload));
  } catch {
    throw new Error("Invalid stored feed preferences");
  }
}

function startOfUtcDay(now = new Date()): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
}

function bodySizeGuard(req: Request, res: Response, next: NextFunction) {
  const contentLength = req.get("content-length");
  if (contentLength !== undefined) {
    if (!/^\d+$/.test(contentLength))
      return res.status(400).json({ error: "ข้อมูลสัญญาณไม่ถูกต้อง" });
    const bytes = Number(contentLength);
    if (!Number.isSafeInteger(bytes) || bytes > MAX_JSON_BYTES)
      return res.status(413).json({ error: "ข้อมูลสัญญาณมีขนาดใหญ่เกินไป" });
  }
  next();
}

function parserError(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  if (res.headersSent) return;
  const status = (error as { status?: number })?.status === 413 ? 413 : 400;
  res.status(status).json({
    error:
      status === 413
        ? "ข้อมูลสัญญาณมีขนาดใหญ่เกินไป"
        : "ข้อมูลสัญญาณไม่ถูกต้อง",
  });
}

export function registerFeedPersonalizationRoutes(app: Express) {
  const router = express.Router();
  router.use(setPrivateHeaders);
  // Check the route marker before reading even a bounded JSON request body.
  router.use((_req, res, next) => {
    if (_req.get("X-Khing-Feed") !== "1")
      return res.status(403).json({ error: "คำขอแนะนำเนื้อหาไม่ถูกต้อง" });
    next();
  });

  router.get(
    "/me",
    route(async (req, res) => {
      const userId = await authenticatedUserId(req);
      const db = await dbReady();
      const [row] = await db
        .select({ payload: feedPreferences.payload })
        .from(feedPreferences)
        .where(eq(feedPreferences.userId, userId))
        .limit(1);
      const preferences = row
        ? decodePreferences(row.payload)
        : emptyFeedPreferences();
      return res.status(200).json({ preferences });
    })
  );

  router.post(
    "/signals",
    authenticateBeforeBody,
    bodySizeGuard,
    express.json({ limit: MAX_JSON_BYTES, strict: true }),
    route(async (req, res) => {
      const userId = res.locals.feedUserId as number;
      const signal = parseFeedSignal(req.body);
      if (!signal) throw new FeedError(400, "ข้อมูลสัญญาณไม่ถูกต้อง");
      const db = await dbReady();
      const preferences = await db.transaction(async tx => {
        // The owning user lock serializes first-time preference creation and signal retries.
        const [account] = await tx
          .select({ id: users.id })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1)
          .for("update");
        if (!account)
          throw new FeedError(401, "บัญชีนี้ยังไม่พร้อม กรุณาเข้าสู่ระบบใหม่");

        const [stored] = await tx
          .select({ payload: feedPreferences.payload })
          .from(feedPreferences)
          .where(eq(feedPreferences.userId, userId))
          .limit(1)
          .for("update");
        const current = stored
          ? decodePreferences(stored.payload)
          : emptyFeedPreferences();

        const [existing] = await tx
          .select({
            mediaId: feedPreferenceEvents.mediaId,
            action: feedPreferenceEvents.action,
          })
          .from(feedPreferenceEvents)
          .where(
            and(
              eq(feedPreferenceEvents.userId, userId),
              eq(feedPreferenceEvents.eventId, signal.eventId)
            )
          )
          .limit(1);
        if (existing) {
          if (
            existing.mediaId !== signal.mediaId ||
            existing.action !== signal.action
          )
            throw new FeedError(409, "รหัสสัญญาณนี้ถูกใช้กับข้อมูลอื่นแล้ว");
          return current;
        }

        const [media] = await tx
          .select({
            id: publicMedia.id,
            kind: publicMedia.kind,
            title: publicMedia.title,
            description: publicMedia.description,
            ownerUserId: publicMedia.ownerUserId,
            creatorId: publicMediaCreators.id,
          })
          .from(publicMedia)
          .leftJoin(
            publicMediaCreators,
            eq(publicMedia.ownerUserId, publicMediaCreators.userId)
          )
          .where(eq(publicMedia.id, signal.mediaId))
          .limit(1)
          .for("update");
        if (!media) throw new FeedError(404, "ไม่พบโพสต์สาธารณะนี้");

        const today = startOfUtcDay();
        const [daily] = await tx
          .select({ count: sql<number>`count(*)` })
          .from(feedPreferenceEvents)
          .where(
            and(
              eq(feedPreferenceEvents.userId, userId),
              gte(feedPreferenceEvents.createdAt, today)
            )
          );
        if (Number(daily?.count ?? 0) >= MAX_DAILY_SIGNALS) {
          const tomorrow = new Date(today.getTime() + 86_400_000);
          const retryAfter = Math.max(
            1,
            Math.ceil((tomorrow.getTime() - Date.now()) / 1000)
          );
          throw new FeedError(
            429,
            "ส่งสัญญาณครบจำนวนต่อวันแล้ว กรุณาลองใหม่พรุ่งนี้",
            retryAfter
          );
        }

        const source = {
          id: media.id,
          kind: media.kind,
          title: media.title,
          description: media.description,
          creator: media.creatorId
            ? {
                id: media.creatorId,
                displayName: "",
                handle: "",
                avatarUrl: null,
              }
            : null,
        };
        const next = canonicalPreferences(
          applyFeedSignal(current, source, signal.action)
        );
        const now = new Date();
        await tx.insert(feedPreferenceEvents).values({
          userId,
          eventId: signal.eventId,
          mediaId: signal.mediaId,
          action: signal.action,
          createdAt: now,
        });
        const payload = JSON.stringify(next);
        if (stored) {
          await tx
            .update(feedPreferences)
            .set({ payload, updatedAt: now })
            .where(eq(feedPreferences.userId, userId));
        } else {
          await tx.insert(feedPreferences).values({
            userId,
            payload,
            updatedAt: now,
          });
        }
        return next;
      });
      return res.status(200).json({ preferences });
    })
  );

  router.use((_req, res) =>
    res.status(404).json({ error: "ไม่พบเส้นทางแนะนำเนื้อหานี้" })
  );
  router.use(parserError);
  app.use("/api/feed-personalization", router);
}
