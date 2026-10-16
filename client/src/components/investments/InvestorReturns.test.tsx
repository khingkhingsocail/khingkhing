import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import InvestorReturns, { InvestorReturnsTable } from "./InvestorReturns";
import InvestorReturnDetails from "./InvestorReturnDetails";
import type { InvestorReturn } from "../../../../shared/investorReturns";
const record: InvestorReturn = {
  id: "test-investor",
  investor: "Warren Buffett",
  organization: "Berkshire Hathaway",
  submitted: {
    value: 19.7,
    period: "1965–2025",
    basis: "ทบต้น",
    sourceUrl: "https://example.com/report",
  },
  reportedValue: 19.7,
  reportedPeriod: "1965–2025",
  reportedBasis: "Compounded annual gain · Per-share market value",
  status: "partial",
  summary: "ตัวเลขรายงานบริษัทไม่ใช่ผลส่วนบุคคล",
  caveats: "Test caution",
  sources: [
    {
      url: "https://example.com/report",
      title: "Fixture report",
      excerpt: "Fixture excerpt",
      retrievedAt: "2026-10-09T06:00:00Z",
      supports: "Supports fixture",
    },
  ],
  extras: [
    {
      label: "1974",
      text: "−48.7%",
      sourceUrl: "https://example.com/report",
      confirmed: true,
    },
  ],
};
describe("investor returns UI", () => {
  it("waits for real database data and never uses submitted values as silent fallback", () => {
    const html = renderToStaticMarkup(<InvestorReturns />);
    expect(html).toContain("กำลังโหลดผลตอบแทนจากฐานข้อมูล");
    expect(html).not.toContain("19.7%");
    expect(html).not.toContain("ผลตอบแทนดีที่สุด");
  });
  it("shows the requested columns, clickable investor and non-comparable warning", () => {
    const html = renderToStaticMarkup(
      <InvestorReturnsTable
        records={[record]}
        query=""
        sort="name"
        onOpen={() => {}}
      />
    );
    for (const text of [
      "นักลงทุน",
      "บริษัท / กองทุน",
      "ช่วงเวลาที่วัด",
      "ผลตอบแทนเฉลี่ยต่อปี",
      "Warren Buffett",
      "19.7%",
      "ยืนยันได้บางส่วน",
      "ไม่ใช่อันดับความเก่ง",
    ])
      expect(html).toContain(text);
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('aria-sort="ascending"');
  });
  it("labels an unverified input as user-submitted rather than established data", () => {
    const html = renderToStaticMarkup(
      <InvestorReturnsTable
        records={[
          { ...record, status: "unverified", reportedValue: null, sources: [] },
        ]}
        query=""
        sort="value-desc"
        onOpen={() => {}}
      />
    );
    expect(html).toContain("ค่าที่ผู้ใช้ส่งมา");
    expect(html).toContain("ยังตรวจยืนยันไม่ได้");
    expect(html).toContain('aria-sort="descending"');
  });
  it("renders extra statistics, sources, dates and distinctions with safe external links", () => {
    const html = renderToStaticMarkup(
      <InvestorReturnDetails record={record} />
    );
    for (const text of [
      "1974",
      "−48.7%",
      "ไม่ใช่ผลตอบแทนส่วนบุคคล",
      "Test caution",
      "Fixture report",
      "ข้อมูลเดิมที่ส่งมา",
    ])
      expect(html).toContain(text);
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain("ข้อความหลักฐาน / สรุปข้อมูลจากต้นทาง");
    expect(html).not.toContain("<blockquote");
  });
  it("preserves day-only retrieval dates when the viewer timezone differs", () => {
    const previousTZ = process.env.TZ;
    process.env.TZ = "America/Los_Angeles";
    try {
      const html = renderToStaticMarkup(
        <InvestorReturnDetails
          record={{
            ...record,
            sources: [{ ...record.sources[0], retrievedAt: "2026-10-09" }],
          }}
        />
      );
      expect(html).toContain("9/10/2569");
      expect(html).not.toContain("8/10/2569");
    } finally {
      if (previousTZ === undefined) delete process.env.TZ;
      else process.env.TZ = previousTZ;
    }
  });
});
