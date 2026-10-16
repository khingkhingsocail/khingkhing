export const PROFILE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const PROFILE_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
export type ProfileImageMimeType = (typeof PROFILE_IMAGE_MIME_TYPES)[number];

export interface AccountProfileFields {
  displayName: string;
  handle: string;
  bio: string;
  location: string;
  website: string;
  category: string;
}

export interface AccountProfileImageMetadata {
  url: string;
  mimeType: ProfileImageMimeType;
  size: number;
}

export interface AccountProfile extends AccountProfileFields {
  revision: string;
  avatar: AccountProfileImageMetadata | null;
  cover: AccountProfileImageMetadata | null;
  updatedAt: string;
}

export interface AccountProfileSavePayload extends AccountProfileFields {
  expectedRevision: string | null;
  removeAvatar: boolean;
  removeCover: boolean;
}

export interface AccountProfileResponse {
  profile: AccountProfile | null;
}

const HANDLE_PATTERN = /^[\p{L}\p{M}\p{N}._]{3,24}$/u;
const WEBSITE_CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

export function normalizeAccountProfileWebsite(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (WEBSITE_CONTROL_CHARACTERS.test(trimmed)) return null;

  const candidate = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    const parsed = new URL(candidate);
    if (
      (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
      !parsed.hostname.includes(".") ||
      parsed.username.length > 0 ||
      parsed.password.length > 0
    )
      return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function normalizeAccountProfileFields(
  fields: AccountProfileFields
): AccountProfileFields {
  return {
    displayName: fields.displayName.trim(),
    handle: fields.handle.trim().normalize("NFC").toLowerCase(),
    bio: fields.bio.trim(),
    location: fields.location.trim(),
    website:
      normalizeAccountProfileWebsite(fields.website) ?? fields.website.trim(),
    category: fields.category.trim(),
  };
}

export function validateAccountProfileFields(
  fields: AccountProfileFields
): string | null {
  const displayName = fields.displayName.trim();
  const handle = fields.handle.trim().normalize("NFC");
  if (!displayName) return "กรุณากรอกชื่อที่แสดง";
  if (displayName.length > 60) return "ชื่อที่แสดงต้องไม่เกิน 60 ตัวอักษร";
  if (!HANDLE_PATTERN.test(handle))
    return "ชื่อผู้ใช้ต้องมี 3–24 ตัวอักษร และใช้ได้เฉพาะตัวอักษร ตัวเลข จุด หรือขีดล่าง";
  if (fields.bio.length > 160) return "แนะนำตัวต้องไม่เกิน 160 ตัวอักษร";
  if (fields.location.length > 80) return "สถานที่ต้องไม่เกิน 80 ตัวอักษร";
  if (fields.category.length > 40) return "หมวดหมู่ต้องไม่เกิน 40 ตัวอักษร";
  if (
    fields.website.trim() &&
    normalizeAccountProfileWebsite(fields.website) === null
  )
    return "กรุณากรอกลิงก์เว็บไซต์ที่ขึ้นต้นด้วย https:// หรือชื่อโดเมนที่ถูกต้อง";
  if (fields.website.length > 200)
    return "ลิงก์เว็บไซต์ต้องไม่เกิน 200 ตัวอักษร";
  const normalizedWebsite = normalizeAccountProfileWebsite(fields.website);
  if (normalizedWebsite && normalizedWebsite.length > 200)
    return "ลิงก์เว็บไซต์ต้องไม่เกิน 200 ตัวอักษร";
  return null;
}
