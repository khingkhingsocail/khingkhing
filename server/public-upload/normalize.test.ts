import { execFile as nodeExecFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MAX_PUBLIC_MEDIA_BYTES } from "../../shared/publicUpload";
import { normalizePublicUpload } from "./normalize";

const execFile = promisify(nodeExecFile);
const fixtureTimeout = 60_000;
let fixtureDirectory: string;
let heicFixtureAvailable = false;

async function makeFixture(name: string, args: string[]): Promise<string> {
  const outputPath = path.join(fixtureDirectory, name);
  await execFile(
    "ffmpeg",
    ["-hide_banner", "-nostdin", "-v", "error", ...args, "-y", outputPath],
    {
      encoding: "utf8",
      timeout: fixtureTimeout,
      maxBuffer: 2 * 1024 * 1024,
      windowsHide: true,
    }
  );
  return outputPath;
}

async function imageFixtureArgs(codec: string): Promise<string[]> {
  return [
    "-threads",
    "1",
    "-f",
    "lavfi",
    "-i",
    "color=c=red:s=32x24:d=0.5",
    "-frames:v",
    "1",
    "-c:v",
    codec,
  ];
}

async function readFixture(name: string): Promise<Buffer> {
  return readFile(path.join(fixtureDirectory, name));
}

beforeAll(async () => {
  fixtureDirectory = await mkdtemp(
    path.join(tmpdir(), "public-upload-normalize-test-")
  );

  await makeFixture("tiny.jpg", await imageFixtureArgs("mjpeg"));
  await makeFixture("tiny.png", await imageFixtureArgs("png"));
  await makeFixture("tiny.webp", [
    "-threads",
    "1",
    "-f",
    "lavfi",
    "-i",
    "color=c=red:s=32x24:d=0.5",
    "-frames:v",
    "1",
    "-c:v",
    "libwebp",
    "-lossless",
    "1",
  ]);
  await makeFixture("tiny.bmp", await imageFixtureArgs("bmp"));
  await makeFixture("tiny.tiff", await imageFixtureArgs("tiff"));
  await makeFixture("tiny.gif", [
    "-threads",
    "1",
    "-f",
    "lavfi",
    "-i",
    "color=c=red:s=32x24:d=0.5",
    "-vf",
    "fps=2",
    "-loop",
    "0",
    "-c:v",
    "gif",
  ]);
  await makeFixture("tiny.avif", [
    "-threads",
    "1",
    "-f",
    "lavfi",
    "-i",
    "color=c=red:s=32x24:d=0.5",
    "-frames:v",
    "1",
    "-c:v",
    "libaom-av1",
    "-still-picture",
    "1",
    "-cpu-used",
    "8",
  ]);

  try {
    const { stdout, stderr } = (await execFile(
      "heif-enc",
      ["--list-encoders"],
      {
        encoding: "utf8",
        timeout: fixtureTimeout,
        maxBuffer: 1024 * 1024,
        windowsHide: true,
      }
    )) as { stdout: string; stderr: string };
    const encoderOutput = `${stdout}\n${stderr}`;
    const heicEncoders = encoderOutput
      .split(/AVIF encoders:/i)[0]
      .split(/HEIC encoders:/i)[1]
      ?.trim();
    if (heicEncoders) {
      const heicPath = path.join(fixtureDirectory, "tiny.heic");
      await execFile(
        "heif-enc",
        [
          "-q",
          "72",
          "--no-alpha",
          "-p",
          "x265:pools=1",
          "-p",
          "x265:frame-threads=1",
          "-o",
          heicPath,
          path.join(fixtureDirectory, "tiny.jpg"),
        ],
        {
          encoding: "utf8",
          timeout: fixtureTimeout,
          maxBuffer: 1024 * 1024,
          windowsHide: true,
        }
      );
      heicFixtureAvailable = true;
    }
  } catch (error) {
    if (
      !(
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "ENOENT"
      )
    ) {
      throw error;
    }
  }

  await makeFixture("tiny.mov", [
    "-threads",
    "1",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=size=64x48:rate=12",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:sample_rate=48000",
    "-t",
    "0.5",
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "48k",
  ]);
  await makeFixture("tiny-hevc.mkv", [
    "-threads",
    "1",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=size=64x48:rate=12",
    "-t",
    "0.5",
    "-c:v",
    "libx265",
    "-x265-params",
    "pools=1:frame-threads=1",
    "-pix_fmt",
    "yuv420p",
    "-an",
  ]);
  await makeFixture("tiny.webm", [
    "-threads",
    "1",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=size=64x48:rate=12",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=330:sample_rate=48000",
    "-t",
    "0.5",
    "-c:v",
    "libvpx",
    "-deadline",
    "realtime",
    "-cpu-used",
    "8",
    "-c:a",
    "libopus",
    "-b:a",
    "32k",
  ]);
  await makeFixture("tiny.avi", [
    "-threads",
    "1",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=size=64x48:rate=12",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=220:sample_rate=48000",
    "-t",
    "0.5",
    "-c:v",
    "mpeg4",
    "-q:v",
    "8",
    "-c:a",
    "pcm_s16le",
  ]);
}, fixtureTimeout);

