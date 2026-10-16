import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectPublicMediaKind } from "../media";
import { EvidenceError } from "./core";
const exec = promisify(execFile);
export interface MediaCheck {
  kind: "image" | "video";
  duration: number | null;
  width: number;
  height: number;
}
export async function inspectEvidence(
  data: Buffer,
  mimeType: string
): Promise<MediaCheck> {
  const kind = detectPublicMediaKind(data, mimeType);
  if (!kind)
    throw new EvidenceError(400, "รูปแบบหรือ signature หลักฐานไม่ถูกต้อง");
  const dir = await mkdtemp(join(tmpdir(), "khing-evidence-"));
  try {
    const file = join(dir, "input");
    await writeFile(file, data);
    const { stdout } = await exec(
      "ffprobe",
      [
        "-v",
        "error",
        "-protocol_whitelist",
        "file",
        "-show_streams",
        "-show_format",
        "-of",
        "json",
        file,
      ],
      { timeout: 15000, maxBuffer: 1024 * 1024 }
    );
    const parsed = JSON.parse(stdout);
    const stream = parsed.streams?.find(
      (s: { codec_type: string }) => s.codec_type === "video"
    );
    if (
      !stream ||
      !Number.isInteger(stream.width) ||
      !Number.isInteger(stream.height) ||
      stream.width < 1 ||
      stream.height < 1 ||
      Math.max(stream.width, stream.height) > 4096
    )
      throw new EvidenceError(
        400,
        "หลักฐานไม่มีภาพที่อ่านได้หรือความละเอียดเกิน 4096px"
      );
    const duration =
      kind === "video"
        ? Number(parsed.format?.duration ?? stream.duration)
        : null;
    if (
      duration !== null &&
      (!Number.isFinite(duration) || duration <= 0 || duration > 180)
    )
      throw new EvidenceError(400, "วิดีโอหลักฐานต้องมีความยาวไม่เกิน 3 นาที");
    // Decode a frame as an integrity check; signature alone does not suffice.
    await exec(
      "ffmpeg",
      [
        "-nostdin",
        "-v",
        "error",
        "-threads",
        "1",
        "-protocol_whitelist",
        "file",
        "-i",
        file,
        "-frames:v",
        "1",
        "-vf",
        "scale=640:640:force_original_aspect_ratio=decrease",
        "-y",
        join(dir, "probe.jpg"),
      ],
      { timeout: 20000, maxBuffer: 1024 * 1024 }
    );
    const probe = await readFile(join(dir, "probe.jpg"));
    if (!probe.length) throw new EvidenceError(400, "ถอดรหัสหลักฐานไม่ได้");
    return { kind, duration, width: stream.width, height: stream.height };
  } catch (cause) {
    if (cause instanceof EvidenceError) throw cause;
    throw new EvidenceError(
      400,
      "ถอดรหัสหลักฐานไม่ได้ กรุณาเลือกไฟล์ภาพ/วิดีโอที่ถูกต้อง"
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
export async function evidenceFrames(
  data: Buffer,
  mimeType: string,
  kind: "image" | "video",
  duration: number | null
): Promise<{ images: string[]; coverage: string }> {
  const dir = await mkdtemp(join(tmpdir(), "khing-ai-"));
  try {
    const file = join(dir, "input");
    await writeFile(file, data);
    const maxFrames =
      kind === "image"
        ? 1
        : Math.min(24, Math.max(2, Math.ceil(duration ?? 1)));
    const filter =
      kind === "image"
        ? "scale=1400:1400:force_original_aspect_ratio=decrease"
        : `fps=${maxFrames / Math.max(duration ?? 1, 1)},scale=960:960:force_original_aspect_ratio=decrease`;
    await exec(
      "ffmpeg",
      [
        "-nostdin",
        "-v",
        "error",
        "-threads",
        "1",
        "-protocol_whitelist",
        "file",
        "-i",
        file,
        "-vf",
        filter,
        "-frames:v",
        String(maxFrames),
        "-q:v",
        "3",
        "-y",
        join(dir, "frame-%03d.jpg"),
      ],
      { timeout: 30000, maxBuffer: 1024 * 1024 }
    );
    const files = (await readdir(dir)).filter(f => f.endsWith(".jpg")).sort();
    if (!files.length) throw new Error("No decoded frames");
    const images = [];
    for (const f of files)
      images.push(
        "data:image/jpeg;base64," +
          (await readFile(join(dir, f))).toString("base64")
      );
    return {
      images,
      coverage:
        kind === "image"
          ? `อ่านภาพต้นฉบับ 1 ภาพ (ย่อไม่เกิน 1400px, MIME ${mimeType})`
          : `สุ่มอ่าน ${images.length} เฟรมจากวิดีโอ ${duration?.toFixed(1)} วินาที ไม่ได้ดูครบทุกเฟรม/เสียง จึงยืนยันการนับซ้ำหรือเวลาแม่นยำไม่ได้`,
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
