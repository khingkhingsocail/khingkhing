import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import {
  arenaBoards,
  entryInputSchema,
  profileInputSchema,
  rankArenaEntries,
  rankTier,
  validMonth,
} from "../shared/arena";
import {
  arenaTokenMatches,
  customArenaBoard,
  hashArenaToken,
  publicArenaProfile,
  validArenaAvatar,
} from "./arena";

const id = "a".repeat(32);
const fields = {
  profileId: id,
  boardKey: "sports:run100",
  value: 12,
  period: "2026-10",
  observedAt: "2026-10-01",
  evidenceUrl: "",
};
describe("Arena ranking and boundaries", () => {
  it("ranks higher scores and ties 1,1,3 without changing input", () => {
    const entries = [
      { profileId: "a", value: 10 },
      { profileId: "c", value: 4 },
      { profileId: "b", value: 10 },
    ];
    expect(
      rankArenaEntries(entries, "higher").map(e => [e.profileId, e.rank])
    ).toEqual([
      ["a", 1],
      ["b", 1],
      ["c", 3],
    ]);
    expect(entries[1].profileId).toBe("c");
  });
  it("ranks lower scores as better and excludes invalid values", () => {
    expect(
      rankArenaEntries(
        [
          { profileId: "a", value: 12 },
          { profileId: "b", value: 9 },
          { profileId: "c", value: NaN },
        ],
        "lower"
      ).map(e => e.rank)
    ).toEqual([1, 2]);
    expect(rankTier(1)).toBe("champion");
    expect(rankTier(2)).toBe("challenger");
    expect(rankTier(3)).toBe("elite");
    expect(rankTier(4)).toBe("contender");
  });
  it("keeps custom boards separate by unit/direction and normalizes matching labels", () => {
    const base = {
      title: "Distance",
      unit: "km",
      direction: "higher" as const,
    };
    expect(customArenaBoard(base).key).toBe(
      customArenaBoard({ ...base, title: " distance " }).key
    );
    expect(customArenaBoard(base).key).not.toBe(
      customArenaBoard({ ...base, unit: "m" }).key
    );
    expect(customArenaBoard(base).key).not.toBe(
      customArenaBoard({ ...base, direction: "lower" }).key
    );
  });
  it("never mixes social platforms or time/unit rules", () => {
    expect(arenaBoards.filter(b => b.category === "followers")).toHaveLength(4);
    expect(new Set(arenaBoards.map(b => b.key)).size).toBe(arenaBoards.length);
    expect(validMonth("2026-13")).toBe(false);
    expect(validMonth("2026-10")).toBe(true);
  });
  it("rejects invalid dates, mismatched months, values and verification tampering", () => {
    expect(entryInputSchema.safeParse(fields).success).toBe(true);
    expect(entryInputSchema.safeParse({ ...fields, value: -1 }).success).toBe(
      false
    );
    expect(
      entryInputSchema.safeParse({ ...fields, value: Infinity }).success
    ).toBe(false);
    expect(
      entryInputSchema.safeParse({ ...fields, observedAt: "2026-09-01" })
        .success
    ).toBe(false);
    expect(
      entryInputSchema.safeParse({
        ...fields,
        period: "2026-02",
        observedAt: "2026-02-30",
      }).success
    ).toBe(false);
    expect(
      entryInputSchema.safeParse({ ...fields, verification: "verified" })
        .success
    ).toBe(false);
    expect(
      entryInputSchema.safeParse({
        ...fields,
        value: 1.5,
        boardKey: "followers:tiktok",
      }).success
    ).toBe(false);
    expect(
      entryInputSchema.safeParse({
        ...fields,
        value: 10.5,
        boardKey: "sports:pushups",
      }).success
    ).toBe(false);
    expect(
      entryInputSchema.safeParse({
        ...fields,
        value: 10,
        boardKey: "sports:pushups",
      }).success
    ).toBe(true);
    expect(
      entryInputSchema.safeParse({ ...fields, value: 12.1234567 }).success
    ).toBe(false);
    expect(
      entryInputSchema.safeParse({
        ...fields,
        value: -3.5,
        boardKey: "stocks:return",
      }).success
    ).toBe(true);
  });
  it("rejects unsafe evidence links and invalid profile claims", () => {
    expect(
      entryInputSchema.safeParse({
        ...fields,
        evidenceUrl: "javascript:alert(1)",
      }).success
    ).toBe(false);
    expect(
      entryInputSchema.safeParse({
        ...fields,
        evidenceUrl: "https://a:b@example.com",
      }).success
    ).toBe(false);
    expect(
      profileInputSchema.safeParse({
        displayName: "Me",
        handle: "user",
        bio: "",
        avatar: null,
      }).success
    ).toBe(true);
    expect(
      profileInputSchema.safeParse({
        displayName: "Me",
        handle: "user",
        verified: true,
      }).success
    ).toBe(false);
  });
  it("requires a valid bearer edit token and rejects tampering", () => {
    const token = randomBytes(32).toString("base64url");
    const hash = hashArenaToken(token);
    expect(arenaTokenMatches(token, hash)).toBe(true);
    expect(arenaTokenMatches("A".repeat(43), hash)).toBe(false);
    expect(arenaTokenMatches("", hash)).toBe(false);
    expect(arenaTokenMatches(token, "x".repeat(64))).toBe(false);
  });
  it("never exposes edit token hash or private account fields", () => {
    const now = new Date();
    const result = publicArenaProfile({
      id,
      displayName: "Me",
      handle: "user",
      bio: "",
      avatar: null,
      editTokenHash: "sensitive",
      createdAt: now,
      updatedAt: now,
    });
    expect(result).not.toHaveProperty("editTokenHash");
    expect(result).not.toHaveProperty("updatedAt");
  });
  it("validates avatar format/signature rather than trusting MIME labels", () => {
    expect(validArenaAvatar(null)).toBe(true);
    expect(validArenaAvatar("https://example.com/private.png")).toBe(false);
    expect(validArenaAvatar("data:image/svg+xml;base64,PHN2Zz4=")).toBe(false);
    expect(validArenaAvatar("data:image/png;base64,bm90LWEtcG5n")).toBe(false);
    expect(validArenaAvatar("data:image/png;base64,iVBORw0KGgo=")).toBe(true);
  });
});
