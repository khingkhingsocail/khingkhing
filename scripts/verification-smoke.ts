import { inspectWithAI } from "../server/verification/ai";
import { inspectEvidence } from "../server/verification/media";
import { readPublicSource } from "../server/verification/sources";
import { readFile } from "node:fs/promises";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { arenaEntries, arenaProfiles } from "../drizzle/schema";
const now = new Date();
const profile: typeof arenaProfiles.$inferSelect = {
  id: "a".repeat(32),
  displayName: "Synthetic Test",
  handle: "synthetic_test",
  bio: "",
  avatar: null,
  editTokenHash: "not-a-token",
  createdAt: now,
  updatedAt: now,
};
const entry: typeof arenaEntries.$inferSelect = {
  id: "b".repeat(32),
  profileId: profile.id,
  boardKey: "followers:tiktok",
  title: "ผู้ติดตาม TikTok",
  category: "followers",
  unit: "คน",
  direction: "higher",
  value: "1234.000000",
  period: "2026-10",
  observedAt: "2026-10-01",
  evidenceUrl: "",
  revision: "c".repeat(32),
  evidenceRevision: "initial",
  reviewStatus: "none",
  reviewSnapshot: null,
  verification: "self-reported",
  verificationSnapshot: null,
  updatedAt: now,
};
const source = await readPublicSource(
  "https://www.guinnessworldrecords.com/records/how-to-collect-and-submit-evidence"
);
console.log(
  "Public source read:",
  source.url,
  source.tier,
  source.excerpt.length,
  source.sha256.slice(0, 16)
);
const temp = await mkdtemp(join(tmpdir(), "khing-smoke-"));
await promisify(execFile)("ffmpeg", [
  "-nostdin",
  "-v",
  "error",
  "-i",
  "client/public/images/neon-night-demo.jpg",
  "-vf",
  "scale=1200:1200:force_original_aspect_ratio=decrease",
  "-frames:v",
  "1",
  "-threads",
  "1",
  "-y",
  join(temp, "fixture.jpg"),
]);
const image = await readFile(join(temp, "fixture.jpg"));
await rm(temp, { recursive: true, force: true });
const metadata = await inspectEvidence(image, "image/jpeg");
console.log("Evidence decoded:", metadata);
const result = await inspectWithAI(
  entry,
  profile,
  [{ data: image, kind: "image", mimeType: "image/jpeg", duration: null }],
  [],
  false
);
console.log("REAL VISION RESULT", JSON.stringify(result, null, 2));
if (result.report.verdict === "supported")
  throw new Error(
    "False positive: unrelated image cannot substantiate a followers claim"
  );
console.log(
  "No public/database writes performed. Real AI rejected unsupported synthetic claim."
);
