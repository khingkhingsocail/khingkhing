import { describe, expect, it } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import {
  publicMedia,
  publicMediaViewTotals,
  publicMediaViewEvents,
} from "../../drizzle/schema";
import { recordMediaView, VIEW_EVENT_RETENTION_MS } from "./core";
const dialect = new MySqlDialect();
function memoryDb() {
  const posts = new Set(["a", "b"]),
    totals = new Map<string, number>(),
    events = new Map<string, Date>();
  let lock: Promise<unknown> = Promise.resolve();
  const tx: any = {
    select: () => {
      let table: any, params: any[];
      const q: any = {
        from: (t: any) => {
          table = t;
          return q;
        },
        where: (condition: any) => {
          params = dialect.sqlToQuery(condition).params;
          return q;
        },
        limit: () =>
          table === publicMedia
            ? {
                for: async () =>
                  posts.has(params[0]) ? [{ id: params[0] }] : [],
              }
            : Promise.resolve(
                table === publicMediaViewTotals
                  ? [{ total: totals.get(params[0]) }]
                  : events.has(`${params[0]}|${params[1]}`)
                    ? [{ createdAt: events.get(`${params[0]}|${params[1]}`) }]
                    : []
              ),
      };
      return q;
    },
    insert: (table: any) => ({
      values: (value: any) =>
        table === publicMediaViewTotals
          ? {
              onDuplicateKeyUpdate: async () => {
                if (!totals.has(value.mediaId)) totals.set(value.mediaId, 0);
              },
            }
          : Promise.resolve(
              events.set(`${value.mediaId}|${value.eventId}`, value.createdAt)
            ),
    }),
    update: () => ({
      set: () => ({
        where: async (condition: any) => {
          const [id] = dialect.sqlToQuery(condition).params as string[];
          totals.set(id, totals.get(id)! + 1);
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
  return { db, posts, totals, events };
}
describe("atomic post view counter (isolated memory transaction emulator)", () => {
  it("counts concurrent unique events once each and serializes retries", async () => {
    const { db, totals } = memoryDb();
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        recordMediaView(db, "a", `event-${i}`)
      )
    );
    expect(totals.get("a")).toBe(20);
    expect(await recordMediaView(db, "a", "event-3")).toEqual({
      mediaId: "a",
      viewCount: 20,
      counted: false,
    });
  });
  it("keeps posts separate and expires events after 24 hours without resetting totals", async () => {
    const { db } = memoryDb(),
      now = new Date("2026-10-10T05:00:00Z");
    await recordMediaView(db, "a", "same", now);
    expect((await recordMediaView(db, "b", "same", now))?.viewCount).toBe(1);
    expect(
      (
        await recordMediaView(
          db,
          "a",
          "same",
          new Date(+now + VIEW_EVENT_RETENTION_MS)
        )
      )?.viewCount
    ).toBe(2);
  });
  it("cannot create orphan totals when a post was deleted", async () => {
    const { db, posts, totals, events } = memoryDb();
    posts.delete("a");
    expect(await recordMediaView(db, "a", "event")).toBeNull();
    expect(totals.size).toBe(0);
    expect(events.size).toBe(0);
  });
});
