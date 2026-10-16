import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import RankingViewBadge, { RankingViewCount } from "./RankingViewBadge";
describe("ranking view labels", () => {
  it("distinguishes real zero, unknown and openings from unique people", () => {
    expect(renderToStaticMarkup(<RankingViewCount total={0} />)).toContain(
      "เปิดดู 0 ครั้ง"
    );
    expect(renderToStaticMarkup(<RankingViewCount />)).toContain(
      "เปิดดู — ครั้ง"
    );
    expect(renderToStaticMarkup(<RankingViewCount total={1200} />)).toContain(
      "1,200"
    );
    expect(renderToStaticMarkup(<RankingViewCount total={5} />)).toContain(
      "ไม่ใช่จำนวนคนไม่ซ้ำ"
    );
  });
  it("does not count or show invented history during render", () => {
    const html = renderToStaticMarkup(
      <RankingViewBadge
        target={{ kind: "community-board", key: "sports:run100|2026-10" }}
      />
    );
    expect(html).toContain("เปิดดู — ครั้ง");
    expect(html).not.toContain("เปิดดู 0 ครั้ง");
  });
});
