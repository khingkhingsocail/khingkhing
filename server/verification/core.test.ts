import { describe, it, expect } from "vitest";
import { claimSnapshot, effectiveReview, validateSupported } from "./core";
import { isPublicAddress, sourceTier, validateSourceUrl } from "./sources";
import { aiReportSchema, reviewRequestSchema } from "../../shared/verification";
import type { arenaEntries, arenaProfiles } from "../../drizzle/schema";
const now = new Date();
const profile: typeof arenaProfiles.$inferSelect = {
  id: "a".repeat(32),
  displayName: "Tester",
  handle: "tester",
  bio: "",
  avatar: null,
  editTokenHash: "hash",
  createdAt: now,
  updatedAt: now,
};
const entry: typeof arenaEntries.$inferSelect = {
  id: "b".repeat(32),
  profileId: profile.id,
  boardKey: "followers:tiktok",
  title: "TikTok",
  category: "followers",
  unit: "คน",
  direction: "higher",
  value: "100.000000",
  period: "2026-10",
  observedAt: "2026-10-01",
  evidenceUrl: "",
  revision: "c".repeat(32),
  evidenceRevision: "d".repeat(32),
  reviewStatus: "supported",
  reviewSnapshot: null,
  verification: "verified",
  verificationSnapshot: null,
  updatedAt: now,
};
describe("verification claim revision", () => {
  it("never trusts verified flag without current snapshot", () => {
    expect(effectiveReview(entry, profile).verification).toBe("self-reported");
  });
  it("matches current claim and identity only", () => {
    const snapshot = claimSnapshot(entry, profile);
    const current = {
      ...entry,
      reviewSnapshot: snapshot,
      verificationSnapshot: snapshot,
    };
    expect(effectiveReview(current, profile)).toEqual({
      verification: "verified",
      reviewStatus: "supported",
    });
    for (const mutation of [
      { value: "101.000000" },
      { revision: "changed" },
      { evidenceRevision: "changed" },
      { observedAt: "2026-10-02" },
      { evidenceUrl: "https://example.com/evidence" },
    ]) {
      const result = effectiveReview({ ...current, ...mutation }, profile);
      expect(result.verification).toBe("self-reported");
      expect(result.reviewStatus).toBe("stale");
    }
    for (const change of [
      { handle: "someone_else" },
      { displayName: "Someone else" },
    ])
      expect(
        effectiveReview(current, { ...profile, ...change }).verification
      ).toBe("self-reported");
  });
  it("never concludes precise sport samples or financial returns solely from AI", () => {
    const report = {
      verdict: "supported",
      extractedValue: 12,
      extractedUnit: "ครั้ง",
      identityMatch: "supported",
      requiresHuman: false,
    };
    expect(
      validateSupported(
        report,
        { value: 12, unit: "ครั้ง", category: "sports" },
        1,
        true
      )
    ).toBe("needs-human");
    expect(
      validateSupported(
        report,
        { value: 12, unit: "%", category: "stocks" },
        1,
        false
      )
    ).toBe("needs-human");
    expect(
      validateSupported(
        { ...report, extractedValue: 13 },
        { value: 12, unit: "คน", category: "followers" },
        1,
        false
      )
    ).toBe("needs-human");
  });
});
describe("safe public source transport", () => {
  it("rejects local/private/multicast/reserved/mapped IP addresses", () => {
    for (const ip of [
      "127.0.0.1",
      "10.1.2.3",
      "169.254.169.254",
      "172.16.0.1",
      "192.168.1.1",
      "0.0.0.0",
      "224.1.2.3",
      "::1",
      "fc00::1",
      "fe80::1",
      "::ffff:127.0.0.1",
      "100.64.1.1",
    ])
      expect(isPublicAddress(ip), ip).toBe(false);
    expect(isPublicAddress("8.8.8.8")).toBe(true);
  });
  it("rejects credentials, unsafe protocol/ports and loopback URLs", () => {
    for (const url of [
      "file:///etc/passwd",
      "https://user:secret@example.com",
      "http://127.0.0.1",
      "http://localhost",
      "https://example.com:3000",
      "http://169.254.169.254",
    ])
      expect(() => validateSourceUrl(url)).toThrow();
    expect(
      validateSourceUrl("https://worldathletics.org/results").hostname
    ).toBe("worldathletics.org");
  });
  it("does not trust spoofed institutional hostname suffix", () => {
    expect(sourceTier("www.worldathletics.org")).toBe("institution");
    expect(sourceTier("worldathletics.org.evil.com")).toBe("other");
    expect(sourceTier("fakeguinnessworldrecords.com")).toBe("other");
  });
});
describe("review schema boundary", () => {
  it("requires consent and does not accept client-set verdict", () => {
    expect(
      reviewRequestSchema.safeParse({
        consent: false,
        publicLookup: true,
        sourceUrls: [],
      }).success
    ).toBe(false);
    expect(
      reviewRequestSchema.safeParse({
        consent: true,
        publicLookup: false,
        sourceUrls: [],
        verdict: "supported",
      }).success
    ).toBe(false);
  });
  it("rejects fabricated accuracy fields and invalid extracted numbers", () => {
    const base = {
      verdict: "insufficient",
      summary: "Cannot verify",
      extractedValue: null,
      extractedUnit: null,
      extractedDate: null,
      identityMatch: "unclear",
      observations: [],
      discrepancies: [],
      limitations: ["sampling"],
      sourceIndices: [],
      requiresHuman: true,
    };
    expect(aiReportSchema.safeParse(base).success).toBe(true);
    expect(aiReportSchema.safeParse({ ...base, accuracy: 100 }).success).toBe(
      false
    );
    expect(
      aiReportSchema.safeParse({ ...base, extractedValue: Infinity }).success
    ).toBe(false);
  });
});
