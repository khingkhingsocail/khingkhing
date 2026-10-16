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
const state = vi.hoisted(() => ({
  results: [] as unknown[][],
  writes: [] as unknown[],
  loggedIn: true,
  cron: false,
  admin: false,
}));
vi.mock("../db", () => ({ getDb: async () => db }));
vi.mock("../_core/sdk", () => ({
  sdk: {
    authenticateRequest: async () => {
      if (!state.loggedIn) throw new Error("not authenticated");
      return {
        id: 1,
        role: state.admin ? "admin" : "user",
        isCron: state.cron,
      };
    },
  },
}));
vi.mock("../verification/media", () => ({
  inspectEvidence: vi.fn(async () => ({
    kind: "image",
    duration: null,
    width: 10,
    height: 10,
  })),
}));
vi.mock("../arena", () => ({
  arenaTokenMatches: (token: string) => token === "valid-owner-token",
}));
const db = {
  select: () => {
    const chain: any = {
      from: () => chain,
      where: () => chain,
      innerJoin: () => chain,
      leftJoin: () => chain,
      orderBy: () => chain,
      for: () => chain,
      limit: async () => state.results.shift() ?? [],
      then: (resolve: any) =>
        Promise.resolve(state.results.shift() ?? []).then(resolve),
    };
    return chain;
  },
  selectDistinct: () => db.select(),
  transaction: async (fn: any) => fn(db),
  insert: () => ({
    values: (value: any) => {
      state.writes.push(value);
      return {
        onDuplicateKeyUpdate: async () => {},
        then: (resolve: any) => Promise.resolve().then(resolve),
      };
    },
  }),
  update: () => ({
    set: (value: any) => ({
      where: async () => {
        state.writes.push(value);
      },
    }),
  }),
};
import { registerChatRoutes } from "./routes";
import { chatPayloadHash } from "./core";
const roomId = "a".repeat(32),
  profileId = "b".repeat(32),
  fileId = "c".repeat(32);
