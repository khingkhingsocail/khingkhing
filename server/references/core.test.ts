import { describe, expect, it } from "vitest";
import {
  arenaReferenceSchema,
  referenceGroup,
  rankReferences,
  type ArenaReference,
} from "../../shared/arenaReferences";
const fixture = (
  id: string,
  value: number,
  override: Partial<ArenaReference> = {}
): ArenaReference => ({
  id: id.repeat(32),
  personId: `person-${id}`,
  name: `Person ${id}`,
  boardKey: "sports:run100",
  value,
  displayValue: `${value} s`,
  observedAt: "2026-10-09",
  eventDate: "2009-08-16",
  retrievedAt: "2026-10-09T03:47:08.000Z",
  scope: "career-best",
  approximate: false,
  sourceUrl: "https://worldathletics.org/records",
  sourceTitle: "Official records",
  sourceType: "official",
  excerpt: "Source supports value",
  notes: "Wind legal",
  ...override,
});
describe("public reference groups", () => {
  it("ranks only comparable career bests and keeps ties 1,2,2", () => {
    const rows = [fixture("a", 9.58), fixture("b", 9.69), fixture("c", 9.69)];
    expect(
      rankReferences(rows, referenceGroup(rows[0])).map(x => x.rank)
    ).toEqual([1, 2, 2]);
  });
  it("never merges snapshot dates or social statistics with sports career best", () => {
    const current = fixture("b", 100, {
      boardKey: "followers:tiktok",
      scope: "snapshot",
      eventDate: "",
      observedAt: "2026-10-09",
    });
    const earlier = fixture("c", 110, {
      boardKey: "followers:tiktok",
      scope: "snapshot",
      eventDate: "",
      observedAt: "2026-10-08",
    });
    expect(
      rankReferences(
        [fixture("a", 9.58), current, earlier],
        referenceGroup(current)
      ).map(x => x.personId)
    ).toEqual(["person-b"]);
  });
  it("rejects unsafe links, private fields and impossible date ordering", () => {
    expect(
      arenaReferenceSchema.safeParse({
        ...fixture("a", 9.58),
        sourceUrl: "javascript:alert(1)",
      }).success
    ).toBe(false);
    expect(
      arenaReferenceSchema.safeParse({ ...fixture("a", 9.58), userId: 99 })
        .success
    ).toBe(false);
    expect(
      arenaReferenceSchema.safeParse(
        fixture("a", 9.58, { eventDate: "2027-01-01" })
      ).success
    ).toBe(false);
    expect(
      arenaReferenceSchema.safeParse(fixture("a", 9.58, { eventDate: "" }))
        .success
    ).toBe(false);
  });
  it("keeps rounded display values without claiming exact precision", () => {
    const row = fixture("a", 163000000, {
      boardKey: "followers:tiktok",
      scope: "snapshot",
      eventDate: "",
      approximate: true,
      displayValue: "163M",
    });
    expect(arenaReferenceSchema.parse(row).displayValue).toBe("163M");
    expect(
      arenaReferenceSchema.safeParse({ ...row, boardKey: "unknown" }).success
    ).toBe(false);
    expect(arenaReferenceSchema.safeParse({ ...row, value: 1.2 }).success).toBe(
      false
    );
  });
});
