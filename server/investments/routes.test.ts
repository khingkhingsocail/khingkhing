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
import { readFileSync } from "node:fs";
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
import { registerInvestmentReferenceRoutes } from "./routes";
let server: Server, origin: string;
const row = JSON.parse(
  readFileSync(
    new URL("../../data/investment-references.json", import.meta.url),
    "utf8"
  )
)[0];
beforeAll(async () => {
  const app = express();
  registerInvestmentReferenceRoutes(app);
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
describe("investment reference HTTP", () => {
  it("returns public sourced data with no-cache and no private account identities", async () => {
    mocks.rows = [{ payload: JSON.stringify(row) }];
    const r = await fetch(`${origin}/api/investment-references`);
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(await r.json()).toEqual({ items: [row], total: 1 });
  });
  it("returns honest empty data and no public write endpoint", async () => {
    expect(
      await (await fetch(`${origin}/api/investment-references`)).json()
    ).toEqual({ items: [], total: 0 });
    expect(
      (await fetch(`${origin}/api/investment-references`, { method: "POST" }))
        .status
    ).toBe(404);
  });
  it("fails closed on invalid payload missing database or excessive data", async () => {
    mocks.available = false;
    expect((await fetch(`${origin}/api/investment-references`)).status).toBe(
      503
    );
    mocks.available = true;
    mocks.rows = [{ payload: JSON.stringify({ ...row, editToken: "secret" }) }];
    expect((await fetch(`${origin}/api/investment-references`)).status).toBe(
      503
    );
    mocks.rows = Array.from({ length: 1001 }, () => ({
      payload: JSON.stringify(row),
    }));
    expect((await fetch(`${origin}/api/investment-references`)).status).toBe(
      503
    );
  });
});
