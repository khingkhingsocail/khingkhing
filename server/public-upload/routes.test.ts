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
import { createHash } from "node:crypto";
const state = vi.hoisted(() => ({
  reads: [] as Array<any[] | (() => any[])>,
  writes: [] as any[],
  userId: null as number | null,
}));
vi.mock("../db", () => ({ getDb: async () => db }));
vi.mock("../_core/sdk", () => ({
  sdk: {
    authenticateRequest: async () => {
      if (state.userId === null) throw new Error();
      return { id: state.userId };
    },
  },
}));
vi.mock("../mediaCreator", () => ({
  ensureMediaCreator: async () => ({
    id: "c".repeat(32),
    displayName: "บัญชีจริง",
    handle: "owner",
    avatarUrl: null,
  }),
}));
vi.mock("./normalize", () => ({
  normalizePublicUpload: vi.fn(async () => ({
    data: Buffer.from([1, 2, 3]),
    kind: "image",
    mimeType: "image/jpeg",
  })),
}));
const db: any = {
  transaction: async (f: any) => f(db),
  select: () => {
    const q: any = {
      from: () => q,
      leftJoin: () => q,
      where: () => q,
      limit: () => q,
      for: () => q,
      orderBy: () => q,
      then: (r: any) => {
        const result = state.reads.shift() ?? [];
        return Promise.resolve(
          typeof result === "function" ? result() : result
        ).then(r);
      },
    };
    return q;
  },
  insert: (t: any) => ({
    values: (v: any) => ({
      then: (r: any) => Promise.resolve(state.writes.push(v)).then(r),
      onDuplicateKeyUpdate: async () => {
        /* allocator has no public payload */
      },
    }),
  }),
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
};
import { normalizePublicUpload } from "./normalize";
import { registerPublicUploadRoutes } from "./routes";
import { PUBLIC_UPLOAD_CHUNK_BYTES } from "../../shared/publicUpload";
const id = "a".repeat(32),
  token = "b".repeat(43);
const session = (extra = {}) => ({
  id,
  ownerUserId: null,
  tokenHash: createHash("sha256").update(token).digest("hex"),
  size: 3,
  state: "uploading",
  title: "Test",
  description: "",
  expiresAt: new Date(Date.now() + 86400000),
  updatedAt: new Date(),
  ...extra,
});
const item = {
  id,
  title: "Test",
  description: "",
  kind: "image",
  mimeType: "image/jpeg",
  size: 3,
  createdAt: new Date(),
};
let server: Server, origin: string;
beforeAll(async () => {
  const app = express();
  registerPublicUploadRoutes(app);
  server = createServer(app);
  await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
  origin = `http://127.0.0.1:${(server.address() as any).port}`;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>(r => server.close(() => r()));
});
beforeEach(() => {
  state.reads = [];
  state.writes = [];
  state.userId = null;
  vi.mocked(normalizePublicUpload).mockClear();
});
const headers = { "X-Khing-Upload": "1", "X-Upload-Token": token };
const put = (body: Buffer, extra = {}, index = 0) =>
  fetch(`${origin}/api/media/uploads/${id}/chunks/${index}`, {
    method: "PUT",
    headers: {
      ...headers,
      "Content-Type": "application/octet-stream",
      ...extra,
    },
    body: new Uint8Array(body),
  });
const complete = () =>
  fetch(`${origin}/api/media/uploads/${id}/complete`, {
    method: "POST",
    headers,
  });
