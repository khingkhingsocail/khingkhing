import { describe, expect, it } from "vitest";
import { replyRoot, projectComment } from "./core";
const mediaId = "a".repeat(32);
const target = { id: 5, mediaId, parentId: null, deletedAt: null };
describe("reply relationship and tombstone", () => {
  it("resolves a direct reply and a reply-to-reply to the same single-depth thread", () => {
    expect(replyRoot(mediaId, target)).toBe(5);
    expect(replyRoot(mediaId, { ...target, id: 8, parentId: 5 }, target)).toBe(
      5
    );
  });
  it("rejects missing, deleted, cross-post, orphan and cyclic thread targets", () => {
    for (const t of [
      undefined,
      { ...target, deletedAt: new Date() },
      { ...target, mediaId: "b".repeat(32) },
    ])
      expect(() => replyRoot(mediaId, t)).toThrow();
    expect(() =>
      replyRoot(mediaId, { ...target, id: 8, parentId: 5 })
    ).toThrow();
    expect(() =>
      replyRoot(
        mediaId,
        { ...target, id: 8, parentId: 5 },
        { ...target, parentId: 8 }
      )
    ).toThrow();
  });
  it("keeps replies attached to deleted root but forbids replying directly to the deleted comment", () => {
    expect(replyRoot(mediaId, { ...target, id: 8, parentId: 5 }, target)).toBe(
      5
    );
    expect(() =>
      replyRoot(mediaId, { ...target, deletedAt: new Date() })
    ).toThrow();
  });
  it("projects a deleted root without author/text or ownership capability", () => {
    const row = {
      ...target,
      authorId: 1,
      authorName: "SensitiveName",
      text: "deleted private details",
      createdAt: new Date(),
      deletedAt: new Date(),
    };
    const result = projectComment(row, 1, 3);
    expect(result.deleted).toBe(true);
    expect(result.replyCount).toBe(3);
    expect(result.authorName).toBe("ความคิดเห็นถูกลบ");
    expect(result.text).toBe("");
    expect(result.isMine).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(
      /SensitiveName|private details|authorId/
    );
  });
});
