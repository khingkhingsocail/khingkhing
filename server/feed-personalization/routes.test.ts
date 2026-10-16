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

const mocks = vi.hoisted(() => {
  const state = {
    results: [] as unknown[][],
    tables: [] as unknown[],
    selections: [] as unknown[],
    joins: [] as unknown[][],
    locks: [] as { table: unknown; mode: unknown }[],
    inserts: [] as { table: unknown; values: unknown }[],
    updates: [] as { table: unknown; values: unknown }[],
    loggedIn: true,
    cron: false,
    userId: 17,
    dbAvailable: true,
    authCalls: 0,
  };
  const db: any = {
    select: (fields: unknown) => {
      state.selections.push(fields);
      let table: unknown;
      const chain: any = {
        from: (source: unknown) => {
          table = source;
          state.tables.push(source);
          return chain;
        },
        leftJoin: (...args: unknown[]) => {
          state.joins.push(args);
          return chain;
        },
        where: () => chain,
        limit: () => chain,
        for: (mode: unknown) => {
          state.locks.push({ table, mode });
          return chain;
        },
        then: (
          resolve: (value: unknown[]) => unknown,
          reject?: (cause: unknown) => unknown
        ) => Promise.resolve(state.results.shift() ?? []).then(resolve, reject),
      };
      return chain;
    },
    transaction: async (work: (tx: any) => Promise<unknown>) => work(db),
    insert: (table: unknown) => ({
      values: async (values: unknown) => {
        state.inserts.push({ table, values });
      },
    }),
    update: (table: unknown) => ({
      set: (values: unknown) => ({
        where: async () => {
          state.updates.push({ table, values });
        },
      }),
    }),
  };
  return { state, db };
});

vi.mock("../db", () => ({
  getDb: async () => (mocks.state.dbAvailable ? mocks.db : null),
}));
vi.mock("../_core/sdk", () => ({
  sdk: {
    authenticateRequest: async () => {
      mocks.state.authCalls += 1;
      if (!mocks.state.loggedIn)
        throw new Error("unauthenticated test session");
      return { id: mocks.state.userId, isCron: mocks.state.cron };
    },
  },
}));

import {
  feedPreferenceEvents,
  feedPreferences,
  publicMedia,
  publicMediaCreators,
  users,
} from "../../drizzle/schema";
import { emptyFeedPreferences } from "../../shared/feedPersonalization";
import { registerFeedPersonalizationRoutes } from "./routes";

const mediaId = "a".repeat(32);
const creatorId = "b".repeat(32);
const eventId = "11111111-1111-4111-8111-111111111111";
const signal = { mediaId, eventId, action: "like" } as const;
const mediaRow = {
  id: mediaId,
  kind: "image",
  title: "Food #recipe",
  description: "A short sports post",
  ownerUserId: 27,
  creatorId,
};
let server: Server;
let origin: string;

beforeAll(async () => {
  const app = express();
  registerFeedPersonalizationRoutes(app);
  server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("No test server address");
  origin = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
});

beforeEach(() => {
  mocks.state.results = [];
  mocks.state.tables = [];
  mocks.state.selections = [];
  mocks.state.joins = [];
  mocks.state.locks = [];
  mocks.state.inserts = [];
  mocks.state.updates = [];
  mocks.state.loggedIn = true;
  mocks.state.cron = false;
  mocks.state.userId = 17;
  mocks.state.dbAvailable = true;
  mocks.state.authCalls = 0;
});

async function request(
  path: string,
  init: RequestInit = {},
  options: { marker?: boolean; rawBody?: string } = {}
) {
  const headers = new Headers(init.headers);
  if (options.marker !== false) headers.set("X-Khing-Feed", "1");
  const body = options.rawBody ?? init.body;
  if (body !== undefined && !headers.has("content-type"))
    headers.set("Content-Type", "application/json");
  const response = await fetch(`${origin}/api/feed-personalization${path}`, {
    ...init,
    headers,
    ...(body !== undefined ? { body } : {}),
  });
  return {
    status: response.status,
    body: await response.json().catch(() => null),
    headers: response.headers,
  };
}

