import { describe, expect, it } from "vitest";
import {
  ensureMediaCreator,
  creatorProjection,
  syncPublishedCreator,
} from "./mediaCreator";
import { publicMediaCreators, users, userProfiles } from "../drizzle/schema";

function mockDb(rows: unknown[][]) {
  const tables: unknown[] = [],
    writes: { table: unknown; value: any }[] = [],
    locks: unknown[] = [];
  const db: any = {
    select: () => {
      let table: unknown;
      const q: any = {
        from: (t: unknown) => {
          table = t;
          tables.push(t);
          return q;
        },
        where: () => q,
        limit: () => q,
        for: () => {
          locks.push(table);
          return q;
        },
        then: (r: any) => Promise.resolve(rows.shift() ?? []).then(r),
      };
      return q;
    },
    insert: (table: unknown) => ({
      values: async (value: any) => {
        writes.push({ table, value });
      },
    }),
    update: (table: unknown) => ({
      set: (value: any) => ({
        where: async () => {
          writes.push({ table, value });
        },
      }),
    }),
  };
  return { db, tables, writes, locks };
}

describe("server-owned publishing identity", () => {
  it("publishes only the stored name handle avatar and stable random public ID", async () => {
    const m = mockDb([
      [
        {
          id: 7,
          name: "account",
          email: "secret@example.com",
          openId: "secret",
        },
      ],
      [
        {
          displayName: "ชื่อโปรไฟล์",
          handle: "my_name",
          avatar: Buffer.from([1]),
          avatarMime: "image/png",
          bio: "PRIVATE",
          location: "PRIVATE",
          cover: Buffer.from([2]),
        },
      ],
      [],
    ]);
    const result = await ensureMediaCreator(m.db, 7);
    expect(result).toEqual({
      id: expect.stringMatching(/^[a-f0-9]{32}$/),
      displayName: "ชื่อโปรไฟล์",
      handle: "my_name",
      avatarUrl: expect.stringMatching(
        /^\/api\/media\/creators\/[a-f0-9]{32}\/avatar\?v=/
      ),
    });
    expect(m.locks).toEqual([users]);
    expect(m.tables).toEqual([users, userProfiles, publicMediaCreators]);
    expect(m.writes[0].value).toMatchObject({
      userId: 7,
      avatar: Buffer.from([1]),
    });
    expect(m.writes[0].value).not.toHaveProperty("bio");
    expect(JSON.stringify(result)).not.toMatch(/email|openId|userId|PRIVATE/);
  });
  it("uses a safe account fallback and reuses the creator ID on later posts", async () => {
    const m = mockDb([
      [{ id: 7, name: "mail@example.com" }],
      [],
      [{ id: "c".repeat(32) }],
    ]);
    const result = await ensureMediaCreator(m.db, 7);
    expect(result).toEqual({
      id: "c".repeat(32),
      displayName: "สมาชิกขิงขิง",
      handle: "",
      avatarUrl: null,
    });
    expect(m.writes[0].table).toBe(publicMediaCreators);
    expect(m.writes[0].value).not.toHaveProperty("userId");
  });
  it("fails closed for an account that no longer exists", async () => {
    const m = mockDb([[]]);
    await expect(ensureMediaCreator(m.db, 7)).rejects.toThrow();
    expect(m.writes).toEqual([]);
  });
  it("profile save only updates existing public identity and never copies other fields", async () => {
    const m = mockDb([]);
    await syncPublishedCreator(
      m.db,
      7,
      { displayName: "New", handle: "new_name", revision: "b".repeat(32) },
      null,
      false
    );
    expect(m.writes).toEqual([
      {
        table: publicMediaCreators,
        value: {
          displayName: "New",
          handle: "new_name",
          revision: "b".repeat(32),
        },
      },
    ]);
    await syncPublishedCreator(
      m.db,
      7,
      { displayName: "New", handle: "new_name", revision: "b".repeat(32) },
      null,
      true
    );
    expect(m.writes[1].value).toMatchObject({ avatar: null, avatarMime: null });
  });
  it("projection disallows executable avatar content and unsafe handles", () => {
    expect(
      creatorProjection({
        id: "c".repeat(32),
        displayName: "mail@example.com",
        handle: "a@private",
        avatarMime: "image/svg+xml",
        revision: "b".repeat(32),
      })
    ).toMatchObject({
      displayName: "สมาชิกขิงขิง",
      handle: "",
      avatarUrl: null,
    });
  });
});