afterAll(async () => {
  if (fixtureDirectory)
    await rm(fixtureDirectory, { recursive: true, force: true });
});

describe("normalizePublicUpload", () => {
  it.each([
    ["tiny.jpg", "image/jpeg"],
    ["tiny.png", "image/png"],
    ["tiny.webp", "image/webp"],
  ])(
    "validates and preserves original bytes for %s",
    async (name, mimeType) => {
      const original = await readFixture(name);
      const result = await normalizePublicUpload(original);
      expect(result.kind).toBe("image");
      expect(result.mimeType).toBe(mimeType);
      expect(result.data.equals(original)).toBe(true);
    }
  );

  it("sniffs image bytes without requiring a declared MIME type", async () => {
    const result = await normalizePublicUpload(await readFixture("tiny.jpg"));
    expect(result.kind).toBe("image");
    expect(result.mimeType).toBe("image/jpeg");
  });

  it.each(["tiny.bmp", "tiny.gif", "tiny.tiff", "tiny.avif"])(
    "decodes %s and normalizes the first frame to PNG",
    async name => {
      const result = await normalizePublicUpload(await readFixture(name));
      expect(result.kind).toBe("image");
      expect(result.mimeType).toBe("image/png");
      expect(result.data.subarray(0, 8)).toEqual(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      );
    }
  );

  it("preflights dimensions and converts a real HEIC fixture when an encoder is installed", async () => {
    if (!heicFixtureAvailable) return;
    const result = await normalizePublicUpload(await readFixture("tiny.heic"));
    expect(result.kind).toBe("image");
    expect(result.mimeType).toBe("image/jpeg");
    expect(result.data[0]).toBe(0xff);
    expect(result.data[1]).toBe(0xd8);
  });

  it.each(["tiny.mov", "tiny-hevc.mkv", "tiny.webm", "tiny.avi"])(
    "normalizes %s to playable MP4",
    async name => {
      const result = await normalizePublicUpload(await readFixture(name));
      expect(result.kind).toBe("video");
      expect(result.mimeType).toBe("video/mp4");
      expect(result.data.length).toBeGreaterThan(32);
      expect(result.data.toString("ascii", 4, 8)).toBe("ftyp");
      expect(result.data.length).toBeLessThanOrEqual(MAX_PUBLIC_MEDIA_BYTES);
    }
  );

  it.each([
    Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
    Buffer.from("<!doctype html><html><body>not an image</body></html>"),
    Buffer.from("%PDF-1.7\nnot a media file"),
    Buffer.from("random bytes that have no media signature"),
  ])("rejects unsupported or spoofed input with status 415", async data => {
    await expect(normalizePublicUpload(data)).rejects.toMatchObject({
      status: 415,
    });
  });

  it("rejects a truncated file with a plausible JPEG signature as corrupt", async () => {
    const truncatedJpeg = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
      Buffer.from("not a JPEG payload"),
    ]);
    await expect(normalizePublicUpload(truncatedJpeg)).rejects.toMatchObject({
      status: 422,
    });
  });

  it("rejects empty and over-limit input before invoking a media decoder", async () => {
    await expect(normalizePublicUpload(Buffer.alloc(0))).rejects.toMatchObject({
      status: 400,
    });
    await expect(
      normalizePublicUpload(Buffer.alloc(MAX_PUBLIC_MEDIA_BYTES + 1))
    ).rejects.toMatchObject({ status: 422 });
  });
});
