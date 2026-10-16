import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Router } from "wouter";
import raw from "../../../../data/investment-references.json";
import { investmentReferenceSchema } from "../../../../shared/investmentReferences";
import InvestmentDashboard, {
  FeaturedInvestmentCards,
} from "../../pages/InvestmentDashboard";
import InvestmentDataExplorer from "./InvestmentDataExplorer";
import { ReportedHoldings } from "./InvestmentDetails";
const records = raw.map(value => investmentReferenceSchema.parse(value));
describe("investment dashboard UI", () => {
  it("renders a public dashboard with an honest pending integration state", () => {
    const html = renderToStaticMarkup(
      <Router ssrPath="/investments">
        <InvestmentDashboard />
      </Router>
    );
    expect(html).toContain("รอคู่มือเชื่อมต่อข้อมูล");
    expect(html).toContain("ยังไม่แสดงตัวเลขจาก HedgeFollow");
    expect(html).toContain("กำลังโหลดข้อมูลอ้างอิงจากฐานข้อมูล");
    expect(html).toContain('href="/feed"');
    expect(html).not.toContain("43.64");
    expect(html).not.toContain("1,032");
  });
  it("shows four curated organization links without badges of performance rank", () => {
    const html = renderToStaticMarkup(<FeaturedInvestmentCards />);
    expect(html).toContain("Warren Buffett");
    expect(html).toContain("Ray Dalio");
    expect(html).toContain("Bill Ackman");
    expect(html).toContain("Stanley Druckenmiller");
    expect(html).toContain("รอข้อมูลจากช่องทาง HedgeFollow ที่อนุญาต");
    expect(html).not.toContain("#1");
    expect(html).toContain('rel="noopener noreferrer"');
  });
  it("separates existing official data and exposes accessible name sorting", () => {
    const html = renderToStaticMarkup(
      <InvestmentDataExplorer records={records} />
    );
    expect(html).toContain("6 รายการที่แสดง");
    expect(html).toContain("ไม่ใช่ข้อมูลที่ดึงจาก HedgeFollow");
    expect(html).toContain('aria-sort="ascending"');
    expect(html).toContain("Vanguard S&amp;P 500 ETF (VOO)");
    expect(html).not.toContain("ผลตอบแทนดีที่สุด");
  });
  it("uses absolute 0–100 percent scale instead of normalizing partial holdings", () => {
    const html = renderToStaticMarkup(
      <ReportedHoldings record={records.find(record => record.id === "voo")!} />
    );
    expect(html).toContain('aria-valuemax="100"');
    expect(html).toContain('aria-valuenow="8.08"');
    expect(html).toContain('style="width:8.08%"');
    expect(html).toContain("2026-08-31");
    const unknown = renderToStaticMarkup(
      <ReportedHoldings
        record={records.find(record => record.id === "berkshire-hathaway")!}
      />
    );
    expect(unknown).toContain("ไม่มีน้ำหนักพอร์ตในเอกสารที่ใช้");
    expect(unknown).not.toContain('aria-valuenow="0"');
  });
});
