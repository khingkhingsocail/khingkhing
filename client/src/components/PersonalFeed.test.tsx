import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ShortVideoFeed, { selectIdentityPosts } from "./ShortVideoFeed";
const render = (statsOpen: boolean) =>
  renderToStaticMarkup(
    <ShortVideoFeed
      likedIds={new Set()}
      savedIds={new Set()}
      followed={false}
      statsOpen={statsOpen}
      onStatsChange={() => {}}
      onLike={() => {}}
      onSave={() => {}}
      onFollow={() => {}}
      onOpenOwnProfile={() => {}}
    />
  );
describe("personal feed accessibility and transparency", () => {
  it("shows vertical swipe guidance and previous/next buttons", () => {
    const html = render(false);
    expect(html).toContain("feed-scroll--swipe");
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('aria-label="โพสต์ถัดไป"');
    expect(html).toContain('aria-label="โพสต์ก่อนหน้า"');
    expect(html).toContain("สไลด์ขึ้น");
  });
  it("labels guest preferences and exposes a personal-learning toggle", () => {
    const html = render(false);
    expect(html).toContain("ความชอบเฉพาะเบราว์เซอร์นี้");
    expect(html).toContain("ปรับตามความชอบ: เปิด");
    expect(html).not.toContain("ซิงค์ข้ามอุปกรณ์");
  });
  it("does not show swipe buttons or record learning when Arena is open", () => {
    const html = render(true);
    expect(html).not.toContain('aria-label="โพสต์ถัดไป"');
    expect(html).not.toContain("personal-feed-settings");
    expect(html).toContain("KHING KHING ARENA");
  });
  it("shows neutral posts rather than another account's ranking and reasons", () => {
    const ranked = [
      { id: "b", reason: "old account affinity" },
      { id: "a", reason: "old account creator" },
    ];
    const neutral = [
      { id: "a", reason: "" },
      { id: "b", reason: "" },
    ];
    expect(
      selectIdentityPosts(ranked, neutral, "account-1", "guest", true)
    ).toBe(neutral);
    expect(
      selectIdentityPosts(ranked, neutral, "account-1", "account-2", false)
    ).toBe(neutral);
    expect(
      selectIdentityPosts(ranked, neutral, "account-1", "account-1", false)
    ).toBe(neutral);
    expect(
      selectIdentityPosts(ranked, neutral, "account-1", "account-1", true)
    ).toBe(ranked);
  });
});
