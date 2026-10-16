import { describe, it, expect } from "vitest";
import raw from "../../../data/investment-references.json";
import { investmentReferenceSchema } from "../../../shared/investmentReferences";
import {
  dashboardRecords,
  dashboardSummary,
  featuredInvestmentReferences,
  holdingsDates,
  holdingsForDate,
} from "./investmentDashboard";
const records = raw.map(value => investmentReferenceSchema.parse(value));
describe("investment dashboard data", () => {
  it("summarizes only supplied records without AUM or performance aggregation", () => {
    expect(dashboardSummary(records)).toEqual({
      records: 6,
      investors: 2,
      funds: 2,
      companies: 2,
      holdingExamples: 9,
    });
    expect(dashboardSummary([]).records).toBe(0);
    expect(dashboardSummary(records)).not.toHaveProperty("totalAum");
  });
  it("filters and sorts names without mutating input or ranking fund skill", () => {
    const ids = records.map(record => record.id);
    expect(
      dashboardRecords(records, " VOO ", "all").map(record => record.id)
    ).toEqual(["voo"]);
    expect(dashboardRecords(records, "", "fund")).toHaveLength(2);
    expect(dashboardRecords(records, "not found", "all")).toEqual([]);
    const asc = dashboardRecords(records, "", "all");
    expect(
      dashboardRecords(records, "", "all", true).map(record => record.id)
    ).toEqual(asc.map(record => record.id).reverse());
    expect(records.map(record => record.id)).toEqual(ids);
  });
  it("keeps dates separate and preserves null weights instead of making zero", () => {
    const source = records.find(record => record.id === "voo")!;
    const record = {
      ...source,
      holdings: [
        ...source.holdings,
        { ...source.holdings[0], asOf: "2026-07-31", weightPercent: null },
      ],
    };
    expect(holdingsDates(record)).toEqual(["2026-08-31", "2026-07-31"]);
    expect(holdingsForDate(record, "2026-08-31")).toHaveLength(3);
    expect(holdingsForDate(record, "2026-07-31")[0].weightPercent).toBeNull();
    expect(holdingsForDate(record, "2020-01-01")).toEqual([]);
  });
  it("contains only reference link metadata, never invented numeric HedgeFollow fields", () => {
    expect(featuredInvestmentReferences).toHaveLength(4);
    for (const record of featuredInvestmentReferences) {
      expect(new URL(record.url).origin).toBe("https://hedgefollow.com");
      expect(record).not.toHaveProperty("performance");
      expect(record).not.toHaveProperty("aum");
    }
  });
});
