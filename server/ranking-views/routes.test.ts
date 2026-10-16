import {
  beforeAll,
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
const mocks = vi.hoisted(() => ({
  available: true,
  exists: true,
  total: 0,
  seen: new Set<string>(),
  writes: 0,
}));
vi.mock("../db", () => ({
  getDb: async () =>
    mocks.available
      ? {
          select: () => {
            const query: any = {
              from: () => query,
              where: async () =>
                mocks.total ? [{ id: "hash", total: mocks.total }] : [],
            };
            return query;
          },
          execute: async () => {},
        }
      : null,
}));
vi.mock("./core", () => ({
  targetHash: () => "hash",
  rankingTargetExists: async () => mocks.exists,
  recordRankingOpen: async (
    _db: unknown,
    _target: unknown,
    eventId: string
  ) => {
    const counted = !mocks.seen.has(eventId);
    if (counted) {
      mocks.total++;
      mocks.writes++;
      mocks.seen.add(eventId);
    }
    return { total: mocks.total, counted };
  },
}));
import { registerRankingViewRoutes } from "./routes";
let server: Server, origin: string;
beforeAll(async () => {
  const app = express();
  registerRankingViewRoutes(app);
  server = createServer(app);
  await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
  const address = server.address();
  if (!address || typeof address === "string") throw Error();
  origin = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>(r => server.close(() => r()));
});
beforeEach(() => {
  mocks.available = true;
  mocks.exists = true;
  mocks.total = 0;
  mocks.seen.clear();
  mocks.writes = 0;
});
const target = { kind: "community-board", key: "sports:run100|2026-10" };
const eventId = "11111111-1111-4111-8111-111111111111";
const post = (body: unknown, header = true) =>
  fetch(`${origin}/api/ranking-views/open`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(header ? { "X-Khing-Views": "1" } : {}),
    },
    body: JSON.stringify(body),
  });
describe("public ranking view API", () => {
  it("GET reads true zero and totals without incrementing", async () => {
    let response = await fetch(
      `${origin}/api/ranking-views?targets=${encodeURIComponent(JSON.stringify([target]))}`
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      counts: [{ id: JSON.stringify([target.kind, target.key]), total: 0 }],
    });
    expect(mocks.writes).toBe(0);
    mocks.total = 7;
    response = await fetch(
      `${origin}/api/ranking-views?targets=${encodeURIComponent(JSON.stringify([target]))}`
    );
    expect((await response.json()).counts[0].total).toBe(7);
  });
  it("accepts visitor clicks and retries same UUID without double counting", async () => {
    expect(await (await post({ target, eventId })).json()).toMatchObject({
      total: 1,
      counted: true,
    });
    expect(await (await post({ target, eventId })).json()).toMatchObject({
      total: 1,
      counted: false,
    });
    expect(mocks.writes).toBe(1);
    expect(
      (
        await (
          await post({
            target,
            eventId: "22222222-2222-4222-8222-222222222222",
          })
        ).json()
      ).total
    ).toBe(2);
  });
  it("rejects arbitrary counts, missing request header and nonexistent targets", async () => {
    expect((await post({ target, eventId, total: 10000 })).status).toBe(400);
    expect((await post({ target, eventId }, false)).status).toBe(403);
    mocks.exists = false;
    expect((await post({ target, eventId })).status).toBe(404);
    expect(mocks.writes).toBe(0);
  });
  it("fails closed with no DB and bounded malformed inputs", async () => {
    mocks.available = false;
    expect((await post({ target, eventId })).status).toBe(503);
    mocks.available = true;
    expect(
      (await post({ target: { kind: "private-profile", key: "1" }, eventId }))
        .status
    ).toBe(400);
    expect(
      (await post({ target: { ...target, key: "x".repeat(5000) }, eventId }))
        .status
    ).toBe(400);
    expect(
      (await fetch(`${origin}/api/ranking-views?targets=bad-json`)).status
    ).toBe(503);
  });
});
