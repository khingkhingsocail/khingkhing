import { createHash } from "node:crypto";
import type { arenaEntries, arenaProfiles } from "../../drizzle/schema";
import type { ReviewStatus } from "../../shared/verification";
export function claimSnapshot(
  entry: Pick<
    typeof arenaEntries.$inferSelect,
    | "id"
    | "revision"
    | "evidenceRevision"
    | "boardKey"
    | "value"
    | "period"
    | "observedAt"
    | "evidenceUrl"
  >,
  profile: Pick<typeof arenaProfiles.$inferSelect, "displayName" | "handle">
): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        entry.id,
        entry.revision,
        entry.evidenceRevision,
        entry.boardKey,
        entry.value,
        entry.period,
        entry.observedAt,
        entry.evidenceUrl,
        profile.displayName,
        profile.handle,
      ])
    )
    .digest("hex");
}
export function effectiveReview(
  entry: typeof arenaEntries.$inferSelect,
  profile: typeof arenaProfiles.$inferSelect
) {
  const snapshot = claimSnapshot(entry, profile);
  return {
    verification:
      entry.verification === "verified" &&
      entry.verificationSnapshot === snapshot
        ? ("verified" as const)
        : ("self-reported" as const),
    reviewStatus: (!entry.reviewSnapshot
      ? "none"
      : entry.reviewSnapshot === snapshot
        ? entry.reviewStatus
        : "stale") as ReviewStatus,
  };
}
export class EvidenceError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}
export function validateSupported(
  report: {
    verdict: string;
    extractedValue: number | null;
    extractedUnit: string | null;
    identityMatch: string;
    requiresHuman: boolean;
  },
  claim: { value: number; unit: string; category: string },
  sourceCount: number,
  hasVideo: boolean
): string {
  if (report.verdict !== "supported") return report.verdict;
  // Conservative gates: never label a sample-only dynamic metric or financial record conclusively verified.
  if (
    report.extractedValue === null ||
    Math.abs(report.extractedValue - claim.value) > 0.000001 ||
    !report.extractedUnit ||
    report.identityMatch !== "supported"
  )
    return "needs-human";
  if (
    ["stocks", "world"].includes(claim.category) ||
    (claim.category === "sports" && hasVideo) ||
    report.requiresHuman
  )
    return "needs-human";
  if (claim.category === "sports" && sourceCount === 0) return "needs-human";
  return "supported";
}
