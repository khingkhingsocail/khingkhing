import type {
  AccountProfile,
  AccountProfileFields,
  AccountProfileImageMetadata,
  AccountProfileResponse,
  AccountProfileSavePayload,
} from "@shared/profile";
import { previewSessionToken } from "./sessionToken";

export type AccountProfileImageField = "avatar" | "cover";

export class AccountProfileApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "AccountProfileApiError";
  }
}

export function accountProfileHeaders(): Record<string, string> {
  let token: string | null = null;
  try {
    token = previewSessionToken();
  } catch {
    /* Cookies can still authenticate requests when browser storage is blocked. */
  }
  return {
    "X-Khing-Profile": "1",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function apiError(response: Response, fallback: string) {
  const payload = (await response.json().catch(() => null)) as {
    error?: unknown;
  } | null;
  return new AccountProfileApiError(
    response.status,
    typeof payload?.error === "string" ? payload.error : fallback
  );
}

export async function getAccountProfile(
  signal?: AbortSignal
): Promise<AccountProfile | null> {
  const response = await fetch("/api/profile/me", {
    method: "GET",
    credentials: "include",
    cache: "no-store",
    headers: accountProfileHeaders(),
    signal,
  });
  if (!response.ok)
    throw await apiError(
      response,
      "อ่านโปรไฟล์บัญชีไม่สำเร็จ กรุณาลองอีกครั้ง"
    );
  const payload = (await response.json()) as AccountProfileResponse;
  if (!payload || !("profile" in payload))
    throw new AccountProfileApiError(502, "รูปแบบข้อมูลโปรไฟล์ไม่ถูกต้อง");
  return payload.profile;
}

export async function saveAccountProfile(
  payload: AccountProfileSavePayload,
  files: Partial<Record<AccountProfileImageField, File | null>>,
  signal?: AbortSignal
): Promise<AccountProfile> {
  const form = new FormData();
  form.append("profile", JSON.stringify(payload));
  if (files.avatar) form.append("avatar", files.avatar, files.avatar.name);
  if (files.cover) form.append("cover", files.cover, files.cover.name);

  const response = await fetch("/api/profile/me", {
    method: "PUT",
    credentials: "include",
    cache: "no-store",
    headers: accountProfileHeaders(),
    body: form,
    signal,
  });
  if (!response.ok)
    throw await apiError(
      response,
      "บันทึกโปรไฟล์บัญชีไม่สำเร็จ กรุณาลองอีกครั้ง"
    );
  const result = (await response.json()) as AccountProfileResponse;
  if (!result || !result.profile)
    throw new AccountProfileApiError(
      502,
      "บันทึกแล้วแต่รับข้อมูลโปรไฟล์กลับมาไม่สำเร็จ กรุณาโหลดข้อมูลใหม่"
    );
  return result.profile;
}

export async function fetchAccountProfileImage(
  field: AccountProfileImageField,
  signal?: AbortSignal
): Promise<Blob> {
  const response = await fetch(`/api/profile/me/${field}`, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
    headers: accountProfileHeaders(),
    signal,
  });
  if (!response.ok)
    throw await apiError(response, "โหลดรูปโปรไฟล์ที่บันทึกไว้ไม่สำเร็จ");
  return response.blob();
}

export function isAccountProfileImage(
  value: AccountProfileImageMetadata | null
): value is AccountProfileImageMetadata {
  return Boolean(value && value.size > 0 && value.url);
}

export type { AccountProfile, AccountProfileFields, AccountProfileSavePayload };
