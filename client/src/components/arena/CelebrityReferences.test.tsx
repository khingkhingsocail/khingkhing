import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import CelebrityReferences from "./CelebrityReferences";
describe("celebrity public benchmarks", () => {
  it("identifies imported public references as distinct from real participant accounts", () => {
    const html = renderToStaticMarkup(
      <CelebrityReferences category="sports" />
    );
    expect(html).toContain("สถิติคนดัง");
    expect(html).toContain("ไม่ใช่บัญชีที่สมัครขิงขิงหรือผู้เข้าร่วมแข่งขัน");
    expect(html).toContain("แยกจากอันดับรายเดือนของคุณ");
    expect(html).toContain("กำลังโหลดสถิติอ้างอิง");
    expect(html).not.toContain("Usain Bolt"); // No fake seed while data is not loaded.
    expect(html).toContain("ดูทุกหมวดอ้างอิง");
    expect(html).toContain("ไม่รวมข้อมูลส่วนตัวหรือสถิติที่ตรวจไม่ได้");
  });
});
