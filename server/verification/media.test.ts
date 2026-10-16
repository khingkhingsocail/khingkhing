import { describe, it, expect } from "vitest";
import { inspectEvidence, evidenceFrames } from "./media";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const exec = promisify(execFile);
describe("evidence media decoding", () => {
  it("rejects header-only and MIME-spoofed evidence", async () => {
    await expect(
      inspectEvidence(Buffer.from("not image"), "image/png")
    ).rejects.toThrow();
    await expect(
      inspectEvidence(
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        "image/png"
      )
    ).rejects.toThrow();
  });
  it("reads real image and sampled video without claiming complete review", async () => {
    const dir = await mkdtemp(join(tmpdir(), "arena-media-test-"));
    try {
      await exec("ffmpeg", [
        "-nostdin",
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=c=blue:s=320x240",
        "-frames:v",
        "1",
        "-threads",
        "1",
        "-y",
        join(dir, "image.png"),
      ]);
      const image = await readFile(join(dir, "image.png"));
      const metadata = await inspectEvidence(image, "image/png");
      expect(metadata.kind).toBe("image");
      expect(metadata.width).toBe(320);
      const processed = await evidenceFrames(image, "image/png", "image", null);
      expect(processed.images).toHaveLength(1);
      expect(processed.images[0]).toMatch(/^data:image\/jpeg;base64,/);
      await exec("ffmpeg", [
        "-nostdin",
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "testsrc=size=320x240:rate=10",
        "-t",
        "2",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-threads",
        "1",
        "-y",
        join(dir, "video.mp4"),
      ]);
      const video = await readFile(join(dir, "video.mp4"));
      const v = await inspectEvidence(video, "video/mp4");
      expect(v.duration).toBe(2);
      const frames = await evidenceFrames(video, "video/mp4", "video", 2);
      expect(frames.images.length).toBeGreaterThan(0);
      expect(frames.images.length).toBeLessThanOrEqual(24);
      expect(frames.coverage).toContain("ไม่ได้ดูครบทุกเฟรม/เสียง");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 25000);
});
