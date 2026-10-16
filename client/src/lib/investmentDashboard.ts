import type { InvestmentReference } from "../../../shared/investmentReferences";

// Link metadata from the HedgeFollow home directory reviewed on 2026-10-09.
// These are not live managers, verified users, or licensed numeric data feeds.
export const featuredInvestmentReferences = [
  {
    id: "berkshire-hathaway",
    person: "Warren Buffett",
    organization: "Berkshire Hathaway",
    url: "https://hedgefollow.com/funds/Berkshire+Hathaway",
    initials: "BH",
    note: "บริษัทแม่ / ผู้จัดสรรทุน ไม่ใช่พอร์ตส่วนตัวของนักลงทุน",
  },
  {
    id: "bridgewater-associates",
    person: "Ray Dalio",
    organization: "Bridgewater Associates",
    url: "https://hedgefollow.com/funds/Bridgewater+Associates",
    initials: "BW",
    note: "ชื่อบุคคลที่หน้าอ้างอิงเชื่อมกับองค์กร ไม่ใช่การยืนยันผู้จัดการปัจจุบัน",
  },
  {
    id: "pershing-square",
    person: "Bill Ackman",
    organization: "Pershing Square Capital Management",
    url: "https://hedgefollow.com/funds/Pershing+Square+Capital+Management",
    initials: "PS",
    note: "ข้อมูลพอร์ตองค์กรแยกจากผลตอบแทนส่วนบุคคล",
  },
  {
    id: "duquesne-family-office",
    person: "Stanley Druckenmiller",
    organization: "Duquesne Family Office",
    url: "https://hedgefollow.com/funds/Duquesne+Family+Office",
    initials: "DF",
    note: "รายการอ้างอิงที่คัดเลือก ไม่ใช่อันดับกองทุนทั้งหมด",
  },
] as const;

export type DashboardKind = "all" | InvestmentReference["kind"];
export function dashboardRecords(
  records: readonly InvestmentReference[],
  query: string,
  kind: DashboardKind,
  descending = false
) {
  const term = query.trim().toLocaleLowerCase();
  return records
    .filter(
      record =>
        (kind === "all" || record.kind === kind) &&
        `${record.name} ${record.ticker} ${record.role}`
          .toLocaleLowerCase()
          .includes(term)
    )
    .sort((a, b) => (descending ? -1 : 1) * a.name.localeCompare(b.name, "th"));
}
export function dashboardSummary(records: readonly InvestmentReference[]) {
  return {
    records: records.length,
    investors: records.filter(r => r.kind === "investor").length,
    funds: records.filter(r => r.kind === "fund").length,
    companies: records.filter(r => r.kind === "company").length,
    holdingExamples: records.reduce((count, r) => count + r.holdings.length, 0),
  };
}
export function holdingsDates(record: InvestmentReference) {
  return [...new Set(record.holdings.map(holding => holding.asOf))]
    .sort()
    .reverse();
}
export function holdingsForDate(record: InvestmentReference, asOf: string) {
  return record.holdings
    .filter(holding => holding.asOf === asOf)
    .slice()
    .sort((a, b) => {
      const value =
        a.weightPercent === null && b.weightPercent === null
          ? 0
          : a.weightPercent === null
            ? 1
            : b.weightPercent === null
              ? -1
              : b.weightPercent - a.weightPercent;
      return value || a.name.localeCompare(b.name);
    });
}
