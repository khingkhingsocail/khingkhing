import {
  MAX_EVIDENCE_BYTES,
  MAX_EVIDENCE_FILES,
  MAX_EVIDENCE_TOTAL_BYTES,
} from "../../../shared/verification";
export const EVIDENCE_ACCEPT =
  "image/jpeg,image/png,image/webp,video/mp4,video/webm";
export interface EvidenceFileLike {
  name: string;
  type: string;
  size: number;
  lastModified: number;
}
export function evidenceFileKey(file: EvidenceFileLike): string {
  return JSON.stringify([file.name, file.size, file.type, file.lastModified]);
}
export function addEvidenceFiles<T extends EvidenceFileLike>(
  current: readonly T[],
  added: readonly T[],
  existingCount = 0,
  existingBytes = 0
): T[] {
  const result = current.slice();
  const keys = new Set(current.map(evidenceFileKey));
  for (const file of added) {
    if (!EVIDENCE_ACCEPT.split(",").includes(file.type))
      throw new Error("รองรับรูป JPG/PNG/WebP และวิดีโอ MP4/WebM เท่านั้น");
    if (file.size <= 0 || file.size > MAX_EVIDENCE_BYTES)
      throw new Error(
        `ไฟล์ ${file.name} ต้องมีขนาดมากกว่า 0 และไม่เกิน 20 MiB`
      );
    if (!keys.has(evidenceFileKey(file))) {
      result.push(file);
      keys.add(evidenceFileKey(file));
    }
  }
  if (result.length + existingCount > MAX_EVIDENCE_FILES)
    throw new Error("แนบหลักฐานได้ไม่เกิน 3 ไฟล์ต่อสถิติ รวมไฟล์ที่ส่งแล้ว");
  if (
    result.reduce((sum, file) => sum + file.size, existingBytes) >
    MAX_EVIDENCE_TOTAL_BYTES
  )
    throw new Error("หลักฐานรวมต้องไม่เกิน 50 MiB ต่อสถิติ");
  return result;
}
export async function uploadEvidenceQueue<T>(
  files: readonly T[],
  upload: (file: T) => Promise<unknown>,
  onUploaded: (file: T) => void
): Promise<void> {
  for (const file of files) {
    await upload(file);
    onUploaded(file);
  }
}