const now = new Date();
const account = {
  userId: 1,
  displayName: "Chat Tester",
  arenaProfileId: null,
  createdAt: now,
};
const room = {
  id: roomId,
  kind: "group",
  title: "Test Group",
  ownerUserId: 1,
  directKey: null,
  channelKey: null,
  category: null,
  boardKey: null,
  period: null,
  updatedAt: now,
};
const member = (state = "active") => ({
  room,
  member: { id: 1, roomId, userId: 1, state },
});
const person = {
  userId: 1,
  displayName: "Chat Tester",
  arenaProfileId: null,
  avatar: null,
  handle: null,
};
const clientId = "11111111-1111-4111-8111-111111111111";
const message = {
  id: 10,
  roomId,
  senderId: 1,
  clientId,
  text: "hello",
  payloadHash: chatPayloadHash("hello", []),
  createdAt: now,
};
let server: Server, origin: string;
async function request(
  path: string,
  method = "GET",
  body?: unknown,
  headers: Record<string, string> = { "X-Khing-Chat": "1" }
) {
  const multipart = body instanceof FormData;
  const r = await fetch(origin + "/api/chat" + path, {
    method,
    headers: {
      ...headers,
      ...(body && !multipart ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: multipart ? body : JSON.stringify(body) } : {}),
  });
  const data = await r.text();
  let result: any;
  try {
    result = JSON.parse(data);
  } catch {
    result = data;
  }
  return { status: r.status, body: result, headers: r.headers };
}
const sendBody = () => {
  const form = new FormData();
  form.append("clientId", clientId);
  form.append("text", "hello");
  return form;
};
beforeAll(async () => {
  const app = express();
  registerChatRoutes(app);
  server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const a = server.address();
  if (!a || typeof a === "string") throw new Error();
  origin = `http://127.0.0.1:${a.port}`;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
});
beforeEach(() => {
  state.results.length = 0;
  state.writes.length = 0;
  state.loggedIn = true;
  state.cron = false;
  state.admin = false;
});
describe("chat real session and privacy gates", () => {
  it("blocks unauthenticated users before metadata/body access", async () => {
    state.loggedIn = false;
    expect((await request("/me")).status).toBe(401);
    expect(
      (await request(`/rooms/${roomId}/messages`, "POST", sendBody())).status
    ).toBe(401);
    expect(state.writes).toHaveLength(0);
  });
  it("does not accept cron identities as conversational users", async () => {
    state.cron = true;
    expect((await request("/me")).status).toBe(401);
  });
  it("requires custom same-origin chat header on writes", async () => {
    expect(
      (await request("/me", "POST", { displayName: "Test" }, {})).status
    ).toBe(403);
    expect(state.writes).toHaveLength(0);
  });
  it("requires chat account setup before browsing people", async () => {
    state.results.push([]);
    expect((await request("/people")).status).toBe(428);
  });
  it("me projection never exposes auth identity/email or tokens", async () => {
    state.results.push([account], [person]);
    const r = await request("/me");
    expect(r.status).toBe(200);
    expect(r.body.account).toEqual(person);
    expect(r.body).not.toHaveProperty("email");
    expect(r.headers.get("cache-control")).toContain("no-store");
  });
  it("rejects profile binding without owner proof and does not write", async () => {
    state.results.push([account], [{ id: profileId, editTokenHash: "hash" }]);
    const r = await request("/me", "POST", {
      displayName: "Name",
      arenaProfileId: profileId,
    });
    expect(r.status).toBe(403);
    expect(state.writes).toHaveLength(0);
  });
  it("prevents binding an Arena profile already bound to another real account", async () => {
    state.results.push(
      [account],
      [{ id: profileId, editTokenHash: "hash" }],
      [{ userId: 2, arenaProfileId: profileId }]
    );
    const r = await request(
      "/me",
      "POST",
      { displayName: "Name", arenaProfileId: profileId },
      { "X-Khing-Chat": "1", "X-Arena-Token": "valid-owner-token" }
    );
    expect(r.status).toBe(409);
    expect(state.writes).toHaveLength(0);
  });
  it("invited user can see invitation metadata but not member details or messages", async () => {
    state.results.push([account], [member("invited")]);
    const r = await request(`/rooms/${roomId}`);
    expect(r.status).toBe(200);
    expect(r.body.members).toEqual([]);
    state.results.push([account], [member("invited")]);
    expect((await request(`/rooms/${roomId}/messages`)).status).toBe(403);
  });
  it("no administrator bypass to private messages/files when not a member", async () => {
    state.admin = true;
    state.results.push([account], []);
    expect((await request(`/rooms/${roomId}/messages`)).status).toBe(403);
    state.results.push(
      [account],
      [{ id: fileId, roomId, kind: "image", mimeType: "image/png", size: 3 }],
      []
    );
    expect((await request(`/files/${fileId}`)).status).toBe(403);
  });
  it("left members cannot upload text/files", async () => {
    state.results.push([account], [member("left")]);
    expect(
      (await request(`/rooms/${roomId}/messages`, "POST", sendBody())).status
    ).toBe(403);
    expect(state.writes).toHaveLength(0);
  });
  it("returns message and file metadata without BLOBs or payloadHash", async () => {
    state.results.push(
      [account],
      [member()],
      [message],
      [
        {
          id: fileId,
          messageId: 10,
          filename: "test.jpg",
          kind: "image",
          mimeType: "image/jpeg",
          size: 20,
        },
      ],
      [person],
      [member()]
    );
    const r = await request(`/rooms/${roomId}/messages`);
    expect(r.status).toBe(200);
    expect(r.body.messages[0].files[0].filename).toBe("test.jpg");
    expect(JSON.stringify(r.body)).not.toContain("payloadHash");
    expect(r.body.messages[0].files[0]).not.toHaveProperty("data");
  });
});
describe("chat invitations and channel access", () => {
  it("acceptance transitions invited member to active under room lock", async () => {
    state.results.push([account], [room], [member("invited")]);
    const r = await request(`/rooms/${roomId}/respond`, "POST", {
      accept: true,
    });
    expect(r.status).toBe(200);
    expect(state.writes).toContainEqual(
      expect.objectContaining({ state: "active" })
    );
  });
  it("decline removes invitation without exposing history", async () => {
    state.results.push([account], [room], [member("invited")]);
    expect(
      (await request(`/rooms/${roomId}/respond`, "POST", { accept: false }))
        .status
    ).toBe(200);
    expect(state.writes).toContainEqual(
      expect.objectContaining({ state: "left" })
    );
  });
  it("only owner can add group invitees", async () => {
    state.results.push(
      [account],
      [room],
      [{ ...member(), room: { ...room, ownerUserId: 2 } }]
    );
    expect(
      (await request(`/rooms/${roomId}/invite`, "POST", { userIds: [3] }))
        .status
    ).toBe(403);
    expect(state.writes).toHaveLength(0);
  });
  it("DM pair is reused rather than creating a second conversation", async () => {
    state.results.push(
      [account],
      [account],
      [{ id: 2 }],
      [{ ...room, kind: "direct" }],
      [
        { userId: 1, state: "active" },
        { userId: 2, state: "invited" },
      ]
    );
    const r = await request("/rooms", "POST", {
      kind: "direct",
      recipientId: 2,
    });
    expect(r.status).toBe(201);
    expect(r.body.roomId).toBe(roomId);
    expect(state.writes).toHaveLength(0);
  });
  it("cannot reinvite a DM participant who rejected or left", async () => {
    state.results.push(
      [account],
      [account],
      [{ id: 2 }],
      [{ ...room, kind: "direct" }],
      [
        { userId: 1, state: "active" },
        { userId: 2, state: "left" },
      ]
    );
    expect(
      (await request("/rooms", "POST", { kind: "direct", recipientId: 2 }))
        .status
    ).toBe(403);
    expect(state.writes).toHaveLength(0);
  });
  it("competition channel requires matching bound Arena claim", async () => {
    state.results.push([account]);
    expect(
      (
        await request("/channels/join", "POST", {
          category: "sports",
          period: "2026-10",
          boardKey: null,
        })
      ).status
    ).toBe(403);
    expect(state.writes).toHaveLength(0);
  });
});
describe("chat atomic message and retry", () => {
  it("safe retry returns existing UUID message without inserting a duplicate", async () => {
    state.results.push([account], [member()], [message], [], [person]);
    const r = await request(`/rooms/${roomId}/messages`, "POST", sendBody());
    expect(r.status).toBe(200);
    expect(r.body.message.id).toBe(10);
    expect(state.writes).toHaveLength(0);
  });
  it("rejects reused UUID for altered content", async () => {
    state.results.push(
      [account],
      [member()],
      [{ ...message, text: "other", payloadHash: chatPayloadHash("other", []) }]
    );
    expect(
      (await request(`/rooms/${roomId}/messages`, "POST", sendBody())).status
    ).toBe(409);
    expect(state.writes).toHaveLength(0);
  });
  it("rechecks membership under room lock before persisting a send racing leave", async () => {
    state.results.push(
      [account],
      [member()],
      [],
      [account],
      [room],
      [member("left")]
    );
    expect(
      (await request(`/rooms/${roomId}/messages`, "POST", sendBody())).status
    ).toBe(403);
    expect(state.writes).toHaveLength(0);
  });
  it("persists text with server-selected sender and stable retry UUID", async () => {
    state.results.push(
      [account],
      [member()],
      [],
      [account],
      [room],
      [member()],
      [],
      [{ bytes: 0 }],
      [message],
      [],
      [person]
    );
    const r = await request(`/rooms/${roomId}/messages`, "POST", sendBody());
    expect(r.status).toBe(201);
    expect(r.body.message.text).toBe("hello");
    expect(state.writes).toContainEqual(
      expect.objectContaining({ senderId: 1, clientId, text: "hello" })
    );
  });
  it("rejects cursor combinations before querying message content", async () => {
    state.results.push([account], [member()]);
    expect(
      (await request(`/rooms/${roomId}/messages?before=10&after=2`)).status
    ).toBe(400);
  });
});

