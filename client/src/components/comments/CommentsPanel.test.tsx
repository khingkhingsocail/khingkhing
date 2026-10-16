import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const state = vi.hoisted(() => ({ authenticated: true }));
vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({
    user: state.authenticated ? { id: 1 } : null,
    isAuthenticated: state.authenticated,
    loading: false,
    refresh: vi.fn(),
  }),
}));
vi.mock("@/const", () => ({ openLoginPage: vi.fn() }));
import CommentsPanel from "./CommentsPanel";
const post = {
  id: "public-" + "a".repeat(32),
  title: "ผลงานสาธารณะ",
  caption: "รายละเอียด",
  visibility: "public" as const,
  publicMediaId: "a".repeat(32),
};
beforeEach(() => {
  state.authenticated = true;
});
describe("real comments panel", () => {
  it("shows actual editable composer for authenticated users with explicit public visibility", () => {
    const html = renderToStaticMarkup(
      <CommentsPanel post={post} onClose={vi.fn()} />
    );
    expect(html).toContain('role="dialog"');
    expect(html).toContain("textarea");
    expect(html).toContain("ส่งความคิดเห็น");
    expect(html).toContain("1000");
    expect(html).toContain("ความคิดเห็นเป็นสาธารณะ");
    expect(html).not.toContain("ยังไม่ได้เชื่อม API");
  });
  it("guests can read status but must sign in to add public text", () => {
    state.authenticated = false;
    const html = renderToStaticMarkup(
      <CommentsPanel post={post} onClose={vi.fn()} />
    );
    expect(html).toContain("เข้าสู่ระบบขิงขิง");
    expect(html).not.toContain("textarea");
    expect(html).toContain("รีเฟรชความคิดเห็น");
  });
  it("does not send or allow editing comments on private/demo content", () => {
    for (const visibility of ["demo", "private"] as const) {
      const html = renderToStaticMarkup(
        <CommentsPanel post={{ ...post, visibility }} onClose={vi.fn()} />
      );
      expect(html).toContain("ความคิดเห็นเปิดเฉพาะโพสต์สาธารณะ");
      expect(html).not.toContain("textarea");
    }
  });
});

describe("notification thread entry", () => {
  it("accepts a root target without exposing recipient or author account IDs", () => {
    const html = renderToStaticMarkup(
      <CommentsPanel
        post={{
          ...post,
          title: "โพสต์",
          publicMediaId: "a".repeat(32),
        }}
        initialRootId={10}
        onClose={() => {}}
      />
    );
    expect(html).toContain("ความคิดเห็น");
    expect(html).not.toContain("recipientId");
    expect(html).not.toContain("authorId");
  });
});
