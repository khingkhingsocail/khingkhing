import { execFile as nodeExecFile } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
  MAX_PUBLIC_MEDIA_BYTES,
  PUBLIC_UPLOAD_MAX_DURATION,
} from "../../shared/publicUpload";

const execFile = promisify(nodeExecFile);
const MAX_OUTPUT_BYTES = MAX_PUBLIC_MEDIA_BYTES;
const MAX_IMAGE_DIMENSION = 16_384;
const MAX_IMAGE_PIXELS = 80_000_000;
const MAX_IMAGE_OUTPUT_DIMENSION = 4_096;
const MAX_PROBE_BUFFER = 4 * 1024 * 1024;
const FFPROBE_TIMEOUT_MS = 20_000;
const IMAGE_TIMEOUT_MS = 90_000;
const VIDEO_TIMEOUT_MS = 8 * 60_000;
const VIDEO_DURATION_TOLERANCE_SECONDS = 0.3;
const MAX_IMAGE_ALLOC_BYTES = 512 * 1024 * 1024;

type ImageFormat =
  | "jpeg"
  | "png"
  | "webp"
  | "gif"
  | "bmp"
  | "tiff"
  | "avif"
  | "heic"
  | "heif";
type VideoFormat = "mp4" | "mov" | "m4v" | "webm" | "mkv" | "avi";
type SourceFormat = ImageFormat | VideoFormat;
type MediaKind = "image" | "video";
type SupportedSource = {
  kind: MediaKind;
  format: SourceFormat;
  extension: string;
};

export class PublicUploadNormalizeError extends Error {
  readonly status: 400 | 415 | 422;

  constructor(status: 400 | 415 | 422, message: string) {
    super(message);
    this.name = "PublicUploadNormalizeError";
    this.status = status;
  }
}

interface ProbeStream {
  codec_type?: unknown;
  codec_name?: unknown;
  pix_fmt?: unknown;
  width?: unknown;
  height?: unknown;
  duration?: unknown;
  sample_aspect_ratio?: unknown;
  disposition?: { attached_pic?: unknown };
}

interface ProbeDocument {
  streams?: unknown;
  format?: { duration?: unknown };
}

interface ProbedMedia {
  streams: ProbeStream[];
  formatDuration: number | null;
}

const IMAGE_EXTENSIONS: Record<ImageFormat, string> = {
  jpeg: ".jpg",
  png: ".png",
  webp: ".webp",
  gif: ".gif",
  bmp: ".bmp",
  tiff: ".tiff",
  avif: ".avif",
  heic: ".heic",
  heif: ".heif",
};

const VIDEO_EXTENSIONS: Record<VideoFormat, string> = {
  mp4: ".mp4",
  mov: ".mov",
  m4v: ".m4v",
  webm: ".webm",
  mkv: ".mkv",
  avi: ".avi",
};

const ISO_IMAGE_HEIC_BRANDS = new Set([
  "heic",
  "heix",
  "hevc",
  "hevx",
  "heim",
  "heis",
  "hevm",
  "hevs",
]);
const ISO_VIDEO_MP4_BRANDS = new Set([
  "isom",
  "iso2",
  "iso3",
  "iso4",
  "iso5",
  "iso6",
  "iso7",
  "iso8",
  "iso9",
  "mp41",
  "mp42",
  "avc1",
  "M4V ",
  "M4VH",
  "M4VP",
  "F4V ",
  "dash",
  "MSNV",
]);

function decodeError(
  status: 400 | 415 | 422,
  message: string
): PublicUploadNormalizeError {
  return new PublicUploadNormalizeError(status, message);
}

function isIsoBmff(data: Buffer): boolean {
  return data.length >= 12 && data.toString("ascii", 4, 8) === "ftyp";
}

