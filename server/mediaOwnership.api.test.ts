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
import { createHash } from "node:crypto";
const state = vi.hoisted(() => ({
  results: [] as unknown[][],
  writes: [] as unknown[],
  loggedIn: true,
  userId: 1,
}));
vi.mock("./db", () => ({ getDb: async () => db }));
vi.mock("./_core/sdk", () => ({
  sdk: {
    authenticateRequest: async () => {
      if (!state.loggedIn) throw new Error();
      return { id: state.userId, isCron: false };
    },
  },
}));
const db: any = {
  select: () => {
    const q: any = {
      from: () => q,
      where: () => q,
      leftJoin: () => q,
      orderBy: () => q,
      limit: () => q,
      for: () => q,
      then: (r: any) => Promise.resolve(state.results.shift() ?? []).then(r),
    };
    return q;
  },
  transaction: async (f: any) => f(db),
  update: () => ({
    set: (v: any) => ({
      where: async () => {
        state.writes.push(v);
      },
    }),
  }),
  delete: () => ({
    where: async () => {
      state.writes.push("delete");
    },
  }),
  insert: () => ({
    values: async (v: any) => {
      state.writes.push(v);
    },
  }),
};
vi.mock("./mediaCreator", async importOriginal => {
  const original = await importOriginal<typeof import("./mediaCreator")>();
  return {
    ...original,
    ensureMediaCreator: vi.fn(async () => ({
      id: "c".repeat(32),
      displayName: "เจ้าของบัญชี",
      handle: "owner",
      avatarUrl: null,
    })),
  };
});
import { ensureMediaCreator } from "./mediaCreator";
import { registerPublicMediaRoutes } from "./media";
const id = "a".repeat(32),
  token = "a".repeat(43),
  hash = createHash("sha256").update(token).digest("hex");
let server: Server, origin: string;
beforeAll(async () => {
  const app = express();
  registerPublicMediaRoutes(app);
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
  state.results = [];
  state.writes = [];
  state.loggedIn = true;
  state.userId = 1;
  vi.mocked(ensureMediaCreator).mockClear();
});
async function claim(
  headers: Record<string, string> = {
    "X-Khing-Media-Account": "1",
    "X-Delete-Token": token,
  }
) {
  return fetch(`${origin}/api/media/${id}/claim`, { method: "POST", headers });
}
describe("public media authenticated ownership", () => {
  it("requires login and CSRF header for claiming a legacy post", async () => {
    state.loggedIn = false;
    expect((await claim()).status).toBe(401);
    state.loggedIn = true;
    expect((await claim({})).status).toBe(403);
    expect(state.writes).toEqual([]);
  });
  it("claims only with the legacy deletion capability and never steals another account post", async () => {
    state.results.push(
      [{ id: state.userId }],
      [{ ownerUserId: null, deleteTokenHash: hash }]
    );
    expect((await claim()).status).toBe(204);
    expect(state.writes).toEqual([{ ownerUserId: 1 }]);
    state.results.push(
      [{ id: state.userId }],
      [{ ownerUserId: 2, deleteTokenHash: hash }]
    );
    expect((await claim()).status).toBe(403);
    state.results.push(
      [{ id: state.userId }],
      [{ ownerUserId: null, deleteTokenHash: hash }]
    );
    expect(
      (
        await claim({
          "X-Khing-Media-Account": "1",
          "X-Delete-Token": "b".repeat(43),
        })
      ).status
    ).toBe(403);
    expect(state.writes).toHaveLength(1);
  });
  it("allows same-account deletion without local token and blocks another account", async () => {
    state.results.push([{ ownerUserId: 1, deleteTokenHash: hash }]);
    expect(
      (
        await fetch(`${origin}/api/media/${id}`, {
          method: "DELETE",
          headers: { "X-Khing-Media-Account": "1" },
        })
      ).status
    ).toBe(204);
    state.userId = 2;
    state.results.push([{ ownerUserId: 1, deleteTokenHash: hash }]);
    expect(
      (
        await fetch(`${origin}/api/media/${id}`, {
          method: "DELETE",
          headers: { "X-Khing-Media-Account": "1" },
        })
      ).status
    ).toBe(403);
    expect(state.writes).toEqual(["delete"]);
  });
  it("keeps guest deletion by token working", async () => {
    state.loggedIn = false;
    state.results.push([{ ownerUserId: null, deleteTokenHash: hash }]);
    expect(
      (
        await fetch(`${origin}/api/media/${id}`, {
          method: "DELETE",
          headers: { "X-Delete-Token": token },
        })
      ).status
    ).toBe(204);
  });
  it("gets upload owner only from validated session, never client metadata", async () => {
    const meta = Buffer.from(
      JSON.stringify({
        title: "Test",
        description: "",
        mimeType: "image/jpeg",
        ownerUserId: 999,
      })
    ).toString("base64url");
    const headers = {
      "Content-Type": "application/octet-stream",
      "X-Media-Meta": meta,
      "X-Khing-Media-Account": "1",
    };
    state.userId = 2;
    const r = await fetch(`${origin}/api/media`, {
      method: "POST",
      headers,
      body: Buffer.from([255, 216, 255, 224]),
    });
    expect(r.status).toBe(201);
    expect(state.writes[0]).toEqual(
      expect.objectContaining({ ownerUserId: 2 })
    );
    const result = await r.json();
    expect(result.item.isMine).toBe(true);
    expect(result.item.creator.displayName).toBe("เจ้าของบัญชี");
    expect(result.item).not.toHaveProperty("ownerUserId");
    state.loggedIn = false;
    expect(
      (
        await fetch(`${origin}/api/media`, {
          method: "POST",
          headers,
          body: Buffer.from([255, 216, 255, 224]),
        })
      ).status
    ).toBe(401);
  });
});

