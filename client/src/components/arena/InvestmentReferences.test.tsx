import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Router } from "wouter";
import InvestmentReferences from "./InvestmentReferences";
describe("investment reference directory UI", () => {
  it("renders separate investor fund and company tabs without fabricated loading data", () => {
    const html = renderToStaticMarkup(
      <Router ssrPath="/feed">
        <InvestmentReferences />
      </Router>
    );
    expect(html).toContain("การลงทุน · นักลงทุน กองทุน และบริษัท");
    expect(html).toContain("หัวข้อย่อยการลงทุน");
    expect(html).toContain("นักลงทุน");
    expect(html).toContain("กองทุน");
    expect(html).toContain("บริษัท");
    expect(html).toContain("กำลังโหลดข้อมูลการลงทุน");
    expect(html).toContain("ไม่ใช่บัญชีผู้เข้าร่วมขิงขิงหรือคำแนะนำซื้อขาย");
    expect(html).toContain("HedgeFollow แหล่งอ้างอิงเพิ่มเติม");
    expect(html).toContain('href="https://hedgefollow.com/"');
    expect(html).not.toContain("Warren Buffett");
    expect(html).not.toContain("#1");
  });
});