function isoBrands(data: Buffer): string[] {
  if (!isIsoBmff(data) || data.length < 16) return [];
  const declaredBoxSize = data.readUInt32BE(0);
  if (declaredBoxSize !== 0 && declaredBoxSize < 16) return [];
  const availableEnd =
    declaredBoxSize === 0
      ? data.length
      : Math.min(data.length, declaredBoxSize);
  const brands = [data.toString("ascii", 8, 12)];
  for (
    let offset = 16;
    offset + 4 <= availableEnd && offset < 4096;
    offset += 4
  ) {
    brands.push(data.toString("ascii", offset, offset + 4));
  }
  return brands;
}

function sniffSource(data: Buffer): SupportedSource | null {
  if (
    data.length >= 3 &&
    data[0] === 0xff &&
    data[1] === 0xd8 &&
    data[2] === 0xff
  ) {
    return { kind: "image", format: "jpeg", extension: IMAGE_EXTENSIONS.jpeg };
  }
  if (
    data.length >= 8 &&
    data
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return { kind: "image", format: "png", extension: IMAGE_EXTENSIONS.png };
  }
  if (
    data.length >= 12 &&
    data.toString("ascii", 0, 4) === "RIFF" &&
    data.toString("ascii", 8, 12) === "WEBP"
  ) {
    return { kind: "image", format: "webp", extension: IMAGE_EXTENSIONS.webp };
  }
  if (
    data.length >= 6 &&
    (data.toString("ascii", 0, 6) === "GIF87a" ||
      data.toString("ascii", 0, 6) === "GIF89a")
  ) {
    return { kind: "image", format: "gif", extension: IMAGE_EXTENSIONS.gif };
  }
  if (data.length >= 2 && data.toString("ascii", 0, 2) === "BM") {
    return { kind: "image", format: "bmp", extension: IMAGE_EXTENSIONS.bmp };
  }
  if (data.length >= 4) {
    const littleEndian =
      data[0] === 0x49 &&
      data[1] === 0x49 &&
      ((data[2] === 0x2a && data[3] === 0x00) ||
        (data[2] === 0x2b && data[3] === 0x00));
    const bigEndian =
      data[0] === 0x4d &&
      data[1] === 0x4d &&
      ((data[2] === 0x00 && data[3] === 0x2a) ||
        (data[2] === 0x00 && data[3] === 0x2b));
    if (littleEndian || bigEndian) {
      return {
        kind: "image",
        format: "tiff",
        extension: IMAGE_EXTENSIONS.tiff,
      };
    }
  }
  if (isIsoBmff(data)) {
    const brands = isoBrands(data);
    if (brands.some(brand => brand === "avif" || brand === "avis")) {
      return {
        kind: "image",
        format: "avif",
        extension: IMAGE_EXTENSIONS.avif,
      };
    }
    if (brands.some(brand => ISO_IMAGE_HEIC_BRANDS.has(brand))) {
      return {
        kind: "image",
        format: "heic",
        extension: IMAGE_EXTENSIONS.heic,
      };
    }
    if (brands.some(brand => brand === "mif1" || brand === "msf1")) {
      return {
        kind: "image",
        format: "heif",
        extension: IMAGE_EXTENSIONS.heif,
      };
    }
    if (brands.some(brand => brand === "qt  ")) {
      return { kind: "video", format: "mov", extension: VIDEO_EXTENSIONS.mov };
    }
    if (
      brands.some(
        brand => brand === "M4V " || brand === "M4VH" || brand === "M4VP"
      )
    ) {
      return { kind: "video", format: "m4v", extension: VIDEO_EXTENSIONS.m4v };
    }
    if (brands.some(brand => ISO_VIDEO_MP4_BRANDS.has(brand))) {
      return { kind: "video", format: "mp4", extension: VIDEO_EXTENSIONS.mp4 };
    }
  }
  if (
    data.length >= 12 &&
    data.toString("ascii", 0, 4) === "RIFF" &&
    data.toString("ascii", 8, 12) === "AVI "
  ) {
    return { kind: "video", format: "avi", extension: VIDEO_EXTENSIONS.avi };
  }
  if (
    data.length >= 4 &&
    data.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
  ) {
    const ebmlHeader = data.toString("latin1", 0, Math.min(data.length, 4096));
    if (ebmlHeader.includes("webm")) {
      return {
        kind: "video",
        format: "webm",
        extension: VIDEO_EXTENSIONS.webm,
      };
    }
    if (ebmlHeader.includes("matroska")) {
      return { kind: "video", format: "mkv", extension: VIDEO_EXTENSIONS.mkv };
    }
  }
  return null;
}

