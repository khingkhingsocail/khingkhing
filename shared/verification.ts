import { z } from "zod";
export const MAX_EVIDENCE_BYTES = 20 * 1024 * 1024;
export const MAX_EVIDENCE_TOTAL_BYTES = 50 * 1024 * 1024;
export const MAX_EVIDENCE_FILES = 3;
export const reviewVerdicts = [
  "supported",
  "contradicted",
  "insufficient",
  "needs-human",
] as const;
export const aiReportSchema = z
  .object({
    verdict: z.enum(reviewVerdicts),
    summary: z.string().max(1200),
    extractedValue: z.number().finite().nullable(),
    extractedUnit: z.string().max(100).nullable(),
    extractedDate: z.string().max(100).nullable(),
    identityMatch: z.enum(["supported", "unclear", "mismatch"]),
    observations: z.array(z.string().max(700)).max(12),
    discrepancies: z.array(z.string().max(700)).max(12),
    limitations: z.array(z.string().max(700)).max(12),
    sourceIndices: z.array(z.number().int().min(0).max(10)).max(10),
    requiresHuman: z.boolean(),
  })
  .strict();
export type AIReport = z.infer<typeof aiReportSchema>;
export type ReviewStatus =
  | "none"
  | "running"
  | "supported"
  | "contradicted"
  | "insufficient"
  | "needs-human"
  | "failed"
  | "stale";
export const reviewLabels: Record<ReviewStatus, string> = {
  none: "ยังไม่ส่ง AI",
  running: "AI กำลังตรวจ",
  supported: "AI พบหลักฐานสนับสนุน",
  contradicted: "AI พบข้อมูลขัดแย้ง",
  insufficient: "หลักฐานยังไม่เพียงพอ",
  "needs-human": "ต้องให้คนทบทวน",
  failed: "ตรวจไม่สำเร็จ",
  stale: "ข้อมูลเปลี่ยน ต้องตรวจใหม่",
};
export interface EvidenceMetadata {
  id: string;
  entryId: string;
  filename: string;
  kind: "image" | "video";
  mimeType: string;
  size: number;
  sha256: string;
  duration: number | null;
  createdAt: string;
  stale: boolean;
}
export interface PublicSource {
  url: string;
  title: string;
  excerpt: string;
  retrievedAt: string;
  sha256: string;
  tier: "institution" | "platform" | "other";
}
export interface EvidenceReview {
  id: string;
  entryId: string;
  snapshot: string;
  status: ReviewStatus;
  report: AIReport | null;
  sources: PublicSource[];
  coverage: string[];
  model: string;
  error: string | null;
  decision: "pending" | "approved" | "rejected";
  decisionReason: string | null;
  createdAt: string;
  stale: boolean;
}
export interface EvidenceBundle {
  evidence: EvidenceMetadata[];
  reviews: EvidenceReview[];
  entryRevision: string;
  currentSnapshot: string;
}
export const reviewRequestSchema = z
  .object({
    consent: z.literal(true),
    publicLookup: z.boolean(),
    sourceUrls: z.array(z.string().url().max(500)).max(3).default([]),
  })
  .strict();
export const decisionSchema = z
  .object({
    decision: z.enum(["approved", "rejected"]),
    reason: z.string().trim().min(10).max(1000),
    snapshot: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
