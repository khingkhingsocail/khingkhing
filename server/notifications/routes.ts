import express, { type Express, type Request, type Response } from "express";
import { and, desc, eq, isNull, lt, lte, sql } from "drizzle-orm";
import { z } from "zod";
import {
  publicComments,
  publicMedia,
  userNotifications,
} from "../../drizzle/schema";
import { commentAuthorName } from "../../shared/comments";
import {
  MAX_NOTIFICATION_ID,
  NOTIFICATION_PAGE_SIZE,
  type NotificationPage,
  type PublicNotification,
} from "../../shared/notifications";
import { getDb } from "../db";
import { sdk } from "../_core/sdk";

type DB = NonNullable<Awaited<ReturnType<typeof getDb>>>;

class NotificationError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

const throughInput = z
  .object({
    throughId: z.number().int().positive().max(MAX_NOTIFICATION_ID),
  })
  .strict();

function sequence(value: unknown): number {
  if (
    typeof value !== "string" ||
    !/^[1-9]\d{0,9}$/.test(value) ||
    !Number.isSafeInteger(Number(value)) ||
    Number(value) > MAX_NOTIFICATION_ID
  )
    throw new NotificationError(400, "ลำดับการแจ้งเตือนไม่ถูกต้อง");
  return Number(value);
}

function route(fn: (req: Request, res: Response) => Promise<unknown>) {
  return (req: Request, res: Response) => {
    void fn(req, res).catch(error => {
      if (!res.headersSent)
        res
          .status(error instanceof NotificationError ? error.status : 503)
          .json({
            error:
              error instanceof NotificationError
                ? error.message
                : "ระบบการแจ้งเตือนไม่พร้อม กรุณาลองใหม่",
          });
    });
  };
}

async function dbReady(): Promise<DB> {
  const db = await getDb();
  if (!db) throw new NotificationError(503, "ฐานข้อมูลยังไม่พร้อม");
  return db;
}

async function authenticatedUser(req: Request) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (user.isCron || !Number.isSafeInteger(user.id) || user.id <= 0)
      throw new Error("Not an application user");
    return user;
  } catch {
    throw new NotificationError(401, "เข้าสู่ระบบขิงขิงเพื่อดูการแจ้งเตือน");
  }
}

async function notificationWriter(req: Request) {
  const user = await authenticatedUser(req);
  if (req.get("X-Khing-Notifications") !== "1")
    throw new NotificationError(403, "คำขอการแจ้งเตือนไม่ถูกต้อง");
  return user;
}

function iso(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime()))
    throw new NotificationError(503, "ข้อมูลการแจ้งเตือนไม่ถูกต้อง");
  return date.toISOString();
}

function projectNotification(row: {
  id: number;
  kind: "comment" | "reply";
  actorName: string;
  text: string;
  mediaTitle: string;
  mediaId: string;
  commentId: number;
  rootId: number;
  createdAt: Date | string;
  readAt: Date | string | null;
}): PublicNotification {
  return {
    id: row.id,
    kind: row.kind,
    actorName: commentAuthorName(row.actorName),
    text: row.text,
    mediaTitle: row.mediaTitle,
    mediaId: row.mediaId,
    commentId: row.commentId,
    rootId: row.rootId,
    createdAt: iso(row.createdAt),
    readAt: row.readAt === null ? null : iso(row.readAt),
  };
}

function rejectUnexpectedQuery(req: Request) {
  if (Object.keys(req.query).some(key => key !== "before"))
    throw new NotificationError(400, "พารามิเตอร์การแจ้งเตือนไม่ถูกต้อง");
}

function emptyBody(req: Request) {
  if (req.body === undefined) return;
  if (!z.object({}).strict().safeParse(req.body).success)
    throw new NotificationError(400, "ข้อมูลการแจ้งเตือนไม่ถูกต้อง");
}

