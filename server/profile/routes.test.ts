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
    canonical: null as Record<string, any> | null,
    inserts: [] as unknown[],
    updates: [] as unknown[],
    locks: 0,
    authenticated: true,
    cron: false,
    userId: 17,
    dbAvailable: true,
    rejectImage: false,
    authCalls: 0,
  };
  const db: any = {
    select: () => {
      const chain: any = {
        from: () => chain,
        where: () => chain,
        limit: () => chain,
        for: () => {
          state.locks += 1;
          return chain;
        },
        then: (
          resolve: (value: unknown[]) => unknown,
          reject?: (cause: unknown) => unknown
        ) =>
          Promise.resolve(
            state.results.length
              ? state.results.shift()!
              : state.canonical
                ? [state.canonical]
                : []
          ).then(resolve, reject),
      };
      return chain;
    },
    transaction: async (work: (tx: any) => Promise<unknown>) => work(db),
    insert: () => ({
      values: async (value: unknown) => {
        state.inserts.push(value);
        const row = value as Record<string, any>;
        state.canonical = {
          ...row,
          avatarSize: row.avatar?.length ?? null,
          coverSize: row.cover?.length ?? null,
          updatedAt: row.updatedAt ?? new Date(),
        };
      },
    }),
    update: () => ({
      set: (value: unknown) => ({
        where: async () => {
          state.updates.push(value);
          const updates = value as Record<string, any>;
          const previous = state.canonical ?? {};
          state.canonical = {
            ...previous,
            ...updates,
            avatarSize:
              "avatar" in updates
                ? (updates.avatar?.length ?? null)
                : (previous.avatarSize ?? null),
            coverSize:
              "cover" in updates
                ? (updates.cover?.length ?? null)
                : (previous.coverSize ?? null),
          };
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
      if (!mocks.state.authenticated) throw new Error("not authenticated");
      return { id: mocks.state.userId, isCron: mocks.state.cron };
    },
  },
}));
vi.mock("../verification/media", () => ({
  inspectEvidence: vi.fn(async () => {
    if (mocks.state.rejectImage) throw new Error("invalid image");
    return { kind: "image", duration: null, width: 32, height: 32 };
  }),
}));

vi.mock("../mediaCreator", () => ({
  syncPublishedCreator: vi.fn(async () => {}),
}));
import { syncPublishedCreator } from "../mediaCreator";
import { inspectEvidence } from "../verification/media";
import { registerProfileRoutes } from "./routes";

let server: Server;
let origin: string;

beforeAll(async () => {
  const app = express();
  registerProfileRoutes(app);
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
  mocks.state.canonical = null;
  mocks.state.inserts = [];
  mocks.state.updates = [];
  mocks.state.locks = 0;
  mocks.state.authenticated = true;
  mocks.state.cron = false;
  mocks.state.userId = 17;
  mocks.state.dbAvailable = true;
  mocks.state.rejectImage = false;
  mocks.state.authCalls = 0;
  vi.mocked(inspectEvidence).mockClear();
  vi.mocked(syncPublishedCreator).mockClear();
});

const textProfile = {
  displayName: "ผู้ใช้ทดสอบ",
  handle: "profile_user",
  bio: "แนะนำตัว",
  location: "กรุงเทพฯ",
  website: "portfolio.example.com",
  category: "ครีเอเตอร์",
};
function multipartBody(
  payload: Record<string, unknown> = { ...textProfile, expectedRevision: null },
  files: Partial<Record<"avatar" | "cover", Blob>> = {}
) {
  const form = new FormData();
  form.append("profile", JSON.stringify(payload));
  for (const [field, blob] of Object.entries(files)) {
    if (blob) form.append(field, blob, `${field}.png`);
  }
  return form;
}
async function request(path: string, init: RequestInit = {}, csrf = true) {
  const headers = new Headers(init.headers);
  if (csrf) headers.set("X-Khing-Profile", "1");
  const response = await fetch(`${origin}/api/profile${path}`, {
    ...init,
    headers,
  });
  const body = response.headers
    .get("content-type")
    ?.includes("application/json")
    ? await response.json()
    : Buffer.from(await response.arrayBuffer());
  return { status: response.status, body, headers: response.headers };
}

describe("private account profile HTTP routes", () => {
  it("sets private no-store headers and returns null when an authenticated user has no row", async () => {
    mocks.state.results.push([]);
    const response = await request("/me");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ profile: null });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("returns a JSON 404 with private cache headers for an unknown profile endpoint", async () => {
    const response = await request("/unknown");
    expect(response.status).toBe(404);
    expect(response.body).toHaveProperty("error");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("requires the anti-CSRF marker and a real non-cron account session on every private route", async () => {
    expect((await request("/me", {}, false)).status).toBe(403);
    mocks.state.authenticated = false;
    expect((await request("/me")).status).toBe(401);
    mocks.state.authenticated = true;
    mocks.state.cron = true;
    expect((await request("/me/avatar")).status).toBe(401);
    expect(mocks.state.results).toHaveLength(0);
  });

  it("fails closed when the managed database is unavailable", async () => {
    mocks.state.dbAvailable = false;
    const response = await request("/me");
    expect(response.status).toBe(503);
    expect(response.body).toHaveProperty("error");
  });

  it("rejects client user IDs and unsafe website userinfo before database writes", async () => {
    const withClientId = await request("/me", {
      method: "PUT",
      body: multipartBody({
        ...textProfile,
        expectedRevision: null,
        userId: 99,
      }),
    });
    expect(withClientId.status).toBe(400);
    const unsafe = await request("/me", {
      method: "PUT",
      body: multipartBody({
        ...textProfile,
        website: "https://user:pass@example.com",
        expectedRevision: null,
      }),
    });
    expect(unsafe.status).toBe(400);
    expect(mocks.state.inserts).toHaveLength(0);
    expect(mocks.state.updates).toHaveLength(0);
  });

  it("locks the authenticated user before the profile and creates only an authenticated userId row", async () => {
    const image = new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });
    mocks.state.results.push([{ id: 17 }], []);
    const response = await request("/me", {
      method: "PUT",
      body: multipartBody(
        { ...textProfile, expectedRevision: null },
        { avatar: image }
      ),
    });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      profile: {
        displayName: "ผู้ใช้ทดสอบ",
        handle: "profile_user",
        website: "https://portfolio.example.com/",
        revision: expect.stringMatching(/^[a-f0-9]{32}$/),
        avatar: {
          url: "/api/profile/me/avatar",
          mimeType: "image/png",
          size: 3,
        },
        cover: null,
      },
    });
    expect(mocks.state.locks).toBe(2);
    expect(mocks.state.inserts).toHaveLength(1);
    expect(mocks.state.inserts[0]).toEqual(
      expect.objectContaining({
        userId: 17,
        displayName: "ผู้ใช้ทดสอบ",
        handle: "profile_user",
        website: "https://portfolio.example.com/",
        avatar: Buffer.from([1, 2, 3]),
        avatarMime: "image/png",
        cover: null,
        revision: expect.stringMatching(/^[a-f0-9]{32}$/),
      })
    );
    expect(mocks.state.inserts[0]).not.toHaveProperty("id");
    expect(inspectEvidence).toHaveBeenCalledTimes(1);
    expect(syncPublishedCreator).toHaveBeenCalledWith(
      mocks.db,
      17,
      expect.objectContaining({
        displayName: "ผู้ใช้ทดสอบ",
        handle: "profile_user",
      }),
      expect.objectContaining({ data: Buffer.from([1, 2, 3]) }),
      false
    );
  });

  it("returns 409 for a stale revision and never writes", async () => {
    mocks.state.results.push([{ id: 17 }], [{ revision: "a".repeat(32) }]);
    const response = await request("/me", {
      method: "PUT",
      body: multipartBody({ ...textProfile, expectedRevision: "b".repeat(32) }),
    });
    expect(response.status).toBe(409);
    expect(mocks.state.locks).toBe(2);
    expect(mocks.state.inserts).toHaveLength(0);
    expect(mocks.state.updates).toHaveLength(0);
  });

  it("keeps existing images when omitted and clears only explicit removal flags", async () => {
    mocks.state.canonical = {
      ...textProfile,
      website: "https://portfolio.example.com/",
      revision: "a".repeat(32),
      avatar: Buffer.from([1, 2]),
      avatarMime: "image/png",
      avatarSize: 2,
      cover: Buffer.from([3, 4]),
      coverMime: "image/webp",
      coverSize: 2,
      updatedAt: new Date(),
    };
    mocks.state.results.push([{ id: 17 }], [{ revision: "a".repeat(32) }]);
    const keep = await request("/me", {
      method: "PUT",
      body: multipartBody({ ...textProfile, expectedRevision: "a".repeat(32) }),
    });
    expect(keep.status).toBe(200);
    expect(mocks.state.updates[0]).not.toHaveProperty("avatar");
    expect(mocks.state.updates[0]).not.toHaveProperty("cover");

    mocks.state.results.push([{ id: 17 }], [{ revision: "b".repeat(32) }]);
    const remove = await request("/me", {
      method: "PUT",
      body: multipartBody({
        ...textProfile,
        expectedRevision: "b".repeat(32),
        removeAvatar: true,
      }),
    });
    expect(remove.status).toBe(200);
    expect(mocks.state.updates[1]).toMatchObject({
      avatar: null,
      avatarMime: null,
    });
    expect(mocks.state.updates[1]).not.toHaveProperty("cover");
    expect((remove.body as { profile: unknown }).profile).toMatchObject({
      avatar: null,
      cover: { url: "/api/profile/me/cover", mimeType: "image/webp", size: 2 },
    });

    mocks.state.results.push([{ id: 17 }], [{ revision: "c".repeat(32) }]);
    const mixed = await request("/me", {
      method: "PUT",
      body: multipartBody(
        { ...textProfile, expectedRevision: "c".repeat(32), removeCover: true },
        { avatar: new Blob([new Uint8Array([5, 6, 7])], { type: "image/png" }) }
      ),
    });
    expect(mixed.status).toBe(200);
    expect(mocks.state.updates[2]).toMatchObject({
      avatar: Buffer.from([5, 6, 7]),
      avatarMime: "image/png",
      cover: null,
      coverMime: null,
    });
    expect((mixed.body as { profile: unknown }).profile).toMatchObject({
      avatar: { url: "/api/profile/me/avatar", mimeType: "image/png", size: 3 },
      cover: null,
    });
  });

  it("rejects oversized and undecodable files before any profile write", async () => {
    const tooLarge = new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], {
      type: "image/png",
    });
    const tooLargeResult = await request("/me", {
      method: "PUT",
      body: multipartBody(
        { ...textProfile, expectedRevision: null },
        { avatar: tooLarge }
      ),
    });
    expect(tooLargeResult.status).toBe(413);

    mocks.state.rejectImage = true;
    const invalid = await request("/me", {
      method: "PUT",
      body: multipartBody(
        { ...textProfile, expectedRevision: null },
        {
          cover: new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }),
        }
      ),
    });
    expect(invalid.status).toBe(400);
    expect(mocks.state.inserts).toHaveLength(0);
  });

  it("serves only the authenticated account's image bytes with private cache headers", async () => {
    mocks.state.userId = 23;
    mocks.state.results.push([
      { data: Buffer.from([9, 8, 7]), mimeType: "image/png" },
    ]);
    const response = await request("/me/avatar");
    expect(response.status).toBe(200);
    expect(response.body).toEqual(Buffer.from([9, 8, 7]));
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});
