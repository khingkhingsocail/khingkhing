import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  arenaReferenceSchema,
  referenceGroup,
} from "../../shared/arenaReferences";
const original = JSON.parse(
  readFileSync(
    new URL("../../data/celebrity-references.json", import.meta.url),
    "utf8"
  )
);
const added = JSON.parse(
  readFileSync(
    new URL("../../data/celebrity-references-expanded.json", import.meta.url),
    "utf8"
  )
);
describe("curated public datasets", () => {
  it("preserves original nine records and validates every added reference", () => {
    expect(original).toHaveLength(9);
    expect(added.length).toBeGreaterThan(0);
    for (const row of [...original, ...added])
      expect(arenaReferenceSchema.safeParse(row).success).toBe(true);
  });
  it("never duplicates a person in the same comparison group or public reference ID", () => {
    const rows = [...original, ...added];
    expect(new Set(rows.map(r => r.id)).size).toBe(rows.length);
    expect(
      new Set(rows.map(r => `${r.personId}|${referenceGroup(r)}`)).size
    ).toBe(rows.length);
  });
  it("records source excerpts and dates for every value without participant privileges", () => {
    for (const row of added) {
      expect(row.sourceUrl).toMatch(/^https:\/\//);
      expect(row.excerpt.length).toBeGreaterThan(10);
      expect(row.retrievedAt).toMatch(/^2026-10-09T/);
      expect(row).not.toHaveProperty("userId");
      expect(row).not.toHaveProperty("verification");
      expect(row).not.toHaveProperty("editToken");
    }
  });
});
