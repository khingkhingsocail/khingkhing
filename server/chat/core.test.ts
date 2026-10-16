import { describe, it, expect } from "vitest";
import {
  canReadChat,
  directChatKey,
  channelChatKey,
  chatMessageInput,
  createChatInput,
  chatAccountInput,
} from "../../shared/chat";
import {
  requireChatMember,
  chatPayloadHash,
  eligibleForChannel,
  type ChatReader,
} from "./core";
function reader(rows: unknown[]) {
  const chain: any = {
    from: () => chain,
    innerJoin: () => chain,
    where: () => chain,
    limit: async () => rows,
  };
  return { select: () => chain } as ChatReader;
}
describe("chat membership", () => {
  it("only active members can read and no invited/left/missing membership leaks data", async () => {
    for (const state of ["invited", "left"])
      await expect(
        requireChatMember(
          reader([{ room: { id: "a".repeat(32) }, member: { state } }]),
          "a".repeat(32),
          1
        )
      ).rejects.toThrow("ไม่มีสิทธิ์");
    await expect(
      requireChatMember(reader([]), "a".repeat(32), 1)
    ).rejects.toThrow();
    expect(canReadChat("active")).toBe(true);
    expect(canReadChat("invited")).toBe(false);
  });
  it("invited member may read invitation metadata only when explicitly allowed", async () => {
    const result = await requireChatMember(
      reader([{ room: { id: "a".repeat(32) }, member: { state: "invited" } }]),
      "a".repeat(32),
      1,
      true
    );
    expect(result.member.state).toBe("invited");
  });
  it("room id is validated before querying", async () => {
    await expect(requireChatMember(reader([]), "../room", 1)).rejects.toThrow(
      "ไม่พบ"
    );
  });
  it("requires bound profile and matching statistic to join a channel", async () => {
    expect(
      await eligibleForChannel(reader([]), null, {
        category: "sports",
        boardKey: null,
        period: "2026-10",
      })
    ).toBe(false);
    expect(
      await eligibleForChannel(reader([]), "a".repeat(32), {
        category: "sports",
        boardKey: null,
        period: "2026-10",
      })
    ).toBe(false);
    expect(
      await eligibleForChannel(reader([{ id: "entry" }]), "a".repeat(32), {
        category: "sports",
        boardKey: "sports:run100",
        period: "2026-10",
      })
    ).toBe(true);
  });
});
describe("chat room identity and send validation", () => {
  it("uses same sorted direct pair independent of initiating person", () => {
    expect(directChatKey(2, 1)).toBe(directChatKey(1, 2));
    expect(() => directChatKey(1, 1)).toThrow();
  });
  it("never merges categories, board or month channels", () => {
    const a = {
      category: "sports" as const,
      boardKey: null,
      period: "2026-10",
    };
    expect(channelChatKey(a)).not.toBe(
      channelChatKey({ ...a, boardKey: "sports:run100" })
    );
    expect(channelChatKey(a)).not.toBe(
      channelChatKey({ ...a, period: "2026-09" })
    );
  });
  it("rejects client-set sender/verified/group admin fields and too-long text", () => {
    const base = {
      text: "hello",
      clientId: "11111111-1111-4111-8111-111111111111",
    };
    expect(chatMessageInput.safeParse(base).success).toBe(true);
    expect(chatMessageInput.safeParse({ ...base, senderId: 2 }).success).toBe(
      false
    );
    expect(
      chatMessageInput.safeParse({ ...base, text: "a".repeat(2001) }).success
    ).toBe(false);
    expect(
      createChatInput.safeParse({
        kind: "group",
        title: "test",
        memberIds: [2],
        ownerUserId: 2,
      }).success
    ).toBe(false);
    expect(
      chatAccountInput.safeParse({ displayName: "Nick", role: "admin" }).success
    ).toBe(false);
  });
  it("payload hash detects altered text, bytes and MIME for reused UUID", () => {
    const file = { data: Buffer.from("a"), size: 1, mimeType: "image/png" };
    const hash = chatPayloadHash("hello", [file]);
    expect(hash).toBe(chatPayloadHash("hello", [file]));
    expect(hash).not.toBe(chatPayloadHash("changed", [file]));
    expect(hash).not.toBe(
      chatPayloadHash("hello", [{ ...file, data: Buffer.from("b") }])
    );
    expect(hash).not.toBe(
      chatPayloadHash("hello", [{ ...file, mimeType: "video/mp4" }])
    );
  });
});

