import { describe, expect, it } from "vitest";
import { commentAuthorName, commentInput } from "../../../shared/comments";
import { mergeComments } from "./comments";
const clientId = "11111111-1111-4111-8111-111111111111";
describe("comment validation and list merge", () => {
  it("accepts actual Thai text and 1000 Unicode characters, rejects empty/control and fake sender", () => {
    expect(
      commentInput.parse({ clientId, text: "  ดีมาก\r\nเลย  " }).text
    ).toBe("ดีมาก\nเลย");
    expect(
      commentInput.safeParse({ clientId, text: "🚀".repeat(1000) }).success
    ).toBe(true);
    expect(
      commentInput.safeParse({ clientId, text: "x".repeat(1001) }).success
    ).toBe(false);
    expect(commentInput.safeParse({ clientId, text: "  " }).success).toBe(
      false
    );
    expect(commentInput.safeParse({ clientId, text: "hi\u0000" }).success).toBe(
      false
    );
    expect(
      commentInput.safeParse({ clientId, text: "hi", authorId: 3 }).success
    ).toBe(false);
  });
  it("does not publish email as display name", () => {
    expect(commentAuthorName("private@example.com")).toBe("สมาชิกขิงขิง");
    expect(commentAuthorName(null)).toBe("สมาชิกขิงขิง");
    expect(commentAuthorName("  นักกีฬา  ")).toBe("นักกีฬา");
  });
  it("accepts nullable reply target and rejects malformed or client-supplied parent", () => {
    expect(
      commentInput.parse({ clientId, text: "คำตอบ" }).replyToId
    ).toBeNull();
    expect(
      commentInput.parse({ clientId, text: "คำตอบ", replyToId: 42 }).replyToId
    ).toBe(42);
    for (const replyToId of [0, -1, 1.5, "42", 2147483648])
      expect(
        commentInput.safeParse({ clientId, text: "คำตอบ", replyToId }).success
      ).toBe(false);
    expect(
      commentInput.safeParse({
        clientId,
        text: "คำตอบ",
        replyToId: 42,
        parentId: 12,
      }).success
    ).toBe(false);
  });
  it("merges older comments without duplicates in stable newest-first order", () => {
    const row = {
      id: 9,
      mediaId: "a".repeat(32),
      isMine: false,
      authorName: "Tester",
      text: "hello",
      createdAt: new Date().toISOString(),
      parentId: null,
      replyToName: null,
      deleted: false,
      replyCount: 0,
    };
    expect(
      mergeComments(
        [row, { ...row, id: 8 }],
        [
          { ...row, id: 8, text: "latest" },
          { ...row, id: 7 },
        ]
      ).map(c => [c.id, c.text])
    ).toEqual([
      [9, "hello"],
      [8, "latest"],
      [7, "hello"],
    ]);
  });
  it("removes a deleted root after its last surviving reply is deleted", () => {
    const root = {
      id: 9,
      mediaId: "a".repeat(32),
      isMine: false,
      authorName: "ความคิดเห็นถูกลบ",
      text: "",
      createdAt: new Date().toISOString(),
      parentId: null,
      replyToName: null,
      deleted: true,
      replyCount: 1,
    };
    expect(mergeComments([root], [{ ...root, replyCount: 0 }])).toEqual([]);
    expect(mergeComments([root], [{ ...root, replyCount: 2 }])).toHaveLength(1);
  });
});
