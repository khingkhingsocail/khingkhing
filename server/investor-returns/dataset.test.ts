import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { investorReturnSchema } from "../../shared/investorReturns";
const raw: unknown[] = JSON.parse(
  readFileSync(
    new URL("../../data/investor-returns.json", import.meta.url),
    "utf8"
  )
);
describe("user supplied six historical institutional returns", () => {
  it("validates all six records with exact submitted values and independently assessed sources", () => {
    const rows = raw.map(row => investorReturnSchema.parse(row));
    expect(rows).toHaveLength(6);
    expect(new Set(rows.map(row => row.id)).size).toBe(6);
    expect(rows.map(row => row.submitted.value)).toEqual([
      19.7, 29.2, 39, 30, 30, 15.9,
    ]);
    expect(
      rows.filter(row => row.status === "confirmed").map(row => row.investor)
    ).toEqual(["Warren Buffett", "Bill Ackman"]);
    expect(rows.filter(row => row.status === "partial")).toHaveLength(4);
  });
  it("retains fee conventions, discrepancies and all requested risk examples", () => {
    const rows = raw.map(row => investorReturnSchema.parse(row));
    const simons = rows.find(row => row.id.startsWith("simons"))!;
    expect(simons.reportedBasis).toContain("66%");
    expect(simons.reportedBasis).toContain("39%");
    expect(simons.caveats).toContain("62%");
    expect(
      rows
        .find(row => row.id.startsWith("buffett"))!
        .extras.map(e => e.text)
        .join(" ")
    ).toContain("10.5%");
    const ackman = rows.find(row => row.id.startsWith("ackman"))!;
    expect(ackman.extras.map(e => e.text).join(" ")).toContain("70.2%");
    expect(ackman.extras.map(e => e.text).join(" ")).toContain("20.5%");
    expect(ackman.reportedBasis).toContain("NAV");
    expect(
      rows.find(row => row.id.startsWith("druckenmiller"))!.extras[0].confirmed
    ).toBe(true);
  });
  it("accepts day precision and timezone timestamps but not invalid retrieval dates", () => {
    const row = investorReturnSchema.parse(raw[0]);
    const source = row.sources[0];
    for (const retrievedAt of ["2026-10-09", "2026-10-09T13:46:12+07:00"]) {
      expect(
        investorReturnSchema.safeParse({
          ...row,
          sources: [{ ...source, retrievedAt }],
        }).success
      ).toBe(true);
    }
    expect(
      investorReturnSchema.safeParse({
        ...row,
        sources: [{ ...source, retrievedAt: "2026-02-30" }],
      }).success
    ).toBe(false);
  });
});
