import { describe, expect, it } from "vitest";
import { arenaBoards } from "../../shared/arena";
import {
  referenceBoard,
  referenceScopeLabel,
} from "../../shared/referenceBoards";
import {
  arenaReferenceSchema,
  rankReferences,
  referenceGroup,
  type ArenaReference,
} from "../../shared/arenaReferences";
const fixture = (
  id: string,
  key: string,
  value: number,
  overrides: Partial<ArenaReference> = {}
): ArenaReference => ({
  id: id.repeat(32),
  personId: `person-${id}`,
  name: `Person ${id}`,
  boardKey: key,
  value,
  displayValue: String(value),
  observedAt: "2026-10-09",
  eventDate: "",
  retrievedAt: "2026-10-09T04:03:59.000Z",
  scope: "career-total",
  approximate: false,
  sourceUrl: "https://www.grammy.com/artists",
  sourceTitle: "Official artist statistics",
  sourceType: "official",
  excerpt: "Name and total from official source",
  notes: "Access date for undated cumulative profile",
  ...overrides,
});
describe("expanded public references", () => {
  it("does not silently add reference-only statistics to user competition boards", () => {
    expect(referenceBoard("ref:world:grammy-wins")?.unit).toBe("รางวัล");
    expect(arenaBoards.some(b => b.key.startsWith("ref:"))).toBe(false);
  });
  it("supports sourced cumulative award counts with no fake single event date", () => {
    expect(
      arenaReferenceSchema.safeParse(fixture("a", "ref:world:grammy-wins", 14))
        .success
    ).toBe(true);
    expect(
      arenaReferenceSchema.safeParse(
        fixture("a", "ref:world:grammy-wins", 14, { eventDate: "2025-02-02" })
      ).success
    ).toBe(false);
    expect(referenceScopeLabel("career-total", "2026-10-09")).toContain(
      "ยอดสะสม"
    );
    expect(
      arenaReferenceSchema.safeParse(
        fixture("a", "ref:world:grammy-wins", 14.5)
      ).success
    ).toBe(false);
    expect(
      arenaReferenceSchema.safeParse(
        fixture("a", "ref:world:grammy-wins", 14, { scope: "snapshot" })
      ).success
    ).toBe(false);
    expect(
      arenaReferenceSchema.safeParse(
        fixture("a", "followers:youtube", 520000000)
      ).success
    ).toBe(false);
  });
  it("never ranks career totals from different as-of days together", () => {
    const rows = [
      fixture("a", "ref:world:grammy-wins", 14),
      fixture("b", "ref:world:grammy-wins", 35, { observedAt: "2025-02-02" }),
    ];
    expect(
      rankReferences(rows, referenceGroup(rows[0])).map(r => r.personId)
    ).toEqual(["person-a"]);
  });
  it("separates men and women sprint records and singles tennis titles", () => {
    const men = fixture("a", "sports:run100", 9.58, {
      scope: "career-best",
      eventDate: "2009-08-16",
    });
    const women = fixture("b", "ref:sports:100m-women", 10.65, {
      scope: "career-best",
      eventDate: "2023-07-07",
    });
    expect(rankReferences([men, women], referenceGroup(men))).toHaveLength(1);
    expect(referenceBoard("ref:sports:grand-slam-men")?.key).not.toBe(
      referenceBoard("ref:sports:grand-slam-women")?.key
    );
  });
  it("sorts height as higher-is-better and marathon seconds as lower-is-better", () => {
    const heights = [
      fixture("a", "ref:sports:pole-vault-men", 6.2, {
        scope: "career-best",
        eventDate: "2025-01-01",
      }),
      fixture("b", "ref:sports:pole-vault-men", 6.31, {
        scope: "career-best",
        eventDate: "2026-03-12",
      }),
    ];
    expect(rankReferences(heights, referenceGroup(heights[0]))[0].value).toBe(
      6.31
    );
    const times = [
      fixture("a", "ref:sports:marathon-men", 7269, {
        scope: "career-best",
        eventDate: "2022-09-25",
      }),
      fixture("b", "ref:sports:marathon-men", 7500, {
        scope: "career-best",
        eventDate: "2022-09-25",
      }),
    ];
    expect(rankReferences(times, referenceGroup(times[0]))[0].value).toBe(7269);
  });
});