describe("chat attachment transaction and privacy regression", () => {
  it("persists attachments with message in same transaction using server sender", async () => {
    const data = Buffer.from("fixture-image");
    const body = sendBody();
    body.append(
      "files",
      new Blob([data], { type: "image/png" }),
      "my-image.png"
    );
    const saved = {
      ...message,
      payloadHash: chatPayloadHash("hello", [
        { data, size: data.length, mimeType: "image/png" },
      ]),
    };
    state.results.push(
      [account],
      [member()],
      [],
      [account],
      [room],
      [member()],
      [],
      [{ bytes: 0 }],
      [saved],
      [
        {
          id: fileId,
          messageId: 10,
          filename: "my-image.png",
          kind: "image",
          mimeType: "image/png",
          size: data.length,
        },
      ],
      [person]
    );
    const result = await request(`/rooms/${roomId}/messages`, "POST", body);
    expect(result.status).toBe(201);
    expect(result.body.message.files[0].filename).toBe("my-image.png");
    expect(state.writes).toContainEqual(
      expect.arrayContaining([
        expect.objectContaining({
          messageId: 10,
          senderId: 1,
          kind: "image",
          data,
        }),
      ])
    );
  });
  it("storage quota is checked under sender lock before inserting message", async () => {
    const body = sendBody();
    body.append(
      "files",
      new Blob(["fixture"], { type: "image/png" }),
      "photo.png"
    );
    state.results.push(
      [account],
      [member()],
      [],
      [account],
      [room],
      [member()],
      [],
      [{ bytes: 200 * 1024 * 1024 }]
    );
    expect(
      (await request(`/rooms/${roomId}/messages`, "POST", body)).status
    ).toBe(400);
    expect(state.writes).toHaveLength(0);
  });
  it("does not return history if membership changed while projecting metadata", async () => {
    state.results.push(
      [account],
      [member()],
      [message],
      [],
      [person],
      [member("left")]
    );
    const result = await request(`/rooms/${roomId}/messages`);
    expect(result.status).toBe(403);
    expect(result.body).not.toHaveProperty("messages");
  });
  it("authorized image delivery is private and revocation denies subsequent requests", async () => {
    state.results.push(
      [account],
      [
        {
          id: fileId,
          messageId: 10,
          roomId,
          filename: "image.png",
          kind: "image",
          mimeType: "image/png",
          size: 3,
        },
      ],
      [member()],
      [{ data: Buffer.from("abc") }],
      [member()]
    );
    const result = await request(`/files/${fileId}`);
    expect(result.status).toBe(200);
    expect(result.body).toBe("abc");
    expect(result.headers.get("cache-control")).toContain("no-store");
    state.results.push([account], [{ id: fileId, roomId }], [member("left")]);
    expect((await request(`/files/${fileId}`)).status).toBe(403);
  });
  it("eligible competitor may join a channel with fresh bound profile proof under lock", async () => {
    const bound = { ...account, arenaProfileId: profileId };
    state.results.push(
      [bound],
      [{ id: "stat" }],
      [bound],
      [{ id: "stat" }],
      [{ ...room, kind: "channel" }]
    );
    const result = await request("/channels/join", "POST", {
      category: "sports",
      boardKey: null,
      period: "2026-10",
    });
    expect(result.status).toBe(200);
    expect(result.body.roomId).toBe(roomId);
    expect(state.writes).toContainEqual(
      expect.objectContaining({ roomId, userId: 1, state: "active" })
    );
  });
  it("stale Arena binding cannot grant channel access after changing accounts", async () => {
    state.results.push(
      [{ ...account, arenaProfileId: profileId }],
      [{ id: "stat" }],
      [account]
    );
    const result = await request("/channels/join", "POST", {
      category: "sports",
      boardKey: null,
      period: "2026-10",
    });
    expect(result.status).toBe(403);
    expect(state.writes).toHaveLength(0);
  });
});

