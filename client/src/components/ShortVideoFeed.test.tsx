import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ShortVideoFeed from "./ShortVideoFeed";

function renderFeed(statsOpen: boolean) {
  return renderToStaticMarkup(
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
    />,
  );
}

describe("feed statistics navigation", () => {
  it("places ขิงขิง immediately after สำหรับคุณ before video/image filters", () => {
    const html = renderFeed(false);
    const tabs = [...html.matchAll(/role="tab"[^>]*>([^<]+)<\/button>/g)].map((match) => match[1]);
    expect(tabs).toEqual(["สำหรับคุณ", "ขิงขิง", "วิดีโอ", "ภาพ"]);
    expect(html).toContain('id="feed-tab-khingkhing"');
    expect(html).toContain('aria-controls="feed-stats-panel"');
  });

  it("shows the renamed statistics panel and hides video feed while active", () => {
    const html = renderFeed(true);
    expect(html).toContain('short-feed-page--stats');
    expect(html).toContain('id="feed-stats-panel" role="tabpanel" aria-labelledby="feed-tab-khingkhing"');
    expect(html).toContain('KHING KHING ARENA');
    expect(html).toContain('อันดับโปรไฟล์');
    expect(html).toMatch(/id="feed-posts-panel"[^>]*hidden=""/);
    expect(html).toContain('aria-selected="true" class="is-active">ขิงขิง');
    expect(html).toContain('ข้อมูลที่กรอกเองยังไม่ยืนยัน');
    expect(html).toContain('ตารางสถิติไฟล์รูป / วิดีโอ');
  });

  it("keeps the default For You feed visible and statistics unmounted until selected", () => {
    const html = renderFeed(false);
    expect(html).not.toContain('id="feed-stats-panel" role="tabpanel"');
    expect(html).toContain('aria-selected="true" class="is-active">สำหรับคุณ');
    expect(html).not.toMatch(/id="feed-posts-panel"[^>]*hidden=""/);
  });
});
