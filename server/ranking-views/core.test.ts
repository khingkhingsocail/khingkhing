import { describe, expect, it } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import {
  arenaEntries,
  rankingViewEvents,
  rankingViewTotals,
} from "../../drizzle/schema";
import { rankingOpenSchema, rankingTargetId } from "../../shared/rankingViews";
import {
  EVENT_RETENTION_MS,
  rankingTargetExists,
  recordRankingOpen,
  targetHash,
} from "./core";
const target = {
  kind: "community-board" as const,
  key: "sports:run100|2026-10",
};
const dialect = new MySqlDialect();
// Transaction emulator uses a mutex. No public records/counters are written by these tests.
function memoryDb() {
  const totals = new Map<string, any>(),
    events = new Map<string, any>();
  let lock: Promise<unknown> = Promise.resolve();
  const tx: any = {
    insert: (table: any) => ({
      values: (value: any) =>
        table === rankingViewTotals
          ? {
              onDuplicateKeyUpdate: async () => {
                if (!totals.has(value.id)) totals.set(value.id, { ...value });
              },
            }
          : Promise.resolve(
              events.set(`${value.targetId}|${value.eventId}`, value)
            ),
    }),
    select: () => {
      let table: any,
        params: any[] = [];
      const query: any = {
        from: (value: any) => {
          table = value;
          return query;
        },
        where: (condition: any) => {
          params = dialect.sqlToQuery(condition).params;
          return query;
        },
        for: async () => [{ ...totals.get(params[0]) }],
        limit: async () => {
          const row = events.get(`${params[0]}|${params[1]}`);
          return row ? [row] : [];
        },
      };
      return query;
    },
    update: () => ({
      set: (value: any) => ({
        where: async (condition: any) => {
          const id = dialect.sqlToQuery(condition).params[0] as string;
          totals.set(id, {
            ...totals.get(id),
            total: totals.get(id).total + 1,
            updatedAt: value.updatedAt,
          });
        },
      }),
    }),
    delete: () => ({
      where: async (condition: any) => {
        const p = dialect.sqlToQuery(condition).params;
        events.delete(`${p[0]}|${p[1]}`);
      },
    }),
  };
  const db: any = {
    transaction: (fn: any) => {
      const result = lock.then(() => fn(tx));
      lock = result.catch(() => {});
      return result;
    },
  };
  return { db, totals, events };
}
describe("ranking opening atomic core", () => {
  it("serializes concurrent opens and ignores duplicate retry events", async () => {
    const { db, totals } = memoryDb();
    const now = new Date("2026-10-09T06:00:00Z");
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        recordRankingOpen(db, target, `event-${i}`, now)
      )
    );
    expect(results.map(result => result.total)).toEqual(
      Array.from({ length: 20 }, (_, i) => i + 1)
    );
    expect(totals.get(targetHash(target)).total).toBe(20);
    expect(await recordRankingOpen(db, target, "event-4", now)).toEqual({
      total: 20,
      counted: false,
    });
  });
  it("isolates board/period identity and allows expired UUID after retention", async () => {
    const { db } = memoryDb();
    const now = new Date("2026-10-09T06:00:00Z");
    await recordRankingOpen(db, target, "same", now);
    expect(
      (
        await recordRankingOpen(
          db,
          { ...target, key: "sports:run100|2026-09" },
          "same",
          now
        )
      ).total
    ).toBe(1);
    expect(
      (
        await recordRankingOpen(
          db,
          target,
          "same",
          new Date(+now + EVENT_RETENTION_MS + 1)
        )
      ).total
    ).toBe(2);
  });
  it("does not accept arbitrary targets, personal identifiers or client totals", async () => {
    expect(
      rankingOpenSchema.safeParse({
        target,
        eventId: "11111111-1111-4111-8111-111111111111",
        total: 999,
      }).success
    ).toBe(false);
    expect(rankingTargetId(target)).not.toEqual(
      rankingTargetId({ ...target, key: "sports:run100|2026-09" })
    );
    const db: any = {
      select: () => {
        const q: any = { from: () => q, where: () => q, limit: async () => [] };
        return q;
      },
    };
    expect(await rankingTargetExists(db, target)).toBe(true);
    expect(
      await rankingTargetExists(db, { ...target, key: "sports:run100|bad" })
    ).toBe(false);
    expect(
      await rankingTargetExists(db, { kind: "community-entry", key: "bad" })
    ).toBe(false);
    expect(
      await rankingTargetExists(db, {
        ...target,
        key: `world:${"a".repeat(32)}|2026-10`,
      })
    ).toBe(false);
    expect(
      await rankingTargetExists(db, {
        kind: "investment-entity",
        key: "user@example.com",
      })
    ).toBe(false);
  });
});
