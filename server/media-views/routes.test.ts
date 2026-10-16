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
  available: true,
  exists: true,
  total: 0,
  writes: 0,
  seen: new Set<string>(),
}));
const mediaId = "a".repeat(32);
vi.mock("../db", () => ({
  getDb: async () =>
    state.available
      ? {
          select: () => {
            const q: any = {
              from: () => q,
              leftJoin: () => q,
              where: () => q,
              limit: async () =>
                state.exists
                  ? [{ id: "a".repeat(32), total: state.total }]
                  : [],
            };
            return q;
          },
          execute: async () => {},
        }
      : null,
}));
vi.mock("./core", () => ({
  recordMediaView: async (_db: unknown, id: string, eventId: string) => {
    if (!state.exists) return null;
    const counted = !state.seen.has(eventId);
    if (counted) {
      state.total++;
      state.writes++;
      state.seen.add(eventId);
    }
    return { mediaId: id, viewCount: state.total, counted };
  },
}));
import { registerMediaViewRoutes } from "./routes";
let server: Server, origin: string;
beforeAll(async () => {
  const app = express();
  registerMediaViewRoutes(app);
  server = createServer(app);
  await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
  origin = `http://127.0.0.1:${(server.address() as any).port}`;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>(r => server.close(() => r()));
});
beforeEach(() => {
  state.available = state.exists = true;
  state.total = state.writes = 0;
  state.seen.clear();
});
const eventId = "11111111-1111-4111-8111-111111111111";
const post = (body: unknown, header = true, id = mediaId) =>
  fetch(`${origin}/api/media-views/${id}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(header ? { "X-Khing-Media-View": "1" } : {}),
    },
    body: JSON.stringify(body),
  });
describe("public media view API", () => {
  it("reads zero or actual totals without incrementing, with no account identifiers", async () => {
    let response = await fetch(`${origin}/api/media-views/${mediaId}`);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      mediaId,
      viewCount: 0,
      counted: false,
    });
    state.total = 23;
    response = await fetch(`${origin}/api/media-views/${mediaId}`);
    expect((await response.json()).viewCount).toBe(23);
    expect(state.writes).toBe(0);
  });
  it("accepts guest views and ignores retries of the same event", async () => {
    expect(await (await post({ eventId })).json()).toEqual({
      mediaId,
      viewCount: 1,
      counted: true,
    });
    expect(await (await post({ eventId })).json()).toEqual({
      mediaId,
      viewCount: 1,
      counted: false,
    });
    expect(state.writes).toBe(1);
  });
  it("rejects client supplied counts and missing headers", async () => {
    expect((await post({ eventId, viewCount: 1000 })).status).toBe(400);
    expect((await post({ eventId }, false)).status).toBe(403);
    expect((await post({ eventId: "bad" })).status).toBe(400);
    expect((await post({ eventId }, true, "private-post")).status).toBe(404);
    expect(state.writes).toBe(0);
  });
  it("fails closed for missing posts or DB without orphan counts", async () => {
    state.exists = false;
    expect((await post({ eventId })).status).toBe(404);
    expect((await fetch(`${origin}/api/media-views/${mediaId}`)).status).toBe(
      404
    );
    state.available = false;
    expect((await post({ eventId })).status).toBe(503);
    expect(state.writes).toBe(0);
  });
  it("rejects oversized JSON before writing", async () => {
    expect((await post({ eventId, other: "x".repeat(2000) })).status).toBe(400);
    expect(state.writes).toBe(0);
  });
});