describe("chat inbox pagination and canonical channel", () => {
  it("offers a stable cursor rather than discarding rooms beyond the first page", async () => {
    const rows = Array.from({ length: 51 }, (_, index) => ({
      room: { ...room, id: (index + 1).toString(16).padStart(32, "0") },
      member: { state: "active" },
    }));
    state.results.push([account], rows);
    const result = await request("/rooms");
    expect(result.status).toBe(200);
    expect(result.body.rooms).toHaveLength(50);
    expect(result.body.nextCursor).toEqual({
      time: now.toISOString(),
      id: rows[49].room.id,
    });
    expect(result.body.rooms[0]).not.toHaveProperty("directKey");
    state.results.push([account], [rows[50]]);
    const next = await request(
      "/rooms?" +
        new URLSearchParams({
          beforeTime: result.body.nextCursor.time,
          beforeId: result.body.nextCursor.id,
        })
    );
    expect(next.status).toBe(200);
    expect(next.body.rooms[0].id).toBe(rows[50].room.id);
    expect(next.body.nextCursor).toBeNull();
  });
  it("rejects malformed inbox cursor and empty board keys before writing", async () => {
    state.results.push([account]);
    expect((await request("/rooms?beforeId=not-valid")).status).toBe(400);
    state.results.push([account]);
    expect(
      (
        await request("/channels/join", "POST", {
          category: "sports",
          period: "2026-10",
          boardKey: "",
        })
      ).status
    ).toBe(400);
    expect(state.writes).toHaveLength(0);
  });
  it("rejects reused message UUID when attachment filename is changed", async () => {
    const data = Buffer.from("fixture");
    const body = sendBody();
    body.append(
      "files",
      new Blob([data], { type: "image/png" }),
      "renamed.png"
    );
    state.results.push(
      [account],
      [member()],
      [
        {
          ...message,
          payloadHash: chatPayloadHash("hello", [
            {
              data,
              size: data.length,
              mimeType: "image/png",
              filename: "original.png",
            },
          ]),
        },
      ]
    );
    expect(
      (await request(`/rooms/${roomId}/messages`, "POST", body)).status
    ).toBe(409);
    expect(state.writes).toHaveLength(0);
  });
});
