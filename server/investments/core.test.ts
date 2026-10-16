import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  investmentReferenceSchema,
  investmentMetricSchema,
  investmentMetricGroup,
  rankInvestmentMetrics,
  filterInvestmentReferences,
  type InvestmentReference,
} from "../../shared/investmentReferences";
const dataset = JSON.parse(
  readFileSync(
    new URL("../../data/investment-references.json", import.meta.url),
    "utf8"
  )
) as InvestmentReference[];
const fund = (
  id: string,
  value: number,
  basis = "gross",
  asOf = "2026-10-08"
): InvestmentReference => ({
  id,
  name: id,
  kind: "fund",
  summary: "Public reference",
  ticker: id,
  role: "ETF",
  facts: [
    {
      label: "Benchmark",
      text: "S&P500",
      asOf,
      sourceUrl: "https://example.org/document",
      sourceTitle: "Official",
      excerpt: "Benchmark S&P500",
    },
  ],
  metrics: [
    {
      key: "expense-ratio",
      value,
      unit: "%",
      basis,
      asOf,
      sourceUrl: "https://example.org/document",
      sourceTitle: "Official",
      excerpt: "Expense rate",
    },
  ],
  holdings: [],
  gaps: "",
  retrievedAt: "2026-10-09T04:14:18.351Z",
});
describe("investment directory data and comparison", () => {
  it("validates six sourced entities separated into three entity kinds", () => {
    expect(dataset).toHaveLength(6);
    for (const row of dataset)
      expect(investmentReferenceSchema.safeParse(row).success).toBe(true);
    expect(new Set(dataset.map(row => row.id)).size).toBe(6);
    expect(dataset.filter(row => row.kind === "investor")).toHaveLength(2);
    expect(dataset.filter(row => row.kind === "fund")).toHaveLength(2);
    expect(dataset.filter(row => row.kind === "company")).toHaveLength(2);
  });
  it("does not rank different fee bases, units or reporting dates", () => {
    const a = fund("fund-a", 0.03);
    const b = fund("fund-b", 0.0945, "net");
    const c = fund("fund-c", 0.01, "gross", "2026-09-30");
    expect(
      rankInvestmentMetrics([a, b, c], investmentMetricGroup(a.metrics[0]))
    ).toHaveLength(1);
    expect(
      rankInvestmentMetrics(
        dataset,
        investmentMetricGroup(dataset.find(row => row.id === "voo")!.metrics[0])
      )
    ).toHaveLength(1);
  });
  it("sorts identical fee groups low to high with ties 1,1,3", () => {
    const rows = [
      fund("fund-c", 0.04),
      fund("fund-b", 0.03),
      fund("fund-a", 0.03),
    ];
    expect(
      rankInvestmentMetrics(
        rows,
        investmentMetricGroup(rows[0].metrics[0])
      ).map(row => row.rank)
    ).toEqual([1, 1, 3]);
  });
  it("keeps known fees in percentage-point units and leaves missing positions null", () => {
    expect(
      dataset
        .find(row => row.id === "voo")!
        .metrics.find(m => m.key === "expense-ratio")!.value
    ).toBe(0.03);
    expect(
      dataset.find(row => row.id === "berkshire-hathaway")!.holdings[0]
        .weightPercent
    ).toBeNull();
    expect(
      dataset
        .filter(row => row.kind === "investor")
        .every(row => !row.metrics.length && !row.holdings.length)
    ).toBe(true);
  });
  it("rejects private fields unsafe source URLs future dates and company-as-fund metrics", () => {
    const row = fund("fund-a", 0.03);
    expect(
      investmentReferenceSchema.safeParse({ ...row, userId: 9 }).success
    ).toBe(false);
    expect(
      investmentReferenceSchema.safeParse({ ...row, kind: "investor" }).success
    ).toBe(false);
    expect(
      investmentMetricSchema.safeParse({ ...row.metrics[0], unit: "USD" })
        .success
    ).toBe(false);
    expect(
      investmentMetricSchema.safeParse({
        ...row.metrics[0],
        sourceUrl: "https://user:password@example.org",
      }).success
    ).toBe(false);
    expect(
      investmentReferenceSchema.safeParse({
        ...row,
        facts: [{ ...row.facts[0], asOf: "2027-01-01" }],
      }).success
    ).toBe(false);
  });
  it("filters and sorts without mixing entity kinds or mutating originals", () => {
    const snapshot = JSON.stringify(dataset);
    expect(filterInvestmentReferences(dataset, "fund", "VOO")).toHaveLength(1);
    expect(filterInvestmentReferences(dataset, "company", "AAPL")[0].id).toBe(
      "apple"
    );
    expect(filterInvestmentReferences(dataset, "investor", "")).toHaveLength(2);
    expect(JSON.stringify(dataset)).toBe(snapshot);
  });
});
