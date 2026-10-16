export const MAX_PUBLIC_MEDIA_BYTES = 1000 * 1024 * 1024;
export const PUBLIC_UPLOAD_CHUNK_BYTES = 4 * 1024 * 1024;
export const PUBLIC_UPLOAD_MAX_DURATION = 600;
export const PUBLIC_UPLOAD_SIZE_LABEL = "1,000 MB (1,000 MiB)";
export const PUBLIC_MEDIA_ACCEPT =
  "image/*,video/*,.jpg,.jpeg,.png,.webp,.gif,.bmp,.tif,.tiff,.avif,.heic,.heif,.mp4,.mov,.m4v,.webm,.mkv,.avi";
const extensions =
  /\.(jpe?g|png|webp|gif|bmp|tiff?|avif|hei[cf]|mp4|mov|m4v|webm|mkv|avi)$/i;
const types = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/bmp",
  "image/x-ms-bmp",
  "image/tiff",
  "image/avif",
  "image/heic",
  "image/heif",
  "video/mp4",
  "video/quicktime",
  "video/x-m4v",
  "video/webm",
  "video/x-matroska",
  "video/x-msvideo",
  "video/avi",
]);
export function publicUploadFileError(file: {
  size: number;
  type: string;
  name: string;
}): string {
  if (!Number.isSafeInteger(file.size) || file.size <= 0)
    return "ไฟล์ว่างเปล่า เลือกไฟล์อื่นก่อนโพสต์";
  if (file.size > MAX_PUBLIC_MEDIA_BYTES)
    return `ไฟล์ต้องมีขนาดไม่เกิน ${PUBLIC_UPLOAD_SIZE_LABEL}`;
  if (!types.has(file.type.toLowerCase()) && !extensions.test(file.name))
    return "เลือกไฟล์รูปหรือวิดีโอที่รองรับ ไม่รองรับเอกสารหรือ SVG";
  return "";
}
export interface PublicUploadProgress {
  phase: "uploading" | "processing";
  percent: number;
}
export interface PublicUploadSession {
  id: string;
  token: string;
  chunkBytes: number;
}
