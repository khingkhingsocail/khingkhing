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
import { randomBytes } from "node:crypto";

const mockState = vi.hoisted(() => ({
  results: [] as unknown[][],
  writes: [] as unknown[],
  duplicates: [] as unknown[],
}));
vi.mock("./db", () => ({
  getDb: async () => ({
    select: () => {
      const chain = {
        from: () => chain,
        where: () => chain,
        innerJoin: () => chain,
        orderBy: () => chain,
        limit: async () => mockState.results.shift() ?? [],
        then: (resolve: (value: unknown[]) => unknown) =>
          Promise.resolve(mockState.results.shift() ?? []).then(resolve),
      };
      return chain;
    },
    insert: () => ({
      values: (values: unknown) => {
        mockState.writes.push(values);
        return {
          then: (resolve: (value: unknown) => unknown) =>
            Promise.resolve({}).then(resolve),
          onDuplicateKeyUpdate: async (update: unknown) => {
            mockState.duplicates.push(update);
          },
        };
      },
    }),
    update: () => ({
      set: (values: unknown) => ({
        where: async () => {
          mockState.writes.push(values);
        },
      }),
    }),
  }),
}));
import { hashArenaToken, registerArenaRoutes } from "./arena";
const token = randomBytes(32).toString("base64url");
const id = "a".repeat(32);
const now = new Date("2026-10-01T00:00:00Z");
const profile = {
  id,
  displayName: "Test participant",
  handle: "participant",
  bio: "",
  avatar: null,
  editTokenHash: hashArenaToken(token),
  createdAt: now,
  updatedAt: now,
};
const entry = {
  id: "d".repeat(32),
  profileId: id,
  boardKey: "sports:run100",
  title: "วิ่ง 100 เมตร",
  category: "sports",
  unit: "วินาที",
  direction: "lower",
  value: "12.000000",
  period: "2026-10",
  observedAt: "2026-10-01",
  evidenceUrl: "",
  verification: "self-reported",
  updatedAt: now,
};
let server: Server;
let origin: string;
async function request(
  path: string,
  method = "GET",
  body?: unknown,
  editToken?: string
) {
  const response = await fetch(`${origin}/api/arena${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(editToken ? { "X-Arena-Token": editToken } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, body: await response.json() };
}
beforeAll(async () => {
  const app = express();
  registerArenaRoutes(app);
  server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("No test listener");
  origin = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server.close(error => (error ? reject(error) : resolve()))
  );
});
beforeEach(() => {
  mockState.results.length = 0;
  mockState.writes.length = 0;
  mockState.duplicates.length = 0;
});

describe("Arena API ownership and public projection", () => {
  it("only returns public profile fields, never edit capability", async () => {
    mockState.results.push([profile], [entry]);
    const result = await request(`/profiles/${id}`);
    expect(result.status).toBe(200);
    expect(result.body.profile.handle).toBe("participant");
    expect(JSON.stringify(result.body)).not.toContain("editToken");
    expect(JSON.stringify(result.body)).not.toContain(token);
    expect(mockState.writes).toHaveLength(0);
  });
  it("forbids profile mutation without a matching token", async () => {
    mockState.results.push([profile]);
    const result = await request(`/profiles/${id}`, "PATCH", {
      displayName: "Other",
      handle: "other",
      bio: "",
      avatar: null,
    });
    expect(result.status).toBe(403);
    expect(mockState.writes).toHaveLength(0);
  });
  it("allows only bearer owner to update profile", async () => {
    mockState.results.push([profile], []);
    const result = await request(
      `/profiles/${id}`,
      "PATCH",
      { displayName: "Other", handle: "other", bio: "", avatar: null },
      token
    );
    expect(result.status).toBe(200);
    expect(mockState.writes).toHaveLength(1);
    expect(result.body.profile).not.toHaveProperty("editTokenHash");
  });
  it("rejects attempts to declare statistics verified before any write", async () => {
    const result = await request(
      "/entries",
      "POST",
      {
        profileId: id,
        boardKey: "sports:run100",
        value: 12,
        period: "2026-10",
        observedAt: "2026-10-01",
        evidenceUrl: "",
        verification: "verified",
      },
      token
    );
    expect(result.status).toBe(400);
    expect(mockState.writes).toHaveLength(0);
  });
  it("forbids submitting statistics to another profile without capability", async () => {
    mockState.results.push([profile]);
    const result = await request(
      "/entries",
      "POST",
      {
        profileId: id,
        boardKey: "sports:run100",
        value: 12,
        period: "2026-10",
        observedAt: "2026-10-01",
        evidenceUrl: "",
      },
      "A".repeat(43)
    );
    expect(result.status).toBe(403);
    expect(mockState.writes).toHaveLength(0);
  });
  it("persists owner entry and always resets verification on an update", async () => {
    mockState.results.push([profile], [{ id: entry.id }]);
    const result = await request(
      "/entries",
      "POST",
      {
        profileId: id,
        boardKey: "sports:run100",
        value: 12,
        period: "2026-10",
        observedAt: "2026-10-01",
        evidenceUrl: "",
      },
      token
    );
    expect(result.status).toBe(200);
    expect(mockState.writes[0]).toMatchObject({
      profileId: id,
      verification: "self-reported",
      value: "12.000000",
    });
    expect(mockState.duplicates[0]).toMatchObject({
      set: { verification: "self-reported" },
    });
    expect(result.body.entryId).toBe(entry.id);
    expect(result.body.revision).toMatch(/^[a-f0-9]{32}$/);
    expect(result.body.revision).toBe(
      (mockState.writes[0] as { revision: string }).revision
    );
  });
  it("computes comparable ranks on full query results and omits secrets", async () => {
    mockState.results.push([
      {
        entry: {
          ...entry,
          profileId: "c".repeat(32),
          id: "e".repeat(32),
          value: "14.000000",
        },
        profile: { ...profile, id: "c".repeat(32) },
      },
      { entry, profile },
      {
        entry: { ...entry, profileId: "b".repeat(32), id: "f".repeat(32) },
        profile: { ...profile, id: "b".repeat(32) },
      },
    ]);
    const result = await request(
      "/leaderboard?board=sports%3Arun100&period=2026-10"
    );
    expect(result.status).toBe(200);
    expect(result.body.total).toBe(3);
    expect(
      result.body.items.map((item: { rank: number }) => item.rank)
    ).toEqual([1, 1, 3]);
    expect(JSON.stringify(result.body)).not.toContain("editTokenHash");
  });
  it("does not return another claim revision when a concurrent edit replaced it", async () => {
    mockState.results.push([profile], []);
    const result = await request(
      "/entries",
      "POST",
      {
        profileId: id,
        boardKey: "sports:run100",
        value: 12,
        period: "2026-10",
        observedAt: "2026-10-01",
        evidenceUrl: "",
      },
      token
    );
    expect(result.status).toBe(409);
    expect(result.body).not.toHaveProperty("entryId");
  });
});