describe("public upload capability and retry", () => {
  it("rejects missing header, caps 1,000MiB, and requires claimed login", async () => {
    expect(
      (await fetch(`${origin}/api/media/uploads`, { method: "POST" })).status
    ).toBe(403);
    for (const size of [0, 1000 * 1024 * 1024 + 1])
      expect(
        (
          await fetch(`${origin}/api/media/uploads`, {
            method: "POST",
            headers: { ...headers, "Content-Type": "application/json" },
            body: JSON.stringify({ size }),
          })
        ).status
      ).toBe(413);
    expect(
      (
        await fetch(`${origin}/api/media/uploads`, {
          method: "POST",
          headers: {
            ...headers,
            "Content-Type": "application/json",
            "X-Khing-Media-Account": "1",
          },
          body: JSON.stringify({ size: 3 }),
        })
      ).status
    ).toBe(401);
    expect(state.writes).toEqual([]);
  });
  it("creates 1,000MiB session with validated owner not spoofed metadata", async () => {
    state.userId = 7;
    state.reads.push([], [{ id: 1 }], [{ count: 0, bytes: 0 }]);
    const r = await fetch(`${origin}/api/media/uploads`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        size: 1000 * 1024 * 1024,
        ownerUserId: 999,
        title: "Hello",
      }),
    });
    expect(r.status).toBe(201);
    const result = await r.json();
    expect(result.chunkBytes).toBe(PUBLIC_UPLOAD_CHUNK_BYTES);
    expect(result.token).toHaveLength(43);
    expect(result).not.toHaveProperty("ownerUserId");
    expect(state.writes[0].ownerUserId).toBe(7);
  });
  it("reserves staging capacity under the allocator lock and rejects a full quota", async () => {
    state.reads.push([], [{ id: 1 }], [{ count: 100, bytes: 0 }]);
    const r = await fetch(`${origin}/api/media/uploads`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ size: 3 }),
    });
    expect(r.status).toBe(429);
    expect(state.writes).toEqual([]);
  });
  it("prevents other accounts or bad tokens from sending chunks", async () => {
    state.reads.push([session()]);
    expect(
      (await put(Buffer.from([1, 2, 3]), { "X-Upload-Token": "c".repeat(43) }))
        .status
    ).toBe(403);
    state.userId = 8;
    state.reads.push([session({ ownerUserId: 7 })]);
    expect((await put(Buffer.from([1, 2, 3]))).status).toBe(401);
    expect(state.writes).toEqual([]);
  });
  it("requires exact chunk length and permits only identical retry", async () => {
    state.reads.push([session()]);
    expect((await put(Buffer.from([1]))).status).toBe(400);
    const body = Buffer.from([1, 2, 3]);
    state.reads.push([session()], []);
    expect((await put(body)).status).toBe(204);
    expect(state.writes).toHaveLength(1);
    state.reads.push(
      [session()],
      [{ sha256: createHash("sha256").update(body).digest("hex") }]
    );
    expect((await put(body)).status).toBe(204);
    expect(state.writes).toHaveLength(1);
    state.reads.push([session()], [{ sha256: "bad" }]);
    expect((await put(body)).status).toBe(409);
  });
  it("does not publish incomplete or expired files", async () => {
    state.reads.push([session()], [{ count: 0 }]);
    expect((await complete()).status).toBe(409);
    state.reads.push([session({ expiresAt: new Date(0) })]);
    expect((await complete()).status).toBe(410);
    expect(state.writes).toEqual([]);
  });
  it("complete retry returns the same post/token without inserting again", async () => {
    state.reads.push([session({ state: "complete" })], [item]);
    const r = await complete();
    expect(r.status).toBe(200);
    expect((await r.json()).deleteToken).toBe(token);
    expect(state.writes).toEqual([]);
  });
  it("publishes normalized chunks atomically and never assigns a guest session to a later login", async () => {
    state.userId = 7;
    state.reads.push(
      [session()],
      [{ count: 1 }],
      [{ data: Buffer.from([1, 2, 3]) }],
      () => [
        session({
          state: "processing",
          processingKey: state.writes[0].processingKey,
        }),
      ],
      [item]
    );
    const r = await complete();
    expect(r.status).toBe(201);
    const body = await r.json();
    expect(body.item.isMine).toBe(false);
    expect(body.item.creator).toBe(null);
    expect(state.writes.find(v => v.storageMode)).toMatchObject({
      id,
      ownerUserId: null,
      storageMode: "chunks",
      size: 3,
    });
    expect(
      state.writes.find(v => v.mediaId)?.data.equals(Buffer.from([1, 2, 3]))
    ).toBe(true);
    expect(state.writes.at(-1)).toMatchObject({
      state: "complete",
      processingKey: null,
    });
  });
  it("rejects a processing lease replaced before publication", async () => {
    state.reads.push(
      [session()],
      [{ count: 1 }],
      [{ data: Buffer.from([1, 2, 3]) }],
      [session({ state: "processing", processingKey: "changed" })]
    );
    expect((await complete()).status).toBe(409);
    expect(state.writes.filter(v => v.storageMode)).toEqual([]);
    expect(state.writes.at(-1)).toMatchObject({ state: "uploading" });
  });
  it("keeps staged files private and rejects extra huge chunks", async () => {
    expect(
      (await fetch(`${origin}/api/media/uploads/${id}/chunks/0`, { headers }))
        .status
    ).toBe(404);
    expect(
      (await put(Buffer.alloc(PUBLIC_UPLOAD_CHUNK_BYTES + 1))).status
    ).toBe(413);
    expect(state.writes).toEqual([]);
  });
});
