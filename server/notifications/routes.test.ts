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
  writes: [] as Array<{ set: unknown; where?: unknown }>,
  loggedIn: true,
  userId: 1,
  cron: false,
}));

const db = {
  select: () => {
    const chain: any = {
      from: () => chain,
      innerJoin: () => chain,
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
  update: () => ({
    set: (value: unknown) => {
      const write: { set: unknown; where?: unknown } = { set: value };
      state.writes.push(write);
      return {
        where: async (condition: unknown) => {
          write.where = condition;
          return { affectedRows: 1 };
        },
      };
    },
  }),
};

vi.mock("../db", () => ({ getDb: async () => db }));
vi.mock("../_core/sdk", () => ({
  sdk: {
    authenticateRequest: async () => {
      if (!state.loggedIn) throw new Error("Unauthenticated");
      return { id: state.userId, isCron: state.cron };
    },
  },
}));

import { registerNotificationRoutes } from "./routes";

const mediaId = "a".repeat(32);
const now = new Date("2025-03-04T05:06:07.000Z");
const savedNotification = {
  id: 80,
  kind: "reply" as const,
  actorName: "สมาชิกขิงขิง",
  text: "ตอบกลับข้อความ",
  mediaTitle: "ผลงานสาธารณะ",
  mediaId,
  commentId: 43,
  rootId: 17,
  createdAt: now,
  readAt: null,
};

let server: Server;
let origin: string;
beforeAll(async () => {
  const app = express();
  registerNotificationRoutes(app);
  server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  origin = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
});
beforeEach(() => {
  state.results = [];
  state.writes = [];
  state.loggedIn = true;
  state.userId = 1;
  state.cron = false;
});

async function request(
  path = "",
  method = "GET",
  body?: unknown,
  headers: Record<string, string> = { "X-Khing-Notifications": "1" }
) {
  const response = await fetch(`${origin}/api/notifications${path}`, {
    method,
    headers: {
      ...headers,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return {
    status: response.status,
    body: await response.json().catch(() => null),
    headers: response.headers,
  };
}

describe("authenticated in-app notifications", () => {
  it("returns only the explicit public projection, filtered page metadata, and no-store headers", async () => {
    state.results.push(
      [{ unread: 1, watermark: 80 }],
      [
        {
          ...savedNotification,
          recipientId: 1,
          actorId: 9,
          email: "private@example.com",
          openId: "private-open-id",
          token: "secret-token",
          deletedText: "private deleted comment text",
        },
      ]
    );
    const result = await request();
    expect(result.status).toBe(200);
    expect(result.body).toEqual({
      items: [
        {
          ...savedNotification,
          createdAt: now.toISOString(),
        },
      ],
      nextCursor: null,
      unread: 1,
      watermark: 80,
    });
    expect(result.body.items[0]).not.toHaveProperty("recipientId");
    expect(result.body.items[0]).not.toHaveProperty("actorId");
    expect(JSON.stringify(result.body)).not.toMatch(
      /private@example\.com|private-open-id|secret-token|deletedText/
    );
    expect(result.headers.get("cache-control")).toContain("no-store");
    expect(result.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("requires a real non-cron account and rejects malformed cursors before querying", async () => {
    state.loggedIn = false;
    expect((await request()).status).toBe(401);
    state.loggedIn = true;
    state.cron = true;
    expect((await request()).status).toBe(401);
    state.cron = false;
    expect((await request("?before=0")).status).toBe(400);
    expect(state.results).toHaveLength(0);
  });

  it("paginates newest first with a strict stable numeric cursor", async () => {
    const rows = Array.from({ length: 31 }, (_, index) => ({
      ...savedNotification,
      id: 100 - index,
      commentId: 100 - index,
      rootId: 100 - index,
    }));
    state.results.push([{ unread: 31, watermark: 100 }], rows);
    const first = await request();
    expect(first.body.items).toHaveLength(30);
    expect(first.body.items[0].id).toBe(100);
    expect(first.body.items[29].id).toBe(71);
    expect(first.body.nextCursor).toBe(71);
    state.results.push(
      [{ unread: 31, watermark: 100 }],
      [{ ...savedNotification, id: 70 }]
    );
    const next = await request("?before=71");
    expect(next.body.items[0].id).toBe(70);
    expect(next.body.nextCursor).toBeNull();
    expect((await request("?before=2147483648")).status).toBe(400);
  });

  it("marks only a notification owned by the account and is idempotent for an already-read row", async () => {
    expect((await request("/80/read", "POST", undefined, {})).status).toBe(403);
    expect(state.writes).toHaveLength(0);

    state.results.push([]);
    expect(
      (
        await request("/80/read", "POST", undefined, {
          "X-Khing-Notifications": "1",
        })
      ).status
    ).toBe(404);

    state.results.push([{ id: 80, readAt: null }]);
    const marked = await request("/80/read", "POST");
    expect(marked.status).toBe(200);
    expect(marked.body.readAt).toEqual(expect.any(String));
    expect(state.writes).toHaveLength(1);
    expect(state.writes[0].set).toEqual({ readAt: expect.any(Date) });

    state.results.push([{ id: 80, readAt: now }]);
    const retry = await request("/80/read", "POST");
    expect(retry.status).toBe(200);
    expect(retry.body.readAt).toBe(now.toISOString());
    expect(state.writes).toHaveLength(1);
  });

  it("validates read IDs and strict read-all JSON, and bounds read-all by throughId", async () => {
    expect((await request("/bad/read", "POST")).status).toBe(400);
    expect(
      (
        await request("/read-all", "POST", {
          throughId: 80,
          recipientId: 999,
        })
      ).status
    ).toBe(400);
    expect(state.writes).toHaveLength(0);

    const response = await request("/read-all", "POST", { throughId: 80 });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
    expect(state.writes).toHaveLength(1);
    expect(state.writes[0].set).toEqual({ readAt: expect.any(Date) });
    expect(state.writes[0].where).toBeDefined();
  });

  it("rejects oversized request JSON and never trusts recipient IDs in read-all", async () => {
    const response = await fetch(`${origin}/api/notifications/read-all`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Khing-Notifications": "1",
      },
      body: JSON.stringify({ throughId: 80, note: "x".repeat(9000) }),
    });
    expect(response.status).toBe(413);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(state.writes).toHaveLength(0);
  });
});
