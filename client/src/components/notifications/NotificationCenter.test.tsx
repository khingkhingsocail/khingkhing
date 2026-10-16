import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NotificationCenter } from "./NotificationCenter";

describe("NotificationCenter static UI", () => {
  it("renders an accessible bell without inventing a guest unread count", () => {
    const markup = renderToStaticMarkup(
      <NotificationCenter authenticated={false} onOpen={vi.fn()} />
    );
    expect(markup).toContain('aria-label="การแจ้งเตือน"');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain("manus-no-record");
    expect(markup).not.toContain("notification-center__badge");
  });

  it("does not render a speculative badge before an authenticated inbox response", () => {
    const markup = renderToStaticMarkup(
      <NotificationCenter authenticated onOpen={vi.fn()} />
    );
    expect(markup).toContain('aria-label="การแจ้งเตือน"');
    expect(markup).not.toContain("notification-center__badge");
  });
});
