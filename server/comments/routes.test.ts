import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
const state = vi.hoisted(() => ({
  results: [] as unknown[][],
  writes: [] as unknown[],
  tables: [] as unknown[],
  loggedIn: true,
  userId: 1,
  cron: false,
}));
vi.mock("../db", () => ({ getDb: async () => db }));
vi.mock("../_core/sdk", () => ({
  sdk: {
    authenticateRequest: async () => {
      if (!state.loggedIn) throw new Error();
      return { id: state.userId, isCron: state.cron };
    },
  },
}));
const db = {
  select: () => {
    const chain: any = {
      from: (table: unknown) => {
        state.tables.push(table);
        return chain;
      },
      where: () => chain,
      orderBy: () => chain,
      groupBy: () => chain,
      limit: () => chain,
      for: () => chain,
      then: (resolve: any) =>
        Promise.resolve(state.results.shift() ?? []).then(resolve),
    };
    return chain;
  },
  transaction: async (fn: any) => fn(db),
  insert: () => ({
    values: async (value: unknown) => {
      state.writes.push(value);
    },
  }),
  update: () => ({
    set: (value: unknown) => ({
      where: async () => {
        state.writes.push(value);
      },
    }),
  }),
};
import { registerCommentRoutes } from "./routes";
import { userProfiles } from "../../drizzle/schema";
const mediaId = "a".repeat(32),
  clientId = "11111111-1111-4111-8111-111111111111",
  now = new Date();
