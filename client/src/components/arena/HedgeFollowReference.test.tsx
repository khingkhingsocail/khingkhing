import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import HedgeFollowReference from "./HedgeFollowReference";

describe("HedgeFollow reference card", () => {
  it("shows source type and 13F limits without claiming integration or live returns", () => {
    const html = renderToStaticMarkup(<HedgeFollowReference />);
    expect(html).toContain("แหล่งรวบรวมเพิ่มเติม");
    expect(html).toContain('href="https://hedgefollow.com/"');
    expect(html).toContain("45 วัน");
    expect(html).toContain("ยังไม่ได้เชื่อมดึงข้อมูลหรือซิงค์อัตโนมัติ");
    expect(html).toContain("ไม่ใช่วันที่ข้อมูลพอร์ต");
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).not.toContain("iframe");
  });
  it("shows organizational portfolio links only for supported entities", () => {
    const html = renderToStaticMarkup(
      <HedgeFollowReference entityId="warren-buffett" />
    );
    expect(html).toContain(
      'href="https://hedgefollow.com/funds/Berkshire+Hathaway"'
    );
    expect(html).toContain("ไม่ใช่พอร์ตส่วนตัว");
    expect(renderToStaticMarkup(<HedgeFollowReference entityId="voo" />)).toBe(
      ""
    );
  });
});