describe("public creator reads and automatic account uploads", () => {
  const creatorId = "c".repeat(32);
  const row = {
    id,
    title: "Post",
    description: "",
    kind: "image",
    mimeType: "image/png",
    size: 10,
    createdAt: new Date("2026-10-01"),
    ownerUserId: 1,
    creatorId,
    creatorName: "ชื่อบัญชี",
    creatorHandle: "my_name",
    creatorAvatarMime: "image/png",
    creatorRevision: "b".repeat(32),
    email: "secret@example.com",
    cover: "PRIVATE",
    deleteTokenHash: hash,
  };
  it("publishes a logged-in session without requiring the client to choose owner", async () => {
    const meta = Buffer.from(
      JSON.stringify({
        title: "Test",
        mimeType: "image/jpeg",
        ownerUserId: 999,
        creator: { displayName: "Spoof" },
      })
    ).toString("base64url");
    const r = await fetch(`${origin}/api/media`, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "X-Media-Meta": meta,
      },
      body: Buffer.from([255, 216, 255, 224]),
    });
    expect(r.status).toBe(201);
    expect(state.writes[0]).toMatchObject({ ownerUserId: 1 });
    expect((await r.json()).item.creator.displayName).toBe("เจ้าของบัญชี");
  });
  it("keeps true anonymous uploads available without creating a public identity", async () => {
    state.loggedIn = false;
    const meta = Buffer.from(
      JSON.stringify({
        title: "Test",
        mimeType: "image/jpeg",
        ownerUserId: 999,
      })
    ).toString("base64url");
    const r = await fetch(`${origin}/api/media`, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "X-Media-Meta": meta,
      },
      body: Buffer.from([255, 216, 255, 224]),
    });
    expect(r.status).toBe(201);
    expect(state.writes[0]).toMatchObject({ ownerUserId: null });
    expect(ensureMediaCreator).not.toHaveBeenCalled();
    expect((await r.json()).item.creator).toBe(null);
  });
  it("never creates public identity on a denied legacy claim", async () => {
    state.results.push(
      [{ id: 1 }],
      [{ ownerUserId: 2, deleteTokenHash: hash }]
    );
    expect((await claim()).status).toBe(403);
    expect(ensureMediaCreator).not.toHaveBeenCalled();
  });
  it("returns allowlisted public identity on post reads with viewer-specific ownership", async () => {
    state.loggedIn = false;
    state.results.push([row]);
    const r = await fetch(`${origin}/api/media/${id}`);
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.creator).toMatchObject({
      id: creatorId,
      displayName: "ชื่อบัญชี",
      handle: "my_name",
    });
    expect(body.isMine).toBe(false);
    expect(JSON.stringify(body)).not.toMatch(
      /email|userId|ownerUserId|deleteTokenHash|PRIVATE|secret/
    );
  });
  it("returns creator metadata to visitors without exposing private account fields", async () => {
    state.loggedIn = false;
    state.results.push([
      {
        id: creatorId,
        displayName: "ชื่อบัญชี",
        handle: "my_name",
        avatarMime: "image/png",
        revision: "b".repeat(32),
        userId: 1,
        email: "secret",
        bio: "PRIVATE",
        cover: "PRIVATE",
      },
    ]);
    const r = await fetch(`${origin}/api/media/creators/${creatorId}`);
    expect(r.status).toBe(200);
    expect(Object.keys(await r.json()).sort()).toEqual(
      ["avatarUrl", "displayName", "handle", "id"].sort()
    );
  });
  it("reads only the public avatar, rejects invalid types and unknown IDs", async () => {
    state.results.push([{ data: Buffer.from([1, 2]), mimeType: "image/png" }]);
    const r = await fetch(`${origin}/api/media/creators/${creatorId}/avatar`);
    expect(r.status).toBe(200);
    expect(Buffer.from(await r.arrayBuffer())).toEqual(Buffer.from([1, 2]));
    state.results.push([
      { data: Buffer.from([1, 2]), mimeType: "image/svg+xml" },
    ]);
    expect(
      (await fetch(`${origin}/api/media/creators/${creatorId}/avatar`)).status
    ).toBe(404);
    expect((await fetch(`${origin}/api/media/creators/1`)).status).toBe(404);
  });
  it("paginates creator posts with stable cursor and no private data", async () => {
    state.results.push(
      [{ userId: 1 }],
      Array.from({ length: 3 }, (_, i) => ({
        ...row,
        id: String(i).repeat(32),
      }))
    );
    const r = await fetch(
      `${origin}/api/media/creators/${creatorId}/posts?limit=2`
    );
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.items).toHaveLength(2);
    expect(body.nextCursor).toBeTypeOf("string");
    expect(JSON.stringify(body)).not.toMatch(
      /ownerUserId|deleteTokenHash|PRIVATE/
    );
  });
});