async function postSignal(body: unknown) {
  return request("/signals", { method: "POST", body: JSON.stringify(body) });
}

describe("private feed personalization API", () => {
  it("returns only empty preferences for a new authenticated account with private cache headers", async () => {
    const response = await request("/me");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ preferences: emptyFeedPreferences() });
    expect(response.body).not.toHaveProperty("userId");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("pragma")).toBe("no-cache");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(mocks.state.authCalls).toBe(1);
  });

  it("reads and returns a stored bounded preference payload without account identifiers", async () => {
    const preferences = {
      version: 1,
      weights: { "kind:video": 3.5, "topic:music": -2 },
      dismissed: [mediaId],
    };
    mocks.state.results.push([{ payload: JSON.stringify(preferences) }]);
    const response = await request("/me");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ preferences });
    expect(JSON.stringify(response.body)).not.toContain("userId");
  });

  it("requires the feed marker before parsing JSON and rejects missing, invalid, or cron sessions", async () => {
    const unmarked = await request(
      "/signals",
      { method: "POST" },
      {
        marker: false,
        rawBody: JSON.stringify({ ...signal, extra: "x".repeat(5000) }),
      }
    );
    expect(unmarked.status).toBe(403);
    expect(mocks.state.authCalls).toBe(0);

    mocks.state.loggedIn = false;
    expect((await request("/me")).status).toBe(401);
    mocks.state.loggedIn = true;
    mocks.state.cron = true;
    expect((await postSignal(signal)).status).toBe(401);
    expect(mocks.state.inserts).toHaveLength(0);
    expect(mocks.state.tables).toHaveLength(0);
  });

  it("rejects extra client fields such as userId and features before touching the database", async () => {
    expect((await postSignal({ ...signal, userId: 99 })).status).toBe(400);
    expect(
      (await postSignal({ ...signal, features: ["creator:whatever"] })).status
    ).toBe(400);
    expect(mocks.state.tables).toHaveLength(0);
    expect(mocks.state.inserts).toHaveLength(0);
  });

  it("rejects oversized and malformed JSON with private no-store responses", async () => {
    const tooLarge = await request("/signals", {
      method: "POST",
      body: JSON.stringify({ ...signal, padding: "x".repeat(5000) }),
    });
    expect(tooLarge.status).toBe(413);
    expect(tooLarge.headers.get("cache-control")).toBe("private, no-store");

    const malformed = await request(
      "/signals",
      { method: "POST" },
      { rawBody: "{" }
    );
    expect(malformed.status).toBe(400);
    expect(malformed.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.state.tables).toHaveLength(0);
  });

  it("fails closed when the database is unavailable", async () => {
    mocks.state.dbAvailable = false;
    const response = await request("/me");
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("requires an existing public media row and performs no writes for a missing item", async () => {
    mocks.state.results.push([{ id: 17 }], [], [], []);
    const response = await postSignal(signal);
    expect(response.status).toBe(404);
    expect(mocks.state.locks.slice(0, 2)).toEqual([
      { table: users, mode: "update" },
      { table: feedPreferences, mode: "update" },
    ]);
    expect(mocks.state.inserts).toHaveLength(0);
    expect(mocks.state.updates).toHaveLength(0);
  });

  it("derives bounded preferences only from selected public metadata and writes event plus canonical state", async () => {
    mocks.state.results.push([{ id: 17 }], [], [], [mediaRow], [{ count: 0 }]);
    const response = await postSignal(signal);
    expect(response.status).toBe(200);
    expect(response.body.preferences).toEqual({
      version: 1,
      weights: {
        "kind:image": 5,
        "topic:food": 5,
        "topic:recipe": 5,
        "topic:sports": 5,
        [`creator:${creatorId}`]: 5,
      },
      dismissed: [],
    });
    expect(mocks.state.locks.slice(0, 2)).toEqual([
      { table: users, mode: "update" },
      { table: feedPreferences, mode: "update" },
    ]);
    const mediaSelectIndex = mocks.state.tables.indexOf(publicMedia);
    expect(mocks.state.selections[mediaSelectIndex]).toEqual({
      id: publicMedia.id,
      kind: publicMedia.kind,
      title: publicMedia.title,
      description: publicMedia.description,
      ownerUserId: publicMedia.ownerUserId,
      creatorId: publicMediaCreators.id,
    });
    expect(mocks.state.selections[mediaSelectIndex]).not.toHaveProperty("data");
    expect(mocks.state.selections[mediaSelectIndex]).not.toHaveProperty(
      "avatar"
    );
    expect(mocks.state.joins[0]).toEqual([
      publicMediaCreators,
      expect.anything(),
    ]);
    expect(mocks.state.inserts).toHaveLength(2);
    expect(mocks.state.inserts[0]).toEqual({
      table: feedPreferenceEvents,
      values: expect.objectContaining({
        userId: 17,
        eventId,
        mediaId,
        action: "like",
        createdAt: expect.any(Date),
      }),
    });
    expect(mocks.state.inserts[1]).toEqual({
      table: feedPreferences,
      values: expect.objectContaining({
        userId: 17,
        payload: JSON.stringify(response.body.preferences),
        updatedAt: expect.any(Date),
      }),
    });
    expect(JSON.stringify(response.body)).not.toContain("userId");
    expect(JSON.stringify(response.body)).not.toContain("ownerUserId");
  });

  it("clamps updated weights and retains only bounded preference fields", async () => {
    const prior = {
      version: 1,
      weights: { "kind:image": 19.5 },
      dismissed: [],
    };
    mocks.state.results.push(
      [{ id: 17 }],
      [{ payload: JSON.stringify(prior) }],
      [],
      [mediaRow],
      [{ count: 2 }]
    );
    const response = await postSignal(signal);
    expect(response.status).toBe(200);
    expect(response.body.preferences.weights["kind:image"]).toBe(20);
    expect(
      Object.keys(response.body.preferences.weights).length
    ).toBeLessThanOrEqual(300);
    expect(response.body.preferences.dismissed).toHaveLength(0);
    expect(mocks.state.updates[0]).toEqual({
      table: feedPreferences,
      values: expect.objectContaining({
        payload: JSON.stringify(response.body.preferences),
        updatedAt: expect.any(Date),
      }),
    });
    expect(mocks.state.inserts).toHaveLength(1);
  });

  it("returns current preferences for an identical UUID retry without writes or timestamp changes", async () => {
    const preferences = {
      version: 1,
      weights: { "kind:image": 4 },
      dismissed: [],
    };
    mocks.state.results.push(
      [{ id: 17 }],
      [{ payload: JSON.stringify(preferences) }],
      [{ mediaId, action: "like" }]
    );
    const response = await postSignal(signal);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ preferences });
    expect(mocks.state.inserts).toHaveLength(0);
    expect(mocks.state.updates).toHaveLength(0);
    expect(mocks.state.tables).toEqual([
      users,
      feedPreferences,
      feedPreferenceEvents,
    ]);
  });

  it("rejects a UUID reused with different signal data as a conflict", async () => {
    mocks.state.results.push(
      [{ id: 17 }],
      [{ payload: JSON.stringify(emptyFeedPreferences()) }],
      [{ mediaId, action: "save" }]
    );
    expect((await postSignal(signal)).status).toBe(409);
    expect(mocks.state.inserts).toHaveLength(0);
    expect(mocks.state.updates).toHaveLength(0);
  });

  it("enforces the persisted daily limit before event or preference writes", async () => {
    mocks.state.results.push(
      [{ id: 17 }],
      [],
      [],
      [mediaRow],
      [{ count: 3000 }]
    );
    const response = await postSignal(signal);
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBeTruthy();
    expect(mocks.state.inserts).toHaveLength(0);
    expect(mocks.state.updates).toHaveLength(0);
  });

  it("rate limits authenticated users without creating an unbounded request map", async () => {
    mocks.state.userId = 987_654;
    const statuses: number[] = [];
    for (let i = 0; i < 121; i++) statuses.push((await request("/me")).status);
    expect(statuses.slice(0, 120).every(status => status === 200)).toBe(true);
    expect(statuses[120]).toBe(429);
  });
});