function parseFiniteNumber(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseProbeDocument(stdout: string): ProbedMedia {
  let parsed: ProbeDocument;
  try {
    parsed = JSON.parse(stdout) as ProbeDocument;
  } catch {
    throw decodeError(
      422,
      "ตรวจข้อมูลไฟล์ไม่สำเร็จ ไฟล์อาจเสียหายหรือไม่สมบูรณ์"
    );
  }
  const streams = Array.isArray(parsed.streams)
    ? parsed.streams.filter(
        (stream): stream is ProbeStream =>
          typeof stream === "object" && stream !== null
      )
    : [];
  return {
    streams,
    formatDuration: parseFiniteNumber(parsed.format?.duration),
  };
}

async function runExecutable(
  executable: string,
  args: string[],
  timeout: number,
  maxBuffer = 1024 * 1024
): Promise<{ stdout: string; stderr: string }> {
  try {
    const result = (await execFile(executable, args, {
      encoding: "utf8",
      timeout,
      killSignal: "SIGKILL",
      maxBuffer,
      windowsHide: true,
    })) as { stdout: string; stderr: string };
    return result;
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String(error.code)
        : "";
    if (
      (executable === "heif-info" || executable === "heif-convert") &&
      code === "ENOENT"
    ) {
      throw decodeError(
        422,
        "เซิร์ฟเวอร์ยังแปลง HEIC/HEIF ไม่ได้ โปรดติดตั้งแพ็กเกจ libheif-examples แล้วลองใหม่"
      );
    }
    if (code === "ETIMEDOUT" || code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
      throw decodeError(
        422,
        "ประมวลผลไฟล์เกินขีดจำกัดเวลา/ทรัพยากร กรุณาย่อไฟล์แล้วลองใหม่"
      );
    }
    throw decodeError(
      422,
      "อ่านหรือแปลงไฟล์ไม่สำเร็จ ไฟล์อาจเสียหายหรือใช้ codec ที่ไม่รองรับ กรุณาบันทึกไฟล์ใหม่หรือเลือกไฟล์อื่น"
    );
  }
}

async function probeFile(filePath: string): Promise<ProbedMedia> {
  const { stdout } = await runExecutable(
    "ffprobe",
    [
      "-protocol_whitelist",
      "file",
      "-v",
      "error",
      "-show_streams",
      "-show_format",
      "-of",
      "json",
      "-i",
      filePath,
    ],
    FFPROBE_TIMEOUT_MS,
    MAX_PROBE_BUFFER
  );
  return parseProbeDocument(stdout);
}

function getVideoStream(probe: ProbedMedia): ProbeStream {
  const video = probe.streams.find(
    stream =>
      stream.codec_type === "video" && stream.disposition?.attached_pic !== 1
  );
  if (!video)
    throw decodeError(
      422,
      "ไฟล์นี้ไม่มีภาพวิดีโอที่อ่านได้ โปรดเลือกวิดีโอไฟล์อื่น"
    );
  return video;
}

function validateDimensions(stream: ProbeStream): {
  width: number;
  height: number;
} {
  const width = parseFiniteNumber(stream.width);
  const height = parseFiniteNumber(stream.height);
  if (
    !width ||
    !height ||
    !Number.isInteger(width) ||
    !Number.isInteger(height)
  ) {
    throw decodeError(
      422,
      "อ่านขนาดภาพ/เฟรมไม่ได้ ไฟล์อาจเสียหายหรือเข้ารหัสอยู่"
    );
  }
  if (
    width > MAX_IMAGE_DIMENSION ||
    height > MAX_IMAGE_DIMENSION ||
    width * height > MAX_IMAGE_PIXELS
  ) {
    throw decodeError(
      422,
      "ภาพมีขนาดใหญ่เกินขีดจำกัด (ด้านละไม่เกิน 16,384 พิกเซล และรวมไม่เกิน 80 ล้านพิกเซล) กรุณาย่อภาพก่อนอัปโหลด"
    );
  }
  return { width, height };
}

async function decodeImage(
  filePath: string
): Promise<{ width: number; height: number }> {
  const probe = await probeFile(filePath);
  const imageStream = getVideoStream(probe);
  const dimensions = validateDimensions(imageStream);
  await runExecutable(
    "ffmpeg",
    [
      "-hide_banner",
      "-nostdin",
      "-v",
      "error",
      "-xerror",
      "-protocol_whitelist",
      "file",
      "-threads",
      "1",
      "-max_pixels",
      String(MAX_IMAGE_PIXELS),
      "-max_alloc",
      String(MAX_IMAGE_ALLOC_BYTES),
      "-i",
      filePath,
      "-map",
      "0:v:0",
      "-frames:v",
      "1",
      "-f",
      "null",
      "-",
    ],
    IMAGE_TIMEOUT_MS,
    MAX_PROBE_BUFFER
  );
  return dimensions;
}

async function convertImageToPng(
  sourcePath: string,
  outputPath: string,
  scaled: boolean
): Promise<void> {
  const args = [
    "-hide_banner",
    "-nostdin",
    "-v",
    "error",
    "-xerror",
    "-protocol_whitelist",
    "file",
    "-threads",
    "1",
    "-filter_threads",
    "1",
    "-max_pixels",
    String(MAX_IMAGE_PIXELS),
    "-max_alloc",
    String(MAX_IMAGE_ALLOC_BYTES),
    "-i",
    sourcePath,
    "-map",
    "0:v:0",
    "-frames:v",
    "1",
  ];
  if (scaled) {
    args.push(
      "-vf",
      `scale=${MAX_IMAGE_OUTPUT_DIMENSION}:${MAX_IMAGE_OUTPUT_DIMENSION}:force_original_aspect_ratio=decrease:force_divisible_by=2`
    );
  }
  args.push(
    "-threads",
    "2",
    "-c:v",
    "png",
    "-compression_level",
    "6",
    "-f",
    "image2",
    "-update",
    "1",
    "-fs",
    String(MAX_OUTPUT_BYTES),
    "-y",
    outputPath
  );
  await runExecutable("ffmpeg", args, IMAGE_TIMEOUT_MS, MAX_PROBE_BUFFER);
}

async function convertHeifToJpeg(
  sourcePath: string,
  outputPath: string
): Promise<void> {
  await runExecutable(
    "heif-convert",
    ["--quiet", "--quality", "88", sourcePath, outputPath],
    IMAGE_TIMEOUT_MS
  );
}

async function validateHeifDimensions(sourcePath: string): Promise<void> {
  const { stdout, stderr } = await runExecutable(
    "heif-info",
    [sourcePath],
    FFPROBE_TIMEOUT_MS
  );
  const imageLines = `${stdout}\n${stderr}`.matchAll(
    /^\s*image:\s*(\d+)\s*x\s*(\d+)/gim
  );
  let foundImage = false;
  for (const match of imageLines) {
    foundImage = true;
    validateDimensions({ width: Number(match[1]), height: Number(match[2]) });
  }
  if (!foundImage) {
    throw decodeError(
      422,
      "อ่านข้อมูลขนาดภาพ HEIC/HEIF ไม่ได้ ไฟล์อาจเสียหายหรือไม่สมบูรณ์"
    );
  }
}

async function normalizeImage(
  source: SupportedSource,
  sourcePath: string,
  tempDirectory: string
): Promise<Buffer> {
  if (source.format === "heic" || source.format === "heif") {
    const convertedPath = path.join(tempDirectory, "heif-decoded.jpg");
    await validateHeifDimensions(sourcePath);
    await convertHeifToJpeg(sourcePath, convertedPath);
    await decodeImage(convertedPath);
    const converted = await readFile(convertedPath);
    if (converted.length > MAX_OUTPUT_BYTES) {
      return recompressOversizedJpeg(convertedPath, tempDirectory);
    }
    return converted;
  }

  const dimensions = await decodeImage(sourcePath);
  if (
    source.format === "jpeg" ||
    source.format === "png" ||
    source.format === "webp"
  ) {
    // Validate one decodable frame, but keep the original bytes and any metadata intact.
    return readFile(sourcePath);
  }

  // For formats outside JPEG/PNG/WebP (including animation), store only the first decoded frame.
  const convertedPath = path.join(tempDirectory, "normalized-image.png");
  await convertImageToPng(sourcePath, convertedPath, false);
  let convertedStat = await stat(convertedPath);
  if (convertedStat.size >= MAX_OUTPUT_BYTES) {
    await rm(convertedPath, { force: true });
    await convertImageToPng(sourcePath, convertedPath, true);
    convertedStat = await stat(convertedPath);
  }
  if (
    !convertedStat.isFile() ||
    convertedStat.size === 0 ||
    convertedStat.size > MAX_OUTPUT_BYTES
  ) {
    throw decodeError(
      422,
      "ภาพหลังแปลงยังมีขนาดเกิน 1,000 MiB กรุณาย่อภาพหรือบันทึกเป็น JPEG แล้วลองใหม่"
    );
  }
  await decodeImage(convertedPath);
  // Keep the decoded source dimensions checked above; fallback scaling is only used to fit the output cap.
  void dimensions;
  return readFile(convertedPath);
}

async function recompressOversizedJpeg(
  sourcePath: string,
  tempDirectory: string
): Promise<Buffer> {
  const outputPath = path.join(tempDirectory, "normalized-image.jpg");
  await runExecutable(
    "ffmpeg",
    [
      "-hide_banner",
      "-nostdin",
      "-v",
      "error",
      "-xerror",
      "-protocol_whitelist",
      "file",
      "-threads",
      "1",
      "-filter_threads",
      "1",
      "-max_pixels",
      String(MAX_IMAGE_PIXELS),
      "-max_alloc",
      String(MAX_IMAGE_ALLOC_BYTES),
      "-i",
      sourcePath,
      "-map",
      "0:v:0",
      "-frames:v",
      "1",
      "-vf",
      `scale=${MAX_IMAGE_OUTPUT_DIMENSION}:${MAX_IMAGE_OUTPUT_DIMENSION}:force_original_aspect_ratio=decrease:force_divisible_by=2`,
      "-threads",
      "2",
      "-c:v",
      "mjpeg",
      "-q:v",
      "4",
      "-f",
      "image2",
      "-update",
      "1",
      "-fs",
      String(MAX_OUTPUT_BYTES),
      "-y",
      outputPath,
    ],
    IMAGE_TIMEOUT_MS,
    MAX_PROBE_BUFFER
  );
  const outputStat = await stat(outputPath);
  if (
    !outputStat.isFile() ||
    outputStat.size === 0 ||
    outputStat.size > MAX_OUTPUT_BYTES
  ) {
    throw decodeError(
      422,
      "ภาพหลังแปลงยังมีขนาดเกิน 1,000 MiB กรุณาย่อภาพก่อนอัปโหลด"
    );
  }
  await decodeImage(outputPath);
  return readFile(outputPath);
}

function durationFromProbe(probe: ProbedMedia): number {
  const duration = probe.formatDuration;
  if (duration === null || duration <= 0) {
    throw decodeError(
      422,
      "อ่านระยะเวลาวิดีโอไม่ได้หรือค่าไม่ถูกต้อง โปรดบันทึกวิดีโอใหม่แล้วลองอีกครั้ง"
    );
  }
  if (duration > PUBLIC_UPLOAD_MAX_DURATION) {
    throw decodeError(
      422,
      `วิดีโอต้องมีความยาวไม่เกิน ${PUBLIC_UPLOAD_MAX_DURATION} วินาที กรุณาตัดวิดีโอแล้วลองใหม่`
    );
  }
  return duration;
}

async function transcodeVideo(
  sourcePath: string,
  outputPath: string
): Promise<void> {
  await runExecutable(
    "ffmpeg",
    [
      "-hide_banner",
      "-nostdin",
      "-v",
      "error",
      "-xerror",
      "-err_detect",
      "explode",
      "-protocol_whitelist",
      "file",
      "-threads",
      "1",
      "-filter_threads",
      "1",
      "-max_pixels",
      String(MAX_IMAGE_PIXELS),
      "-max_alloc",
      String(MAX_IMAGE_ALLOC_BYTES),
      "-i",
      sourcePath,
      "-map",
      "0:v:0",
      "-map",
      "0:a:0?",
      "-map_metadata",
      "-1",
      "-map_chapters",
      "-1",
      "-vf",
      "scale=w='min(1920,iw)':h='min(1080,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",
      "-threads",
      "2",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "24",
      "-maxrate",
      "1100k",
      "-bufsize",
      "2200k",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "96k",
      "-sn",
      "-dn",
      "-movflags",
      "+faststart",
      "-fs",
      String(MAX_OUTPUT_BYTES),
      "-f",
      "mp4",
      "-y",
      outputPath,
    ],
    VIDEO_TIMEOUT_MS,
    MAX_PROBE_BUFFER
  );
}

async function normalizeVideo(
  sourcePath: string,
  tempDirectory: string
): Promise<Buffer> {
  const inputProbe = await probeFile(sourcePath);
  const inputVideo = getVideoStream(inputProbe);
  const inputDuration = durationFromProbe(inputProbe);
  validateDimensions(inputVideo);
  const hasInputAudio = inputProbe.streams.some(
    stream => stream.codec_type === "audio"
  );
  const outputPath = path.join(tempDirectory, "normalized-video.mp4");
  await transcodeVideo(sourcePath, outputPath);
  const outputStat = await stat(outputPath);
  if (
    !outputStat.isFile() ||
    outputStat.size === 0 ||
    outputStat.size > MAX_OUTPUT_BYTES
  ) {
    throw decodeError(
      422,
      "วิดีโอหลังแปลงมีขนาดเกิน 1,000 MiB กรุณาลดความละเอียดหรือบิตเรตแล้วลองใหม่"
    );
  }
  const outputProbe = await probeFile(outputPath);
  const outputVideo = getVideoStream(outputProbe);
  const outputDuration = durationFromProbe(outputProbe);
  const outputWidth = parseFiniteNumber(outputVideo.width);
  const outputHeight = parseFiniteNumber(outputVideo.height);
  if (
    outputVideo.codec_name !== "h264" ||
    outputVideo.pix_fmt !== "yuv420p" ||
    outputWidth === null ||
    outputHeight === null ||
    outputWidth > 1920 ||
    outputHeight > 1080
  ) {
    throw decodeError(
      422,
      "ยืนยันรูปแบบวิดีโอ MP4 หลังแปลงไม่สำเร็จ กรุณาลองไฟล์อื่น"
    );
  }
  if (
    hasInputAudio &&
    !outputProbe.streams.some(
      stream => stream.codec_type === "audio" && stream.codec_name === "aac"
    )
  ) {
    throw decodeError(
      422,
      "เก็บเสียงวิดีโอหลังแปลงไม่สำเร็จ กรุณาตรวจไฟล์ต้นฉบับแล้วลองใหม่"
    );
  }
  if (
    Math.abs(inputDuration - outputDuration) > VIDEO_DURATION_TOLERANCE_SECONDS
  ) {
    throw decodeError(
      422,
      "วิดีโอที่แปลงได้ไม่ครบความยาวต้นฉบับ จึงยกเลิกเพื่อไม่ให้ได้ไฟล์ที่ถูกตัดเงียบ ๆ กรุณาลดบิตเรตหรือแบ่งวิดีโอแล้วลองใหม่"
    );
  }
  return readFile(outputPath);
}

export async function normalizePublicUpload(
  data: Buffer
): Promise<{ data: Buffer; mimeType: string; kind: "image" | "video" }> {
  if (!Buffer.isBuffer(data) || data.length === 0) {
    throw decodeError(400, "ไฟล์ว่างเปล่า เลือกไฟล์ก่อนอัปโหลด");
  }
  if (data.length > MAX_PUBLIC_MEDIA_BYTES) {
    throw decodeError(
      422,
      "ไฟล์ต้นฉบับมีขนาดเกิน 1,000 MiB กรุณาลดขนาดไฟล์ก่อนอัปโหลด"
    );
  }
  const source = sniffSource(data);
  if (!source) {
    throw decodeError(
      415,
      "ชนิดไฟล์ไม่รองรับหรือไม่ตรงกับข้อมูลจริง รองรับ JPEG, PNG, WebP, GIF, BMP, TIFF, AVIF, HEIC/HEIF, MP4, MOV, M4V, WebM, MKV และ AVI เท่านั้น (ไม่รองรับ SVG, HTML หรือ PDF)"
    );
  }

  let tempDirectory: string;
  try {
    tempDirectory = await mkdtemp(
      path.join(tmpdir(), "public-upload-normalize-")
    );
  } catch {
    throw decodeError(
      422,
      "ไม่สามารถเตรียมพื้นที่ชั่วคราวเพื่อประมวลผลไฟล์ได้ โปรดลองใหม่ภายหลัง"
    );
  }
  try {
    const sourcePath = path.join(tempDirectory, `source${source.extension}`);
    await writeFile(sourcePath, data, { flag: "wx", mode: 0o600 });
    if (source.kind === "image") {
      const normalized = await normalizeImage(
        source,
        sourcePath,
        tempDirectory
      );
      if (normalized.length === 0 || normalized.length > MAX_OUTPUT_BYTES) {
        throw decodeError(
          422,
          "ไฟล์ภาพที่ประมวลผลแล้วว่างเปล่าหรือเกิน 1,000 MiB กรุณาย่อไฟล์แล้วลองใหม่"
        );
      }
      const mimeType =
        source.format === "jpeg" ||
        source.format === "png" ||
        source.format === "webp"
          ? `image/${source.format === "jpeg" ? "jpeg" : source.format}`
          : source.format === "heic" || source.format === "heif"
            ? "image/jpeg"
            : "image/png";
      return { data: normalized, mimeType, kind: "image" };
    }
    const normalized = await normalizeVideo(sourcePath, tempDirectory);
    if (normalized.length === 0 || normalized.length > MAX_OUTPUT_BYTES) {
      throw decodeError(
        422,
        "ไฟล์วิดีโอที่ประมวลผลแล้วว่างเปล่าหรือเกิน 1,000 MiB กรุณาลองลดความละเอียดหรือความยาว"
      );
    }
    return { data: normalized, mimeType: "video/mp4", kind: "video" };
  } catch (error) {
    if (error instanceof PublicUploadNormalizeError) throw error;
    throw decodeError(
      422,
      "ตรวจสอบหรือแปลงไฟล์ไม่สำเร็จ ไฟล์อาจเสียหาย โปรดลองบันทึกใหม่"
    );
  } finally {
    await rm(tempDirectory, { recursive: true, force: true }).catch(
      () => undefined
    );
  }
}
