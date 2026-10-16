import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import CommentMessage from "./CommentMessage";
import CommentThread from "./CommentThread";
const row = {
  id: 10,
  mediaId: "a".repeat(32),
  parentId: null,
  replyToName: null,
  isMine: false,
  authorName: "Friend",
  text: "ข้อความจากเพื่อน",
  createdAt: new Date().toISOString(),
  deleted: false,
  replyCount: 4,
};
const props = {
  authenticated: true,
  disabled: false,
  deleting: null,
  onReply: vi.fn(),
  onDelete: vi.fn(),
};
describe("reply thread UI", () => {
  it("shows a reply button for another person's comment without a delete capability", () => {
    const html = renderToStaticMarkup(
      <CommentMessage comment={row} rootId={10} {...props} />
    );
    expect(html).toContain("ตอบกลับความคิดเห็นของ Friend");
    expect(html).toContain("ข้อความจากเพื่อน");
    expect(html).not.toContain("ลบความคิดเห็น");
    expect(props.onReply).not.toHaveBeenCalled();
  });
  it("shows replies count and expandable thread control", () => {
    const html = renderToStaticMarkup(
      <CommentThread
        comment={row}
        mediaId={row.mediaId}
        {...props}
        refreshVersion={0}
        forceOpenId={null}
      />
    );
    expect(html).toContain("ดู 4 คำตอบ");
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-controls="comment-replies-10"');
  });
  it("supports reply-to-reply label and author-only delete", () => {
    const html = renderToStaticMarkup(
      <CommentMessage
        comment={{
          ...row,
          parentId: 10,
          id: 11,
          isMine: true,
          replyToName: "Friend",
        }}
        rootId={10}
        {...props}
      />
    );
    expect(html).toContain("ตอบกลับ Friend");
    expect(html).toContain("ลบความคิดเห็น");
  });
  it("deleted roots never display former text or reply button but can show surviving replies", () => {
    const html = renderToStaticMarkup(
      <CommentThread
        comment={{
          ...row,
          deleted: true,
          authorName: "ความคิดเห็นถูกลบ",
          text: "",
        }}
        mediaId={row.mediaId}
        {...props}
        refreshVersion={0}
        forceOpenId={null}
      />
    );
    expect(html).toContain("ความคิดเห็นนี้ถูกลบแล้ว");
    expect(html).toContain("ดู 4 คำตอบ");
    expect(html).not.toContain("ข้อความจากเพื่อน");
    expect(html).not.toContain("ตอบกลับความคิดเห็นของ");
  });
});
