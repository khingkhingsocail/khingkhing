import express, { type Express, type Request, type Response } from "express";
import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNull,
  lt,
  or,
  sql,
} from "drizzle-orm";
import {
  chatAccounts,
  publicComments,
  publicMedia,
  users,
  userNotifications,
} from "../../drizzle/schema";
import {
  commentAuthorName,
  commentInput,
  type PublicComment,
  type CommentPage,
  type ReplyPage,
} from "../../shared/comments";
import { getDb } from "../db";
import { sdk } from "../_core/sdk";
import { CommentError, projectComment as output, replyRoot } from "./core";
import { buildNotificationRecipients } from "../notifications/core";

type DB = NonNullable<Awaited<ReturnType<typeof getDb>>>;
const fields = {
  id: publicComments.id,
  mediaId: publicComments.mediaId,
  authorId: publicComments.authorId,
  authorName: publicComments.authorName,
  text: publicComments.text,
  createdAt: publicComments.createdAt,
  parentId: publicComments.parentId,
  replyToName: publicComments.replyToName,
  deletedAt: publicComments.deletedAt,
};
function sequence(value: unknown) {
  if (
    typeof value !== "string" ||
    !/^[1-9]\d{0,9}$/.test(value) ||
    !Number.isSafeInteger(Number(value)) ||
    Number(value) > 2147483647
  )
    throw new CommentError(400, "ลำดับความคิดเห็นไม่ถูกต้อง");
  return Number(value);
}
function route(fn: (req: Request, res: Response) => Promise<unknown>) {
  return (req: Request, res: Response) => {
    void fn(req, res).catch(error => {
      if (!res.headersSent)
        res.status(error instanceof CommentError ? error.status : 503).json({
          error:
            error instanceof CommentError
              ? error.message
              : "ระบบความคิดเห็นไม่พร้อม กรุณาลองใหม่",
        });
    });
  };
}
async function dbReady(): Promise<DB> {
  const db = await getDb();
  if (!db) throw new CommentError(503, "ฐานข้อมูลยังไม่พร้อม");
  return db;
}
async function writer(req: Request) {
  if (req.get("X-Khing-Comments") !== "1")
    throw new CommentError(403, "คำขอความคิดเห็นไม่ถูกต้อง");
  try {
    const user = await sdk.authenticateRequest(req);
    if (user.isCron || !Number.isSafeInteger(user.id) || user.id <= 0)
      throw new Error();
    return user;
  } catch {
    throw new CommentError(401, "เข้าสู่ระบบขิงขิงก่อนแสดงความคิดเห็น");
  }
}
export function registerCommentRoutes(app: Express) {
  const router = express.Router();
  router.use((_req, res, next) => {
    res.set({
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    next();
  });
  router.use("/:mediaId", (req, res, next) => {
    if (!/^[a-f0-9]{32}$/.test(req.params.mediaId))
      return res.status(404).json({ error: "ไม่พบโพสต์สาธารณะนี้" });
    next();
  });
  router.use(express.json({ limit: "12kb" }));
  router.get(
    "/:mediaId",
    route(async (req, res) => {
      const before =
        req.query.before === undefined ? null : sequence(req.query.before);
      let viewerId: number | undefined;
      try {
        const viewer = await sdk.authenticateRequest(req);
        if (!viewer.isCron) viewerId = viewer.id;
      } catch {
        /* Reading public comments does not require login. */
      }
      const db = await dbReady();
      const page = await db.transaction(async tx => {
        const [media] = await tx
          .select({ id: publicMedia.id })
          .from(publicMedia)
          .where(eq(publicMedia.id, req.params.mediaId))
          .limit(1)
          .for("update");
        if (!media)
          throw new CommentError(
            404,
            "ไม่พบโพสต์สาธารณะนี้ หรือโพสต์ถูกลบแล้ว"
          );
        const active = and(
          eq(publicComments.mediaId, media.id),
          isNull(publicComments.deletedAt)
        );
        const rows = await tx
          .select(fields)
          .from(publicComments)
          .where(
            and(
              eq(publicComments.mediaId, media.id),
              isNull(publicComments.parentId),
              or(
                isNull(publicComments.deletedAt),
                sql`exists (select 1 from public_comments child where child.media_id = ${media.id} and child.parent_id = public_comments.id and child.deleted_at is null)`
              ),
              before ? lt(publicComments.id, before) : undefined
            )
          )
          .orderBy(desc(publicComments.id))
          .limit(31);
        const [total] = await tx
          .select({ count: sql<number>`count(*)` })
          .from(publicComments)
          .where(active);
        const items = rows.slice(0, 30);
        const counts = items.length
          ? await tx
              .select({
                parentId: publicComments.parentId,
                count: sql<number>`count(*)`,
              })
              .from(publicComments)
              .where(
                and(
                  eq(publicComments.mediaId, media.id),
                  inArray(
                    publicComments.parentId,
                    items.map(row => row.id)
                  ),
                  isNull(publicComments.deletedAt)
                )
              )
              .groupBy(publicComments.parentId)
          : [];
        return {
          comments: items.map(row =>
            output(
              row,
              viewerId,
              Number(counts.find(c => c.parentId === row.id)?.count ?? 0)
            )
          ),
          total: Number(total?.count ?? 0),
          nextCursor: rows.length > 30 ? items[items.length - 1].id : null,
        } satisfies CommentPage;
      });
      return res.json(page);
    })
  );
  router.get(
    "/:mediaId/:commentId/replies",
    route(async (req, res) => {
      const rootId = sequence(req.params.commentId),
        before =
          req.query.before === undefined ? null : sequence(req.query.before);
      let viewerId: number | undefined;
      try {
        const viewer = await sdk.authenticateRequest(req);
        if (!viewer.isCron) viewerId = viewer.id;
      } catch {}
      const db = await dbReady();
      const page = await db.transaction(async tx => {
        const [media] = await tx
          .select({ id: publicMedia.id })
          .from(publicMedia)
          .where(eq(publicMedia.id, req.params.mediaId))
          .limit(1)
          .for("update");
        if (!media) throw new CommentError(404, "ไม่พบโพสต์สาธารณะนี้");
        const [root] = await tx
          .select({ id: publicComments.id, parentId: publicComments.parentId })
          .from(publicComments)
          .where(
            and(
              eq(publicComments.id, rootId),
              eq(publicComments.mediaId, media.id)
            )
          )
          .limit(1);
        if (!root || root.parentId !== null)
          throw new CommentError(404, "ไม่พบเธรดความคิดเห็นนี้");
        const active = and(
          eq(publicComments.mediaId, media.id),
          eq(publicComments.parentId, rootId),
          isNull(publicComments.deletedAt)
        );
        const rows = await tx
          .select(fields)
          .from(publicComments)
          .where(
            and(active, before ? lt(publicComments.id, before) : undefined)
          )
          .orderBy(desc(publicComments.id))
          .limit(31);
        const [total] = await tx
          .select({ count: sql<number>`count(*)` })
          .from(publicComments)
          .where(active);
        const items = rows.slice(0, 30);
        return {
          replies: items.map(row => output(row, viewerId)),
          total: Number(total?.count ?? 0),
          nextCursor: rows.length > 30 ? items[items.length - 1].id : null,
        } satisfies ReplyPage;
      });
      return res.json(page);
    })
  );
  router.get(
    "/:mediaId/:commentId",
    route(async (req, res) => {
      const rootId = sequence(req.params.commentId);
      let viewerId: number | undefined;
      try {
        const viewer = await sdk.authenticateRequest(req);
        if (!viewer.isCron) viewerId = viewer.id;
      } catch {}
      const db = await dbReady();
      const comment = await db.transaction(async tx => {
        const [media] = await tx
          .select({ id: publicMedia.id })
          .from(publicMedia)
          .where(eq(publicMedia.id, req.params.mediaId))
          .limit(1)
          .for("update");
        if (!media) throw new CommentError(404, "ไม่พบโพสต์สาธารณะนี้");
        const [root] = await tx
          .select(fields)
          .from(publicComments)
          .where(
            and(
              eq(publicComments.mediaId, media.id),
              eq(publicComments.id, rootId),
              isNull(publicComments.parentId)
            )
          )
          .limit(1);
        if (!root) throw new CommentError(404, "ไม่พบเธรดความคิดเห็นนี้");
        const [count] = await tx
          .select({ count: sql<number>`count(*)` })
          .from(publicComments)
          .where(
            and(
              eq(publicComments.mediaId, media.id),
              eq(publicComments.parentId, rootId),
              isNull(publicComments.deletedAt)
            )
          );
        return output(root, viewerId, Number(count?.count ?? 0));
      });
      return res.json({ comment });
    })
  );
  router.post(
    "/:mediaId",
    route(async (req, res) => {
      const user = await writer(req);
      const parsed = commentInput.safeParse(req.body);
      if (!parsed.success)
        throw new CommentError(
          400,
          parsed.error.issues[0]?.message ?? "ความคิดเห็นไม่ถูกต้อง"
        );
      const { text, clientId, replyToId } = parsed.data,
        db = await dbReady();
      const result = await db.transaction(async tx => {
        const [media] = await tx
          .select({ id: publicMedia.id, ownerUserId: publicMedia.ownerUserId })
          .from(publicMedia)
          .where(eq(publicMedia.id, req.params.mediaId))
          .limit(1)
          .for("update");
        if (!media)
          throw new CommentError(
            404,
            "ไม่พบโพสต์สาธารณะนี้ หรือโพสต์ถูกลบแล้ว"
          );
        const [account] = await tx
          .select({ id: users.id, name: users.name })
          .from(users)
          .where(eq(users.id, user.id))
          .limit(1)
          .for("update");
        if (!account)
          throw new CommentError(
            401,
            "บัญชีนี้ยังไม่พร้อม กรุณาเข้าสู่ระบบใหม่"
          );
        const retry = and(
          eq(publicComments.mediaId, media.id),
          eq(publicComments.authorId, user.id),
          eq(publicComments.clientId, clientId)
        );
        const [existing] = await tx
          .select({ ...fields, replyToId: publicComments.replyToId })
          .from(publicComments)
          .where(retry)
          .limit(1);
        if (existing) {
          if (
            existing.deletedAt ||
            existing.text !== text ||
            (existing.replyToId ?? null) !== replyToId
          )
            throw new CommentError(
              409,
              "ข้อความนี้ถูกแก้ไขหรือลบแล้ว กรุณาส่งเป็นข้อความใหม่"
            );
          return { comment: output(existing, user.id), created: false };
        }
        let targetAuthorId: number | null = null;
        let parentId: number | null = null,
          replyToName: string | null = null;
        if (replyToId !== null) {
          const [target] = await tx
            .select({ ...fields })
            .from(publicComments)
            .where(
              and(
                eq(publicComments.id, replyToId),
                eq(publicComments.mediaId, media.id)
              )
            )
            .limit(1);
          let root:
            | { id: number; mediaId: string; parentId: number | null }
            | undefined;
          if (target?.parentId) {
            [root] = await tx
              .select({
                id: publicComments.id,
                mediaId: publicComments.mediaId,
                parentId: publicComments.parentId,
              })
              .from(publicComments)
              .where(
                and(
                  eq(publicComments.id, target.parentId),
                  eq(publicComments.mediaId, media.id)
                )
              )
              .limit(1);
          }
          parentId = replyRoot(media.id, target, root);
          replyToName = target.authorName;
          targetAuthorId = target.authorId;
        }
        const [recent] = await tx
          .select({ count: sql<number>`count(*)` })
          .from(publicComments)
          .where(
            and(
              eq(publicComments.authorId, user.id),
              gte(publicComments.createdAt, new Date(Date.now() - 60_000))
            )
          );
        if (Number(recent?.count ?? 0) >= 20)
          throw new CommentError(
            429,
            "ส่งความคิดเห็นบ่อยเกินไป รอสักครู่แล้วลองใหม่"
          );
        const [nickname] = await tx
          .select({ displayName: chatAccounts.displayName })
          .from(chatAccounts)
          .where(eq(chatAccounts.userId, user.id))
          .limit(1);
        await tx.insert(publicComments).values({
          mediaId: media.id,
          authorId: user.id,
          authorName: commentAuthorName(nickname?.displayName ?? account.name),
          text,
          clientId,
          parentId,
          replyToId,
          replyToName,
          createdAt: new Date(),
        });
        const [saved] = await tx
          .select(fields)
          .from(publicComments)
          .where(retry)
          .limit(1);
        if (!saved) throw new Error("Comment insert did not return a row");
        const recipients = buildNotificationRecipients(
          user.id,
          media.ownerUserId,
          targetAuthorId,
          replyToId !== null
        );
        if (recipients.length)
          await tx.insert(userNotifications).values(
            recipients.map(recipient => ({
              ...recipient,
              actorId: user.id,
              commentId: saved.id,
              mediaId: media.id,
              rootId: parentId ?? saved.id,
              createdAt: new Date(),
            }))
          );
        return { comment: output(saved, user.id), created: true };
      });
      return res
        .status(result.created ? 201 : 200)
        .json({ comment: result.comment });
    })
  );
  router.delete(
    "/:mediaId/:commentId",
    route(async (req, res) => {
      const user = await writer(req),
        id = sequence(req.params.commentId),
        db = await dbReady();
      await db.transaction(async tx => {
        const [media] = await tx
          .select({ id: publicMedia.id })
          .from(publicMedia)
          .where(eq(publicMedia.id, req.params.mediaId))
          .limit(1)
          .for("update");
        if (!media) throw new CommentError(404, "ไม่พบโพสต์สาธารณะนี้");
        const [row] = await tx
          .select({
            authorId: publicComments.authorId,
            deletedAt: publicComments.deletedAt,
          })
          .from(publicComments)
          .where(
            and(eq(publicComments.id, id), eq(publicComments.mediaId, media.id))
          )
          .limit(1)
          .for("update");
        if (!row) throw new CommentError(404, "ไม่พบความคิดเห็นนี้");
        if (row.authorId !== user.id)
          throw new CommentError(403, "ลบได้เฉพาะความคิดเห็นของตนเอง");
        if (!row.deletedAt)
          await tx
            .update(publicComments)
            .set({
              text: "",
              authorName: "ความคิดเห็นถูกลบ",
              replyToName: null,
              deletedAt: new Date(),
            })
            .where(
              and(
                eq(publicComments.id, id),
                eq(publicComments.authorId, user.id)
              )
            );
        await tx
          .update(publicComments)
          .set({ replyToName: null })
          .where(
            and(
              eq(publicComments.mediaId, media.id),
              eq(publicComments.replyToId, id)
            )
          );
      });
      return res.status(204).end();
    })
  );
  router.use((_req, res) =>
    res.status(404).json({ error: "ไม่พบ API ความคิดเห็นนี้" })
  );
  router.use(
    (
      error: unknown,
      _req: Request,
      res: Response,
      _next: express.NextFunction
    ) => {
      if (!res.headersSent)
        res
          .status((error as { status?: number })?.status === 413 ? 413 : 400)
          .json({ error: "ข้อมูลความคิดเห็นไม่ถูกต้องหรือมีขนาดใหญ่เกินไป" });
    }
  );
  app.use("/api/comments", router);
}
