import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import {
  arenaEntries,
  arenaPublicReferences,
  investmentPublicReferences,
  rankingViewEvents,
  rankingViewTotals,
} from "../../drizzle/schema";
import { arenaBoards, validMonth } from "../../shared/arena";
import {
  arenaReferenceSchema,
  referenceGroup,
} from "../../shared/arenaReferences";
import {
  investmentMetricGroup,
  investmentReferenceSchema,
} from "../../shared/investmentReferences";
import { rankingTargetId, type RankingTarget } from "../../shared/rankingViews";
import type { getDb } from "../db";
type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
export const EVENT_RETENTION_MS = 24 * 60 * 60 * 1000;
export function targetHash(target: RankingTarget) {
  return createHash("sha256").update(rankingTargetId(target)).digest("hex");
}
export async function rankingTargetExists(
  db: Db,
  target: RankingTarget
): Promise<boolean> {
  if (target.kind === "community-board") {
    const [board, period, extra] = target.key.split("|");
    if (extra !== undefined || !validMonth(period ?? "")) return false;
    if (arenaBoards.some(value => value.key === board)) return true;
    if (!/^world:[a-f0-9]{32}$/.test(board)) return false;
    return (
      (
        await db
          .select({ id: arenaEntries.id })
          .from(arenaEntries)
          .where(eq(arenaEntries.boardKey, board))
          .limit(1)
      ).length > 0
    );
  }
  if (target.kind === "community-entry") {
    if (!/^[a-f0-9]{32}$/.test(target.key)) return false;
    return (
      (
        await db
          .select({ id: arenaEntries.id })
          .from(arenaEntries)
          .where(eq(arenaEntries.id, target.key))
          .limit(1)
      ).length > 0
    );
  }
  if (target.kind === "reference-entry") {
    if (!/^[a-f0-9]{32}$/.test(target.key)) return false;
    return (
      (
        await db
          .select({ id: arenaPublicReferences.id })
          .from(arenaPublicReferences)
          .where(eq(arenaPublicReferences.id, target.key))
          .limit(1)
      ).length > 0
    );
  }
  if (target.kind === "reference-group") {
    const [row] = await db
      .select({
        id: arenaPublicReferences.id,
        payload: arenaPublicReferences.payload,
      })
      .from(arenaPublicReferences)
      .where(eq(arenaPublicReferences.groupKey, target.key))
      .limit(1);
    const parsed =
      row && arenaReferenceSchema.safeParse(JSON.parse(row.payload));
    return (
      !!parsed && parsed.success && referenceGroup(parsed.data) === target.key
    );
  }
  if (target.kind === "investment-entity") {
    if (!/^[a-z0-9-]{3,80}$/.test(target.key)) return false;
    return (
      (
        await db
          .select({ id: investmentPublicReferences.id })
          .from(investmentPublicReferences)
          .where(eq(investmentPublicReferences.id, target.key))
          .limit(1)
      ).length > 0
    );
  }
  const rows = await db
    .select({ payload: investmentPublicReferences.payload })
    .from(investmentPublicReferences)
    .where(eq(investmentPublicReferences.kind, "fund"))
    .limit(1000);
  return rows.some(row => {
    const parsed = investmentReferenceSchema.safeParse(JSON.parse(row.payload));
    return (
      parsed.success &&
      parsed.data.metrics.some(
        metric => investmentMetricGroup(metric) === target.key
      )
    );
  });
}
export async function recordRankingOpen(
  db: Db,
  target: RankingTarget,
  eventId: string,
  now = new Date()
) {
  const id = targetHash(target);
  return db.transaction(async tx => {
    // Atomic insert/no-op locks the aggregate before checking the event; serializes same-target writers.
    await tx
      .insert(rankingViewTotals)
      .values({
        id,
        kind: target.kind,
        targetKey: target.key,
        total: 0,
        updatedAt: now,
      })
      .onDuplicateKeyUpdate({ set: { id } });
    const [total] = await tx
      .select()
      .from(rankingViewTotals)
      .where(eq(rankingViewTotals.id, id))
      .for("update");
    const eventFilter = and(
      eq(rankingViewEvents.targetId, id),
      eq(rankingViewEvents.eventId, eventId)
    );
    const [existing] = await tx
      .select({ createdAt: rankingViewEvents.createdAt })
      .from(rankingViewEvents)
      .where(eventFilter)
      .limit(1);
    if (
      existing &&
      existing.createdAt.getTime() > now.getTime() - EVENT_RETENTION_MS
    )
      return { total: total.total, counted: false };
    if (total.total >= 4294967295) throw new Error("Counter capacity exceeded");
    if (existing) await tx.delete(rankingViewEvents).where(eventFilter);
    await tx
      .insert(rankingViewEvents)
      .values({ targetId: id, eventId, createdAt: now });
    await tx
      .update(rankingViewTotals)
      .set({ total: sql`${rankingViewTotals.total} + 1`, updatedAt: now })
      .where(eq(rankingViewTotals.id, id));
    return { total: total.total + 1, counted: true };
  });
}
