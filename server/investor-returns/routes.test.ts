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
            const q: any = { from: () => q, limit: async () => mocks.rows };
            return q;
          },
        }
      : null,
}));
import { registerInvestorReturnRoutes } from "./routes";
const row = {
  id: "test-return",
  investor: "Fixture",
  organization: "Test Fund",
  submitted: {
    value: 30,
    period: "1981–2010",
    basis: "ประมาณ",
    sourceUrl: "https://example.com/",
  },
  reportedValue: null,
  reportedPeriod: "1981–2010",
  reportedBasis: "ค่าที่ผู้ใช้ส่ง",
  status: "unverified",
  summary: "Test data only",
  caveats: "Not confirmed",
  sources: [],
  extras: [],
};
let server: Server, origin: string;
beforeAll(async () => {
  const app = express();
  registerInvestorReturnRoutes(app);
  server = createServer(app);
  await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
  const a = server.address();
  if (!a || typeof a === "string") throw Error("No address");
  origin = `http://127.0.0.1:${a.port}`;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>(r => server.close(() => r()));
});
beforeEach(() => {
  mocks.rows = [];
  mocks.available = true;
});
describe("return reference API", () => {
  it("returns only validated public source records", async () => {
    mocks.rows = [{ payload: JSON.stringify(row) }];
    const r = await fetch(`${origin}/api/investor-returns`);
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(await r.json()).toEqual({ items: [row], total: 1 });
  });
  it("returns empty without filling invented data and has no public write endpoint", async () => {
    expect(
      await (await fetch(`${origin}/api/investor-returns`)).json()
    ).toEqual({ items: [], total: 0 });
    expect(
      (await fetch(`${origin}/api/investor-returns`, { method: "POST" })).status
    ).toBe(404);
  });
  it("fails closed for missing database, malformed payload and excessive records", async () => {
    mocks.available = false;
    expect((await fetch(`${origin}/api/investor-returns`)).status).toBe(503);
    mocks.available = true;
    mocks.rows = [
      { payload: JSON.stringify({ ...row, secretToken: "private" }) },
    ];
    expect((await fetch(`${origin}/api/investor-returns`)).status).toBe(503);
    mocks.rows = Array.from({ length: 501 }, () => ({
      payload: JSON.stringify(row),
    }));
    expect((await fetch(`${origin}/api/investor-returns`)).status).toBe(503);
  });
});
