import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import DiscoverWorks from "./DiscoverWorks";
import KhingArena from "./arena/KhingArena";
import type { ChatTarget } from "../../../shared/chat";

function props(section: "works" | "khingkhing" = "works") {
  return {
    section,
    onSectionChange: vi.fn(),
    likedIds: new Set(["public-a"]),
    savedIds: new Set(["public-b"]),
    onOpenPost: vi.fn(),
    onOpenChat: vi.fn(),
  };
}
function elements(
  node: ReactNode
): Array<ReactElement<Record<string, unknown>>> {
  return Children.toArray(node).flatMap(child => {
    if (!isValidElement<Record<string, unknown>>(child)) return [];
    return [child, ...elements(child.props.children as ReactNode)];
  });
}

describe("Discover works and Khing Khing navigation", () => {
  it("keeps gallery as the default and shows two selectable columns", () => {
    const html = renderToStaticMarkup(<DiscoverWorks {...props()} />);
    expect(html).toContain("ค้นพบผลงาน");
    expect(html).toContain('aria-label="หมวดค้นพบผลงาน"');
    expect(html).toMatch(/id="discover-section-works"[^>]*aria-pressed="true"/);
    expect(html).toMatch(
      /id="discover-section-khingkhing"[^>]*aria-pressed="false"/
    );
    expect(html).toContain("ทางเดินหลังฝน");
    expect(html).not.toContain("KHING KHING ARENA");
  });
  it("shows the existing Arena, categories and media tools when selected, without hidden gallery media", () => {
    const html = renderToStaticMarkup(
      <DiscoverWorks {...props("khingkhing")} />
    );
    expect(html).toMatch(
      /id="discover-section-khingkhing"[^>]*aria-pressed="true"/
    );
    expect(html).toContain('aria-labelledby="discover-section-khingkhing"');
    expect(html).toContain("KHING KHING ARENA");
    expect(html).toContain("อันดับโปรไฟล์");
    expect(html).toContain("หมวดหมู่แข่งขัน");
    expect(html).toContain("ห้องพูดคุยหมวด");
    expect(html).toContain("ตารางสถิติไฟล์รูป / วิดีโอ");
    expect(html).not.toContain("ทางเดินหลังฝน");
    expect(html).not.toContain("playfolio-flower");
  });
  it("selects either column and forwards the same session sets and post/chat targets", () => {
    const p = props("khingkhing");
    const tree = elements(DiscoverWorks(p));
    const buttons = tree.filter(element => element.type === "button");
    (buttons[0].props.onClick as () => void)();
    (buttons[1].props.onClick as () => void)();
    expect(p.onSectionChange.mock.calls).toEqual([["works"], ["khingkhing"]]);
    const arena = tree.find(element => element.type === KhingArena)!;
    expect(arena.props.likedIds).toBe(p.likedIds);
    expect(arena.props.savedIds).toBe(p.savedIds);
    const id = "a".repeat(32);
    (arena.props.onOpenPost as (id: string) => void)(id);
    const target: ChatTarget = { category: "sports", period: "2026-10" };
    (arena.props.onOpenChat as (target: ChatTarget) => void)(target);
    expect(p.onOpenPost.mock.calls).toEqual([[id]]);
    expect(p.onOpenChat.mock.calls).toEqual([[target]]);
  });
});