export function registerNotificationRoutes(app: Express) {
  const router = express.Router();
  router.use((_req, res, next) => {
    res.set({
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    next();
  });
  router.use(express.json({ limit: "8kb" }));

  router.get(
    "/",
    route(async (req, res) => {
      const user = await authenticatedUser(req);
      rejectUnexpectedQuery(req);
      const before =
        req.query.before === undefined ? null : sequence(req.query.before);
      const db = await dbReady();
      const joins = {
        comment: and(
          eq(publicComments.id, userNotifications.commentId),
          eq(publicComments.mediaId, userNotifications.mediaId),
          eq(publicComments.authorId, userNotifications.actorId)
        ),
      };
      const [summary] = await db
        .select({
          unread: sql<number>`coalesce(sum(case when ${userNotifications.readAt} is null then 1 else 0 end), 0)`,
          watermark: sql<number | null>`max(${userNotifications.id})`,
        })
        .from(userNotifications)
        .innerJoin(publicComments, joins.comment)
        .innerJoin(publicMedia, eq(publicMedia.id, userNotifications.mediaId))
        .where(
          and(
            eq(userNotifications.recipientId, user.id),
            isNull(publicComments.deletedAt)
          )
        );
      const rows = await db
        .select({
          id: userNotifications.id,
          kind: userNotifications.kind,
          actorName: publicComments.authorName,
          text: publicComments.text,
          mediaTitle: publicMedia.title,
          mediaId: userNotifications.mediaId,
          commentId: userNotifications.commentId,
          rootId: userNotifications.rootId,
          createdAt: userNotifications.createdAt,
          readAt: userNotifications.readAt,
        })
        .from(userNotifications)
        .innerJoin(publicComments, joins.comment)
        .innerJoin(publicMedia, eq(publicMedia.id, userNotifications.mediaId))
        .where(
          and(
            eq(userNotifications.recipientId, user.id),
            isNull(publicComments.deletedAt),
            before === null ? undefined : lt(userNotifications.id, before)
          )
        )
        .orderBy(desc(userNotifications.id))
        .limit(NOTIFICATION_PAGE_SIZE + 1);
      const pageRows = rows.slice(0, NOTIFICATION_PAGE_SIZE);
      const page: NotificationPage = {
        items: pageRows.map(projectNotification),
        nextCursor:
          rows.length > NOTIFICATION_PAGE_SIZE
            ? pageRows[pageRows.length - 1].id
            : null,
        unread: Math.max(0, Number(summary?.unread ?? 0)),
        watermark:
          summary?.watermark === null || summary?.watermark === undefined
            ? null
            : Number(summary.watermark),
      };
      return res.json(page);
    })
  );

  router.post(
    "/:id/read",
    route(async (req, res) => {
      const user = await notificationWriter(req);
      emptyBody(req);
      const id = sequence(req.params.id);
      const db = await dbReady();
      const readAt = await db.transaction(async tx => {
        const [row] = await tx
          .select({
            id: userNotifications.id,
            readAt: userNotifications.readAt,
          })
          .from(userNotifications)
          .where(
            and(
              eq(userNotifications.id, id),
              eq(userNotifications.recipientId, user.id)
            )
          )
          .limit(1)
          .for("update");
        if (!row) throw new NotificationError(404, "ไม่พบการแจ้งเตือนนี้");
        if (row.readAt) return iso(row.readAt);
        const changedAt = new Date();
        await tx
          .update(userNotifications)
          .set({ readAt: changedAt })
          .where(
            and(
              eq(userNotifications.id, id),
              eq(userNotifications.recipientId, user.id),
              isNull(userNotifications.readAt)
            )
          );
        return changedAt.toISOString();
      });
      return res.json({ readAt });
    })
  );

  router.post(
    "/read-all",
    route(async (req, res) => {
      const user = await notificationWriter(req);
      const parsed = throughInput.safeParse(req.body);
      if (!parsed.success)
        throw new NotificationError(400, "ลำดับการแจ้งเตือนไม่ถูกต้อง");
      const db = await dbReady();
      await db
        .update(userNotifications)
        .set({ readAt: new Date() })
        .where(
          and(
            eq(userNotifications.recipientId, user.id),
            lte(userNotifications.id, parsed.data.throughId),
            isNull(userNotifications.readAt)
          )
        );
      return res.json({ ok: true });
    })
  );

  router.use((_req, res) =>
    res.status(404).json({ error: "ไม่พบ API การแจ้งเตือนนี้" })
  );
  router.use(
    (
      error: unknown,
      _req: Request,
      res: Response,
      _next: express.NextFunction
    ) => {
      if (!res.headersSent) {
        const status =
          (error as { status?: number })?.status === 413 ? 413 : 400;
        res.status(status).json({
          error:
            status === 413
              ? "ข้อมูลการแจ้งเตือนมีขนาดใหญ่เกินไป"
              : "ข้อมูลการแจ้งเตือนไม่ถูกต้อง",
        });
      }
    }
  );
  app.use("/api/notifications", router);
}
