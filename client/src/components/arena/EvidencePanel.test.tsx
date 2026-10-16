import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import EvidencePanel, { EvidenceReport } from "./EvidencePanel";
import type { EvidenceReview } from "../../../../shared/verification";
const base: EvidenceReview = {
  id: "r",
  entryId: "e",
  snapshot: "s",
  status: "insufficient",
  report: {
    verdict: "insufficient",
    summary: "ยังไม่สามารถตรวจค่าจริงจากภาพนี้",
    extractedValue: null,
    extractedUnit: null,
    extractedDate: null,
    identityMatch: "unclear",
    observations: [],
    discrepancies: [],
    limitations: ["สุ่มเฟรม ไม่ได้ดูทุกช่วง"],
    sourceIndices: [],
    requiresHuman: true,
  },
  sources: [],
  coverage: ["2 frames"],
  model: "model",
  error: null,
  decision: "pending",
  decisionReason: null,
  createdAt: new Date().toISOString(),
  stale: false,
};
describe("evidence UI boundaries", () => {
  it("shows consent unchecked and private evidence limitation before any AI call", () => {
    const html = renderToStaticMarkup(
      <EvidencePanel
        entryId={"a".repeat(32)}
        profileId={"b".repeat(32)}
        owner={true}
        onClose={() => {}}
      />
    );
    expect(html).toContain("ยินยอมจัดเก็บ");
    expect(html).toContain("หลักฐานเปิดได้เฉพาะ");
    expect(html).toContain("ไม่รับประกัน");
    expect(html).toContain("manus-no-record");
    expect(html).toContain("disabled");
    expect(html).not.toContain("รับรองโดย AI แล้ว");
  });
  it("separates extracted unknown values from zeros and from admin certification", () => {
    const html = renderToStaticMarkup(<EvidenceReport review={base} />);
    expect(html).toContain("อ่านไม่ได้");
    expect(html).toContain("ผล AI เท่านั้น");
    expect(html).toContain("สุ่มเฟรม");
    expect(html).not.toContain("ถูกต้อง 100");
  });
  it("shows old decision as stale when claim changed", () => {
    const html = renderToStaticMarkup(
      <EvidenceReport
        review={{ ...base, stale: true, status: "stale", decision: "approved" }}
      />
    );
    expect(html).toContain("ผลนี้ใช้กับเวอร์ชันเก่าเท่านั้น");
  });
});