import {
  retryChatTransaction,
  retryableChatConflict,
  normalizeChatFilename,
  type ChatDB,
  ChatError,
} from "./core";
import { channelInput } from "../../shared/chat";
describe("chat creation race recovery", () => {
  it("recognizes nested MySQL unique/deadlock conflicts but never treats permission errors as retryable", () => {
    expect(retryableChatConflict({ cause: { code: "ER_DUP_ENTRY" } })).toBe(
      true
    );
    expect(retryableChatConflict({ errno: 1213 })).toBe(true);
    expect(retryableChatConflict(new ChatError(403, "denied"))).toBe(false);
  });
  it("opposite initiators racing a simulated unique key recover canonical room without a duplicate", async () => {
    let canonical: string | null = null;
    let inserts = 0;
    const db = {
      transaction: async (fn: (tx: unknown) => Promise<string>) => fn({}),
    } as unknown as ChatDB;
    async function work() {
      const observed = canonical;
      await new Promise(resolve => setImmediate(resolve));
      if (observed) return observed;
      if (canonical) throw { code: "ER_DUP_ENTRY" };
      canonical = "room-canonical";
      inserts++;
      return canonical;
    }
    const result = await Promise.all([
      retryChatTransaction(db, work),
      retryChatTransaction(db, work),
    ]);
    expect(result).toEqual(["room-canonical", "room-canonical"]);
    expect(inserts).toBe(1);
  });
  it("recovers deadlock but limits repeated failures to three attempts", async () => {
    let attempts = 0;
    const db = {
      transaction: async () => {
        attempts++;
        throw { cause: { errno: 1213 } };
      },
    } as unknown as ChatDB;
    await expect(retryChatTransaction(db, async () => null)).rejects.toEqual({
      cause: { errno: 1213 },
    });
    expect(attempts).toBe(3);
  });
  it("does not retry business authorization failures", async () => {
    let attempts = 0;
    const db = {
      transaction: async () => {
        attempts++;
        throw new ChatError(403, "denied");
      },
    } as unknown as ChatDB;
    await expect(retryChatTransaction(db, async () => null)).rejects.toThrow(
      "denied"
    );
    expect(attempts).toBe(1);
  });
  it("rejects empty/whitespace board keys so category channels have one null representation", () => {
    const base = { category: "sports", period: "2026-10" };
    expect(channelInput.safeParse({ ...base, boardKey: "" }).success).toBe(
      false
    );
    expect(channelInput.safeParse({ ...base, boardKey: "  " }).success).toBe(
      false
    );
    expect(channelInput.parse(base).boardKey).toBeNull();
  });
  it("hash includes filename and normalizes Thai/control characters consistently", () => {
    const file = { data: Buffer.from("a"), size: 1, mimeType: "image/png" };
    expect(chatPayloadHash("hello", [{ ...file, filename: "a.png" }])).not.toBe(
      chatPayloadHash("hello", [{ ...file, filename: "b.png" }])
    );
    expect(normalizeChatFilename("ภาพ.png")).toBe("ภาพ.png");
    expect(
      normalizeChatFilename(Buffer.from("ภาพ.png", "utf8").toString("latin1"))
    ).toBe("ภาพ.png");
    expect(normalizeChatFilename("ab\u0000.png")).toBe("ab.png");
  });
});
