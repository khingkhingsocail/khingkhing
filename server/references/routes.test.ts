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
  rows: [] as { payload: string }[],
  available: true,
}));
vi.mock("../db", () => ({
  getDb: async () =>
    mocks.available
      ? {
          select: () => {
            const q: any = {
              from: () => q,
              where: () => q,
              limit: async () => mocks.rows,
            };
            return q;
          },
        }
      : null,
}));
import { registerArenaReferenceRoutes } from "./routes";
let server: Server, origin: string;
beforeAll(async () => {
  const app = express();
  registerArenaReferenceRoutes(app);
  server = createServer(app);
  await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No address");
  origin = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>(r => server.close(() => r()));
});
beforeEach(() => {
  mocks.rows = [];
  mocks.available = true;
});
const record = {
  id: "a".repeat(32),
  personId: "usain-bolt",
  name: "Usain Bolt",
  boardKey: "sports:run100",
  value: 9.58,
  displayValue: "9.58 s",
  observedAt: "2026-10-09",
  eventDate: "2009-08-16",
  retrievedAt: "2026-10-09T03:47:08.000Z",
  scope: "career-best",
  approximate: false,
  sourceUrl: "https://worldathletics.org/records",
  sourceTitle: "Official source",
  sourceType: "official",
  excerpt: "9.58 on 16 AUG 2009",
  notes: "Wind legal",
};
describe("public reference HTTP endpoint", () => {
  it("returns sourced records and no stale cache to visitors", async () => {
    mocks.rows = [{ payload: JSON.stringify(record) }];
    const r = await fetch(`${origin}/api/arena-references?category=sports`);
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(await r.json()).toEqual({ items: [record], total: 1 });
  });
  it("reports empty data honestly and rejects unknown categories", async () => {
    expect(
      await (await fetch(`${origin}/api/arena-references`)).json()
    ).toEqual({ items: [], total: 0 });
    expect(
      (await fetch(`${origin}/api/arena-references?category=private`)).status
    ).toBe(400);
  });
  it("fails closed for unavailable database or invalid payload", async () => {
    mocks.available = false;
    expect((await fetch(`${origin}/api/arena-references`)).status).toBe(503);
    mocks.available = true;
    mocks.rows = [
      {
        payload: JSON.stringify({ ...record, userId: 9, editToken: "private" }),
      },
    ];
    expect((await fetch(`${origin}/api/arena-references`)).status).toBe(503);
  });
  it("has no public data-write route", async () => {
    const r = await fetch(`${origin}/api/arena-references`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record),
    });
    expect(r.status).toBe(404);
  });
});
