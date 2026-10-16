import { describe, expect, it } from "vitest";
import {
  filterInvestorReturns,
  investorReturnSchema,
  type InvestorReturn,
} from "../../shared/investorReturns";
export const fixture: InvestorReturn = {
  id: "fixture-investor",
  investor: "Fixture Investor",
  organization: "Fixture Fund",
  submitted: {
    value: 19.7,
    period: "1965–2025",
    basis: "ผลตอบแทนราคาหุ้นทบต้น",
    sourceUrl: "https://example.com/report",
  },
  reportedValue: 19.7,
  reportedPeriod: "1965–2025",
  reportedBasis: "ผลตอบแทนราคาหุ้นทบต้น",
  status: "confirmed",
  summary: "Test reference, not production data",
  caveats: "Different periods cannot establish investor skill ranking",
  sources: [
    {
      url: "https://example.com/report",
      title: "Fixture",
      excerpt: "Fixture only",
      retrievedAt: "2026-10-09T06:00:00Z",
      supports: "Test evidence",
    },
  ],
  extras: [],
};
describe("historical investor returns", () => {
  it("requires supporting sources and a value to confirm", () => {
    expect(investorReturnSchema.safeParse(fixture).success).toBe(true);
    expect(
      investorReturnSchema.safeParse({ ...fixture, sources: [] }).success
    ).toBe(false);
    expect(
      investorReturnSchema.safeParse({ ...fixture, reportedValue: null })
        .success
    ).toBe(false);
  });
  it("never attributes an established return to an unverified submission", () => {
    expect(
      investorReturnSchema.safeParse({ ...fixture, status: "unverified" })
        .success
    ).toBe(false);
    expect(
      investorReturnSchema.safeParse({
        ...fixture,
        status: "unverified",
        reportedValue: null,
        sources: [],
      }).success
    ).toBe(true);
  });
  it("rejects non-HTTPS, embedded credentials and undeclared private fields", () => {
    expect(
      investorReturnSchema.safeParse({
        ...fixture,
        submitted: { ...fixture.submitted, sourceUrl: "javascript:alert(1)" },
      }).success
    ).toBe(false);
    expect(
      investorReturnSchema.safeParse({
        ...fixture,
        submitted: {
          ...fixture.submitted,
          sourceUrl: "https://user:password@example.com/",
        },
      }).success
    ).toBe(false);
    expect(
      investorReturnSchema.safeParse({ ...fixture, ownerId: 3 }).success
    ).toBe(false);
  });
  it("sorts reported values numerically without comparing unverified user figures and leaves input untouched", () => {
    const unknown = {
      ...fixture,
      id: "unverified",
      investor: "Unknown",
      reportedValue: null,
      status: "unverified" as const,
      submitted: { ...fixture.submitted, value: 99 },
    };
    const higher = { ...fixture, id: "higher", reportedValue: 30 };
    const rows = [fixture, unknown, higher];
    expect(
      filterInvestorReturns(rows, "", "value-desc").map(row => row.id)
    ).toEqual(["higher", "fixture-investor", "unverified"]);
    expect(
      filterInvestorReturns(rows, "", "value-asc").map(row => row.id)
    ).toEqual(["fixture-investor", "higher", "unverified"]);
    expect(rows.map(row => row.id)).toEqual([
      "fixture-investor",
      "unverified",
      "higher",
    ]);
    expect(filterInvestorReturns(rows, "unknown", "name")).toEqual([unknown]);
  });
});
