import {
  beforeAll,
  afterAll,
  beforeEach,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import { randomBytes } from "node:crypto";
const state = vi.hoisted(() => ({
  results: [] as unknown[][],
  writes: [] as unknown[],
  admin: false,
}));
vi.mock("../db", () => ({ getDb: async () => db }));
vi.mock("../_core/sdk", () => ({
  sdk: {
    authenticateRequest: async () => {
      if (!state.admin) throw new Error("unauthorized");
      return { id: 42, role: "admin", isCron: false };
    },
  },
}));
const db = {
  select: () => {
    const chain: any = {
      from: () => chain,
      where: () => chain,
      innerJoin: () => chain,
      orderBy: () => chain,
      for: () => chain,
      limit: async () => state.results.shift() ?? [],
      then: (resolve: any) =>
        Promise.resolve(state.results.shift() ?? []).then(resolve),
    };
    return chain;
  },
  transaction: async (fn: any) => fn(db),
  insert: () => ({
    values: async (values: any) => {
      state.writes.push(values);
    },
  }),
  update: () => ({
    set: (values: any) => ({
      where: async () => {
        state.writes.push(values);
      },
    }),
  }),
  delete: () => ({ where: async () => state.writes.push("deleted") }),
};
import { registerVerificationRoutes } from "./routes";
import { claimSnapshot } from "./core";
import { hashArenaToken } from "../arena";
import type {
  arenaEntries,
  arenaProfiles,
  arenaReviews,
} from "../../drizzle/schema";
const token = randomBytes(32).toString("base64url");
const now = new Date();
const profile: typeof arenaProfiles.$inferSelect = {
  id: "a".repeat(32),
  displayName: "Test",
  handle: "test",
  bio: "",
  avatar: null,
  editTokenHash: hashArenaToken(token),
  createdAt: now,
  updatedAt: now,
};
const entry: typeof arenaEntries.$inferSelect = {
  id: "b".repeat(32),
  profileId: profile.id,
  boardKey: "followers:tiktok",
  title: "followers",
  category: "followers",
  unit: "คน",
  direction: "higher",
  value: "100.000000",
  period: "2026-10",
  observedAt: "2026-10-01",
  evidenceUrl: "",
  revision: "c".repeat(32),
  evidenceRevision: "initial",
  verification: "self-reported",
  verificationSnapshot: null,
  reviewStatus: "none",
  reviewSnapshot: null,
  updatedAt: now,
};
const review: typeof arenaReviews.$inferSelect = {
  id: "d".repeat(32),
  entryId: entry.id,
  profileId: profile.id,
  snapshot: claimSnapshot(entry, profile),
  status: "needs-human",
  report: null,
  sources: null,
  coverage: null,
  model: "test",
  attempts: 1,
  error: null,
  decision: "pending",
  decisionReason: null,
  reviewerId: null,
  decidedAt: null,
  createdAt: now,
  completedAt: now,
};
let server: Server;
let origin: string;
async function request(
  path: string,
  method = "GET",
  body?: unknown,
  ownerToken?: string
) {
  const r = await fetch(origin + "/api/arena/verification" + path, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(ownerToken ? { "X-Arena-Token": ownerToken } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: r.status, body: await r.json() };
}
beforeAll(async () => {
  const app = express();
  registerVerificationRoutes(app);
  server = createServer(app);
  await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
  const a = server.address();
  if (!a || typeof a === "string") throw new Error();
  origin = `http://127.0.0.1:${a.port}`;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>(r => server.close(() => r()));
});
beforeEach(() => {
  state.results.length = 0;
  state.writes.length = 0;
  state.admin = false;
});
describe("private evidence authorization", () => {
  it("does not expose bundle to visitors without owner token or admin session", async () => {
    state.results.push([{ entry, profile }]);
    const r = await request(`/entries/${entry.id}`);
    expect(r.status).toBe(403);
    expect(state.writes).toHaveLength(0);
  });
  it("allows owner to view metadata but no raw bytes/hash capabilities in response", async () => {
    state.results.push([{ entry, profile }], [], []);
    const r = await request(`/entries/${entry.id}`, "GET", undefined, token);
    expect(r.status).toBe(200);
    expect(r.body.entryRevision).toBe(entry.revision);
    expect(JSON.stringify(r.body)).not.toContain("editTokenHash");
  });
  it("blocks unauthenticated upload before reading file body", async () => {
    state.results.push([{ entry, profile }]);
    const r = await request(`/entries/${entry.id}/evidence`, "POST", {});
    expect(r.status).toBe(403);
    expect(state.writes).toHaveLength(0);
  });
  it("requires consent before AI evaluation", async () => {
    const r = await request(
      `/entries/${entry.id}/review`,
      "POST",
      { consent: false, publicLookup: true, sourceUrls: [] },
      token
    );
    expect(r.status).toBe(400);
    expect(state.writes).toHaveLength(0);
  });
  it("keeps old evidence accessible as stale metadata for owner deletion", async () => {
    state.results.push(
      [{ entry, profile }],
      [
        {
          id: "e".repeat(32),
          entryId: entry.id,
          claimRevision: "old-revision",
          filename: "old.jpg",
          kind: "image",
          mimeType: "image/jpeg",
          size: 100,
          sha256: "f".repeat(64),
          duration: null,
          createdAt: now,
        },
      ],
      []
    );
    const r = await request(`/entries/${entry.id}`, "GET", undefined, token);
    expect(r.status).toBe(200);
    expect(r.body.evidence[0].stale).toBe(true);
    expect(r.body.evidence[0]).not.toHaveProperty("data");
  });
  it("rejects public queue access and rejects visitors deciding verification", async () => {
    expect((await request("/admin/queue")).status).toBe(403);
    expect(
      (
        await request(
          `/reviews/${review.id}/decision`,
          "POST",
          {
            decision: "approved",
            reason: "I am the owner and verify it",
            snapshot: review.snapshot,
          },
          token
        )
      ).status
    ).toBe(403);
    expect(state.writes).toHaveLength(0);
  });
});
describe("administrator snapshot decision", () => {
  it("rejects admin holding owner capability on the same claim", async () => {
    state.admin = true;
    state.results.push([review], [profile]);
    const r = await request(
      `/reviews/${review.id}/decision`,
      "POST",
      {
        decision: "approved",
        reason: "I own this claim and should not review it",
        snapshot: review.snapshot,
      },
      token
    );
    expect(r.status).toBe(403);
    expect(state.writes).toHaveLength(0);
  });
  it("fails closed if claim changed after AI review", async () => {
    state.admin = true;
    state.results.push(
      [review],
      [profile],
      [{ ...entry, value: "200.000000" }],
      [review]
    );
    const r = await request(`/reviews/${review.id}/decision`, "POST", {
      decision: "approved",
      reason: "Reviewed full independent evidence",
      snapshot: review.snapshot,
    });
    expect(r.status).toBe(409);
    expect(state.writes).toHaveLength(0);
  });
  it("records reason and current verification snapshot on admin approval", async () => {
    state.admin = true;
    state.results.push([review], [profile], [entry], [review]);
    const r = await request(`/reviews/${review.id}/decision`, "POST", {
      decision: "approved",
      reason: "Reviewed independent original evidence",
      snapshot: review.snapshot,
    });
    expect(r.status).toBe(200);
    expect(state.writes[0]).toMatchObject({
      decision: "approved",
      reviewerId: 42,
    });
    expect(state.writes[1]).toMatchObject({
      verification: "verified",
      verificationSnapshot: review.snapshot,
    });
  });
  it("does not approve a running or already decided review", async () => {
    state.admin = true;
    state.results.push(
      [review],
      [profile],
      [entry],
      [{ ...review, status: "running" }]
    );
    const r = await request(`/reviews/${review.id}/decision`, "POST", {
      decision: "approved",
      reason: "Must finish review first",
      snapshot: review.snapshot,
    });
    expect(r.status).toBe(409);
    expect(state.writes).toHaveLength(0);
  });
});
