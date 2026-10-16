import { and, eq, sql } from "drizzle-orm";
import {
  publicMedia,
  publicMediaViewEvents,
  publicMediaViewTotals,
} from "../../drizzle/schema";
import type { getDb } from "../db";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
export const VIEW_EVENT_RETENTION_MS = 24 * 60 * 60 * 1000;
export async function recordMediaView(
  db: Db,
  mediaId: string,
  eventId: string,
  now = new Date()
) {
  return db.transaction(async tx => {
    // Same lock as post deletion: a view can never create an orphan counter.
    const [post] = await tx
      .select({ id: publicMedia.id })
      .from(publicMedia)
      .where(eq(publicMedia.id, mediaId))
      .limit(1)
      .for("update");
    if (!post) return null;
    await tx
      .insert(publicMediaViewTotals)
      .values({ mediaId, total: 0 })
      .onDuplicateKeyUpdate({
        set: { mediaId: sql`${publicMediaViewTotals.mediaId}` },
      });
    const [counter] = await tx
      .select({ total: publicMediaViewTotals.total })
      .from(publicMediaViewTotals)
      .where(eq(publicMediaViewTotals.mediaId, mediaId))
      .limit(1);
    const [event] = await tx
      .select({ createdAt: publicMediaViewEvents.createdAt })
      .from(publicMediaViewEvents)
      .where(
        and(
          eq(publicMediaViewEvents.mediaId, mediaId),
          eq(publicMediaViewEvents.eventId, eventId)
        )
      )
      .limit(1);
    if (event && +now - +event.createdAt < VIEW_EVENT_RETENTION_MS)
      return { mediaId, viewCount: counter.total, counted: false };
    if (counter.total >= 4294967295)
      throw new Error("View counter capacity reached");
    if (event)
      await tx
        .delete(publicMediaViewEvents)
        .where(
          and(
            eq(publicMediaViewEvents.mediaId, mediaId),
            eq(publicMediaViewEvents.eventId, eventId)
          )
        );
    await tx
      .insert(publicMediaViewEvents)
      .values({ mediaId, eventId, createdAt: now });
    await tx
      .update(publicMediaViewTotals)
      .set({ total: sql`${publicMediaViewTotals.total} + 1` })
      .where(eq(publicMediaViewTotals.mediaId, mediaId));
    return { mediaId, viewCount: counter.total + 1, counted: true };
  });
}