const comment = {
  id: 10,
  mediaId,
  authorId: 1,
  authorName: "Other User",
  text: "สวัสดี",
  createdAt: now,
  deletedAt: null,
  parentId: null,
  replyToId: null,
  replyToName: null,
};
let server: Server, origin: string;
beforeAll(async () => {
  const app = express();
  registerCommentRoutes(app);
  server = createServer(app);
  await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error();
  origin = `http://127.0.0.1:${addr.port}`;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>(r => server.close(() => r()));
});
beforeEach(() => {
  state.results = [];
  state.writes = [];
  state.tables = [];
  state.loggedIn = true;
  state.userId = 1;
  state.cron = false;
});
async function request(
  path = mediaId,
  method = "GET",
  body?: unknown,
  headers: Record<string, string> = { "X-Khing-Comments": "1" }
) {
  const res = await fetch(`${origin}/api/comments/${path}`, {
    method,
    headers: {
      ...headers,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return {
    status: res.status,
    body: await res.json().catch(() => null),
    headers: res.headers,
  };
}
const input = { clientId, text: "สวัสดี" };
describe("public comments and real account writes", () => {
  it("lets unauthenticated visitors read actual public comments without identity secrets", async () => {
    state.loggedIn = false;
    state.results.push(
      [{ id: mediaId }],
      [{ ...comment, email: "must-not-leak", openId: "secret", clientId }],
      [{ count: 1 }],
      []
    );
    const result = await request();
    expect(result.status).toBe(200);
    expect(result.body.total).toBe(1);
    expect(result.body.comments[0]).toEqual({
      id: 10,
      mediaId,
      isMine: false,
      authorName: "Other User",
      text: "สวัสดี",
      createdAt: now.toISOString(),
      parentId: null,
      replyToName: null,
      deleted: false,
      replyCount: 0,
    });
    expect(JSON.stringify(result.body)).not.toMatch(
      /must-not-leak|openId|clientId/
    );
    expect(result.headers.get("cache-control")).toContain("no-store");
  });
  it("publishes only ownership flags, never internal user identifiers", async () => {
    for (const viewerId of [1, 2]) {
      state.userId = viewerId;
      state.results.push([{ id: mediaId }], [comment], [{ count: 1 }], []);
      const result = await request();
      expect(result.body.comments[0].isMine).toBe(viewerId === 1);
      expect(result.body.comments[0]).not.toHaveProperty("authorId");
    }
  });
  it("blocks writes without real login or for cron identities", async () => {
    state.loggedIn = false;
    expect((await request(mediaId, "POST", input)).status).toBe(401);
    state.loggedIn = true;
    state.cron = true;
    expect((await request(mediaId, "POST", input)).status).toBe(401);
    expect(state.writes).toHaveLength(0);
  });
  it("requires anti-CSRF header and never trusts client author ID", async () => {
    expect((await request(mediaId, "POST", input, {})).status).toBe(403);
    expect(
      (await request(mediaId, "POST", { ...input, authorId: 2 })).status
    ).toBe(400);
    expect(state.writes).toHaveLength(0);
  });
  it("only opens existing public media, not private/demo/deleted posts", async () => {
    expect((await request("motion-study")).status).toBe(404);
    state.results.push([]);
    expect((await request()).status).toBe(404);
    state.results.push([]);
    expect((await request(mediaId, "POST", input)).status).toBe(404);
    expect(state.writes).toHaveLength(0);
  });
  it("persists a comment with authenticated server-selected author and readable public name", async () => {
    state.userId = 2;
    state.results.push(
      [{ id: mediaId }],
      [{ id: 2, name: "private@example.com" }],
      [],
      [{ count: 0 }],
      [{ displayName: "สมาชิกคนอื่น" }],
      [{ ...comment, authorId: 2, authorName: "สมาชิกคนอื่น" }]
    );
    const result = await request(mediaId, "POST", input);
    expect(result.status).toBe(201);
    expect(state.writes[0]).toEqual(
      expect.objectContaining({
        authorId: 2,
        mediaId,
        clientId,
        text: "สวัสดี",
        authorName: "สมาชิกคนอื่น",
      })
    );
    expect(result.body.comment.isMine).toBe(true);
    expect(result.body.comment).not.toHaveProperty("authorId");
  });
  it("safe retry returns original comment without creating duplicate or consuming quota", async () => {
    state.results.push([{ id: mediaId }], [{ id: 1, name: "Name" }], [comment]);
    const result = await request(mediaId, "POST", input);
    expect(result.status).toBe(200);
    expect(result.body.comment.id).toBe(10);
    expect(state.writes).toHaveLength(0);
  });
  it("rejects edited payload or deleted message reusing an old UUID", async () => {
    for (const row of [
      { ...comment, text: "other" },
      { ...comment, deletedAt: now },
    ]) {
      state.results.push([{ id: mediaId }], [{ id: 1 }], [row]);
      expect((await request(mediaId, "POST", input)).status).toBe(409);
    }
    expect(state.writes).toHaveLength(0);
  });
  it("checks per-account persisted quota before creating more comments", async () => {
    state.results.push([{ id: mediaId }], [{ id: 1 }], [], [{ count: 20 }]);
    expect((await request(mediaId, "POST", input)).status).toBe(429);
    expect(state.writes).toHaveLength(0);
  });
  it("rejects missing account row and invalid text before insert", async () => {
    expect(
      (await request(mediaId, "POST", { ...input, text: " " })).status
    ).toBe(400);
    expect(
      (await request(mediaId, "POST", { ...input, text: "a".repeat(1001) }))
        .status
    ).toBe(400);
    state.results.push([{ id: mediaId }], []);
    expect((await request(mediaId, "POST", input)).status).toBe(401);
    expect(state.writes).toHaveLength(0);
  });
  it("paginates newest first with stable numeric cursor and real total", async () => {
    const rows = Array.from({ length: 31 }, (_, i) => ({
      ...comment,
      id: 100 - i,
    }));
    state.results.push([{ id: mediaId }], rows, [{ count: 70 }], []);
    const first = await request();
    expect(first.body.comments).toHaveLength(30);
    expect(first.body.nextCursor).toBe(71);
    expect(first.body.total).toBe(70);
    state.results.push(
      [{ id: mediaId }],
      [{ ...comment, id: 70 }],
      [{ count: 70 }],
      []
    );
    const next = await request(`${mediaId}?before=71`);
    expect(next.body.comments[0].id).toBe(70);
    expect(next.body.nextCursor).toBeNull();
    expect((await request(`${mediaId}?before=not-id`)).status).toBe(400);
  });
  it("only the authenticated author can delete, even when caller is another user", async () => {
    state.userId = 2;
    state.results.push([{ id: mediaId }], [{ authorId: 1, deletedAt: null }]);
    expect((await request(`${mediaId}/10`, "DELETE")).status).toBe(403);
    expect(state.writes).toHaveLength(0);
    state.userId = 1;
    state.results.push([{ id: mediaId }], [{ authorId: 1, deletedAt: null }]);
    expect((await request(`${mediaId}/10`, "DELETE")).status).toBe(204);
    expect(state.writes[0]).toEqual({
      text: "",
      authorName: "ความคิดเห็นถูกลบ",
      replyToName: null,
      deletedAt: expect.any(Date),
    });
  });
  it("rejects over-size JSON and invalid ID before DB writes", async () => {
    expect(
      (await request(mediaId, "POST", { ...input, text: "a".repeat(13000) }))
        .status
    ).toBe(413);
    expect((await request(`${mediaId}/-1`, "DELETE")).status).toBe(400);
    expect(state.writes).toHaveLength(0);
  });
});

describe("reply API real-user relationship", () => {
  it("persists a reply to another user using server-resolved root and target", async () => {
    const reply = {
      ...comment,
      id: 20,
      authorId: 2,
      parentId: 10,
      replyToId: 10,
      replyToName: "Other User",
    };
    state.userId = 2;
    state.results.push(
      [{ id: mediaId }],
      [{ id: 2, name: "Responder" }],
      [],
      [comment],
      [{ count: 0 }],
      [],
      [reply]
    );
    const r = await request(mediaId, "POST", { ...input, replyToId: 10 });
    expect(r.status).toBe(201);
    expect(state.writes[0]).toEqual(
      expect.objectContaining({
        parentId: 10,
        replyToId: 10,
        replyToName: "Other User",
        authorId: 2,
      })
    );
    expect(r.body.comment.parentId).toBe(10);
  });
  it("replying to a reply remains under original root rather than nesting endlessly", async () => {
    const target = { ...comment, id: 20, parentId: 10, replyToId: 10 };
    const saved = { ...comment, id: 21, parentId: 10, replyToId: 20 };
    state.results.push(
      [{ id: mediaId }],
      [{ id: 1, name: "Name" }],
      [],
      [target],
      [comment],
      [{ count: 0 }],
      [],
      [saved]
    );
    const r = await request(mediaId, "POST", { ...input, replyToId: 20 });
    expect(r.status).toBe(201);
    expect(state.writes[0]).toEqual(
      expect.objectContaining({ parentId: 10, replyToId: 20 })
    );
  });
  it("rejects cross-post/deleted/missing reply targets before insert", async () => {
    for (const row of [
      [],
      [{ ...comment, mediaId: "b".repeat(32) }],
      [{ ...comment, deletedAt: now }],
    ]) {
      state.results.push([{ id: mediaId }], [{ id: 1 }], [], row);
      expect(
        (await request(mediaId, "POST", { ...input, replyToId: 10 })).status
      ).toBe(404);
    }
    expect(state.writes).toHaveLength(0);
  });
  it("includes reply target in UUID retry identity", async () => {
    const existing = { ...comment, parentId: 10, replyToId: 10 };
    state.results.push([{ id: mediaId }], [{ id: 1 }], [existing]);
    expect(
      (await request(mediaId, "POST", { ...input, replyToId: 11 })).status
    ).toBe(409);
    state.results.push([{ id: mediaId }], [{ id: 1 }], [existing]);
    expect(
      (await request(mediaId, "POST", { ...input, replyToId: 10 })).status
    ).toBe(200);
    expect(state.writes).toHaveLength(0);
  });
  it("reads a deleted root as tombstone and preserves other users' replies/count", async () => {
    state.results.push(
      [{ id: mediaId }],
      [{ ...comment, deletedAt: now }],
      [{ count: 3 }],
      [{ parentId: 10, count: 3 }]
    );
    const r = await request();
    expect(r.status).toBe(200);
    expect(r.body.comments[0]).toEqual(
      expect.objectContaining({
        deleted: true,
        replyCount: 3,
        text: "",
        authorName: "ความคิดเห็นถูกลบ",
      })
    );
  });
  it("paginates replies separately without requiring login or cutting a big thread", async () => {
    state.loggedIn = false;
    const rows = Array.from({ length: 31 }, (_, i) => ({
      ...comment,
      id: 100 - i,
      parentId: 10,
      replyToName: "Other User",
    }));
    state.results.push([{ id: mediaId }], [comment], rows, [{ count: 80 }]);
    const r = await request(`${mediaId}/10/replies`);
    expect(r.status).toBe(200);
    expect(r.body.replies).toHaveLength(30);
    expect(r.body.nextCursor).toBe(71);
    expect(r.body.total).toBe(80);
    expect(r.body.replies[0].isMine).toBe(false);
    state.results.push(
      [{ id: mediaId }],
      [comment],
      [{ ...comment, id: 70, parentId: 10 }],
      [{ count: 80 }]
    );
    const next = await request(`${mediaId}/10/replies?before=71`);
    expect(next.body.replies[0].id).toBe(70);
    expect(next.body.nextCursor).toBeNull();
  });
  it("rejects invalid root/cursor in reply reads and logged-out reply writes", async () => {
    state.results.push([{ id: mediaId }], [{ ...comment, parentId: 8 }]);
    expect((await request(`${mediaId}/10/replies`)).status).toBe(404);
    expect((await request(`${mediaId}/10/replies?before=no`)).status).toBe(400);
    state.loggedIn = false;
    expect(
      (await request(mediaId, "POST", { ...input, replyToId: 10 })).status
    ).toBe(401);
  });
});

describe("single-root refresh and deletion privacy", () => {
  it("refreshes an older thread root independently of first-page comments", async () => {
    state.results.push([{ id: mediaId }], [comment], [{ count: 12 }]);
    const r = await request(`${mediaId}/10`);
    expect(r.status).toBe(200);
    expect(r.body.comment.id).toBe(10);
    expect(r.body.comment.replyCount).toBe(12);
    expect(r.body.comment).not.toHaveProperty("authorId");
  });
  it("single-root reads reject missing or wrong-post roots", async () => {
    state.results.push([{ id: mediaId }], []);
    expect((await request(`${mediaId}/10`)).status).toBe(404);
    state.results.push([]);
    expect((await request(`${mediaId}/10`)).status).toBe(404);
  });
  it("deletion scrubs target-name snapshots without deleting other people's replies", async () => {
    state.results.push([{ id: mediaId }], [{ authorId: 1, deletedAt: null }]);
    expect((await request(`${mediaId}/10`, "DELETE")).status).toBe(204);
    expect(state.writes).toHaveLength(2);
    expect(state.writes[0]).toEqual(
      expect.objectContaining({
        text: "",
        authorName: "ความคิดเห็นถูกลบ",
        replyToName: null,
      })
    );
    expect(state.writes[1]).toEqual({ replyToName: null });
  });
});

describe("comment notification transaction", () => {
  it("creates one notification for a post owner, no notification on UUID retry", async () => {
    state.userId = 2;
    state.results.push(
      [{ id: mediaId, ownerUserId: 1 }],
      [{ id: 2, name: "Responder" }],
      [],
      [{ count: 0 }],
      [{ displayName: "ชื่อสาธารณะ" }],
      [{ ...comment, id: 30, authorId: 2, authorName: "ชื่อสาธารณะ" }]
    );
    const r = await request(mediaId, "POST", input);
    expect(r.status).toBe(201);
    expect(state.writes[0]).toEqual(
      expect.objectContaining({ authorName: "ชื่อสาธารณะ" })
    );
    expect(state.writes[1]).toEqual([
      expect.objectContaining({
        recipientId: 1,
        actorId: 2,
        commentId: 30,
        rootId: 30,
        kind: "comment",
      }),
    ]);
    state.writes = [];
    state.results.push(
      [{ id: mediaId, ownerUserId: 1 }],
      [{ id: 2 }],
      [{ ...comment, id: 30, authorId: 2 }]
    );
    expect((await request(mediaId, "POST", input)).status).toBe(200);
    expect(state.writes).toEqual([]);
  });
  it("notifies both post owner and reply target, but merges when they are the same", async () => {
    for (const owner of [1, 3]) {
      state.writes = [];
      state.userId = 2;
      state.results.push(
        [{ id: mediaId, ownerUserId: owner }],
        [{ id: 2, name: "Responder" }],
        [],
        [comment],
        [{ count: 0 }],
        [],
        [{ ...comment, id: 40, authorId: 2, parentId: 10, replyToId: 10 }]
      );
      expect(
        (await request(mediaId, "POST", { ...input, replyToId: 10 })).status
      ).toBe(201);
      const events = state.writes[1] as any[];
      expect(events.length).toBe(owner === 1 ? 1 : 2);
      expect(events.map(e => e.recipientId).sort()).toEqual(
        owner === 1 ? [1] : [1, 3]
      );
      expect(events.every(e => e.kind === "reply" && e.rootId === 10)).toBe(
        true
      );
    }
  });
  it("never alerts the actor for their own comment or reply", async () => {
    state.results.push(
      [{ id: mediaId, ownerUserId: 1 }],
      [{ id: 1 }],
      [],
      [{ count: 0 }],
      [],
      [comment]
    );
    expect((await request(mediaId, "POST", input)).status).toBe(201);
    expect(state.writes).toHaveLength(1);
  });
});

describe("private account profile does not leak into public comments", () => {
  it("does not query private user_profiles when publishing a comment", async () => {
    state.userId = 2;
    state.results.push(
      [{ id: mediaId, ownerUserId: 1 }],
      [
        {
          id: 2,
          name: "public_name",
          privateProfileDisplayName: "PRIVATE NAME",
        },
      ],
      [],
      [{ count: 0 }],
      [],
      [{ ...comment, id: 50, authorId: 2, authorName: "public_name" }]
    );
    const r = await request(mediaId, "POST", input);
    expect(r.status).toBe(201);
    expect(state.tables).not.toContain(userProfiles);
    expect(state.writes[0]).toEqual(
      expect.objectContaining({ authorName: "public_name" })
    );
    expect(JSON.stringify(r.body)).not.toContain("PRIVATE NAME");
  });
});
