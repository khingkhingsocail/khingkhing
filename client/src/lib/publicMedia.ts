import type {
  PublicMediaCreator,
  PublicMediaPage,
  PublicMediaSummary,
  PublicMediaUploadResult,
} from "@shared/publicMedia";
import {
  MAX_PUBLIC_MEDIA_BYTES,
  PUBLIC_MEDIA_ACCEPT,
  PUBLIC_UPLOAD_CHUNK_BYTES,
  PUBLIC_UPLOAD_MAX_DURATION,
  PUBLIC_UPLOAD_SIZE_LABEL,
  publicUploadFileError,
} from "@shared/publicUpload";
import type {
  PublicUploadProgress,
  PublicUploadSession,
} from "@shared/publicUpload";
import { previewSessionToken } from "./sessionToken";
export {
  MAX_PUBLIC_MEDIA_BYTES,
  PUBLIC_MEDIA_ACCEPT,
  PUBLIC_UPLOAD_CHUNK_BYTES,
  PUBLIC_UPLOAD_MAX_DURATION,
  PUBLIC_UPLOAD_SIZE_LABEL,
  publicUploadFileError,
} from "@shared/publicUpload";

function mediaSessionHeaders(): Record<string, string> {
  const token = previewSessionToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const OWNED_TOKENS_KEY = "khingkhing.public-media.delete-tokens.v1";
const CHUNK_TIMEOUT_MS = 60_000;
const COMPLETE_TIMEOUT_MS = PUBLIC_UPLOAD_MAX_DURATION * 1_000;
const volatileOwnedTokens = new Map<string, string>();

interface ActivePublicUpload {
  file: File;
  title: string;
  description: string;
  account: boolean;
  sessionToken: string | null;
  session: PublicUploadSession;
  uploadedChunks: Set<number>;
}

const activeUploads = new WeakMap<File, ActivePublicUpload[]>();

export interface PublicMediaUploadWithWarning extends PublicMediaUploadResult {
  localCapabilityWarning?: string;
}

export class PublicUploadSessionExpiredError extends Error {
  constructor() {
    super(
      "เซสชันอัปโหลดหมดอายุแล้ว กรุณาเลือกไฟล์อีกครั้งเพื่อเริ่มอัปโหลดใหม่"
    );
    this.name = "PublicUploadSessionExpiredError";
  }
}

export function getPublicMediaAssetUrl(id: string): string {
  return `/api/media/${encodeURIComponent(id)}/asset`;
}

export function getOwnedPublicTokens(): Record<string, string> {
  if (typeof window === "undefined") return {};
  let storedTokens: Record<string, string> = {};
  try {
    const parsed: unknown = JSON.parse(
      window.localStorage.getItem(OWNED_TOKENS_KEY) ?? "{}"
    );
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
      storedTokens = Object.fromEntries(
        Object.entries(parsed).filter(
          ([id, token]) =>
            /^[a-f0-9]{32}$/.test(id) &&
            typeof token === "string" &&
            /^[A-Za-z0-9_-]{40,50}$/.test(token)
        )
      );
  } catch {
    // Volatile tokens still work for this tab when storage becomes unavailable.
  }
  return { ...storedTokens, ...Object.fromEntries(volatileOwnedTokens) };
}

function assertTokenStoreAvailable() {
  try {
    const current = window.localStorage.getItem(OWNED_TOKENS_KEY) ?? "{}";
    window.localStorage.setItem(OWNED_TOKENS_KEY, current);
  } catch {
    throw new Error(
      "เบราว์เซอร์นี้บันทึกรหัสลบไม่ได้ กรุณาเปิดใช้ local storage ก่อนโพสต์สาธารณะ"
    );
  }
}

function saveOwnedToken(id: string, token: string) {
  volatileOwnedTokens.set(id, token);
  const current = getOwnedPublicTokens();
  current[id] = token;
  window.localStorage.setItem(OWNED_TOKENS_KEY, JSON.stringify(current));
  volatileOwnedTokens.delete(id);
}

export function forgetOwnedPublicToken(id: string) {
  volatileOwnedTokens.delete(id);
  const current = getOwnedPublicTokens();
  delete current[id];
  try {
    window.localStorage.setItem(OWNED_TOKENS_KEY, JSON.stringify(current));
  } catch {
    // Remote deletion already succeeded; stale local capability has no effect on the removed database row.
  }
}

async function readApiError(response: Response): Promise<string> {
  try {
    const payload: unknown = await response.json();
    if (
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      typeof payload.error === "string"
    )
      return payload.error;
  } catch {
    // Use the status-based message below when the server doesn't return JSON.
  }
  return `คำขอไม่สำเร็จ (${response.status})`;
}

function sessionHeaders(token: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
  }
}

function isTransientStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function isTransientNetworkFailure(cause: unknown): boolean {
  return (
    cause instanceof TypeError ||
    (cause instanceof Error &&
      (cause.name === "AbortError" || cause.name === "TimeoutError"))
  );
}

function findActiveUpload(
  file: File,
  title: string,
  description: string,
  account: boolean,
  sessionToken: string | null
): ActivePublicUpload | undefined {
  return activeUploads
    .get(file)
    ?.find(
      upload =>
        upload.title === title &&
        upload.description === description &&
        upload.account === account &&
        upload.sessionToken === sessionToken
    );
}

function forgetActiveUpload(upload: ActivePublicUpload) {
  const remaining = (activeUploads.get(upload.file) ?? []).filter(
    candidate => candidate !== upload
  );
  if (remaining.length) activeUploads.set(upload.file, remaining);
  else activeUploads.delete(upload.file);
}

export async function fetchPublicMediaPage(
  cursor: string | null = null,
  limit = 40
): Promise<PublicMediaPage> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set("cursor", cursor);
  const response = await fetch(`/api/media?${params.toString()}`, {
    credentials: "include",
    cache: "no-store",
    headers: { Accept: "application/json", ...mediaSessionHeaders() },
  });
  if (!response.ok) throw new Error(await readApiError(response));
  return (await response.json()) as PublicMediaPage;
}

export async function fetchPublicMediaItem(
  id: string
): Promise<PublicMediaSummary> {
  if (!/^[a-f0-9]{32}$/.test(id)) throw new Error("รหัสโพสต์ไม่ถูกต้อง");
  const response = await fetch(`/api/media/${id}`, {
    credentials: "include",
    cache: "no-store",
    headers: { Accept: "application/json", ...mediaSessionHeaders() },
  });
  if (!response.ok) throw new Error(await readApiError(response));
  const item: unknown = await response.json();
  if (!isPublicMediaSummary(item)) throw new Error("ข้อมูลโพสต์ไม่ถูกต้อง");
  return item;
}

export async function uploadPublicMedia(
  file: File,
  title: string,
  description: string,
  account = false,
  onProgress?: (progress: PublicUploadProgress) => void
): Promise<PublicMediaUploadWithWarning> {
  const validationError = publicUploadFileError(file);
  if (validationError) throw new Error(validationError);

  const normalizedTitle = title.trim().slice(0, 100);
  const normalizedDescription = description.trim().slice(0, 240);
  const sessionToken = previewSessionToken();
  let upload = findActiveUpload(
    file,
    normalizedTitle,
    normalizedDescription,
    account,
    sessionToken
  );

  if (!upload) {
    // Guests need a durable delete capability; account posts are deleted through
    // the signed-in account and must not depend on browser storage.
    if (!account) assertTokenStoreAvailable();
    const createResponse = await fetchWithTimeout(
      "/api/media/uploads",
      {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-Khing-Upload": "1",
          ...sessionHeaders(sessionToken),
          ...(account ? { "X-Khing-Media-Account": "1" } : {}),
        },
        body: JSON.stringify({
          title: normalizedTitle,
          description: normalizedDescription,
          filename: file.name,
          size: file.size,
          mimeType:
            file.type.trim().toLowerCase() || mimeTypeFromName(file.name),
        }),
      },
      CHUNK_TIMEOUT_MS
    );
    if (!createResponse.ok) throw new Error(await readApiError(createResponse));
    const sessionPayload: unknown = await createResponse.json();
    if (!sessionPayload || typeof sessionPayload !== "object")
      throw new Error("ได้รับข้อมูลเซสชันอัปโหลดที่ไม่ถูกต้อง");
    const session = sessionPayload as Partial<PublicUploadSession>;
    if (
      typeof session.id !== "string" ||
      !/^[a-f0-9]{32}$/.test(session.id) ||
      typeof session.token !== "string" ||
      !/^[A-Za-z0-9_-]{43}$/.test(session.token) ||
      !Number.isSafeInteger(session.chunkBytes) ||
      session.chunkBytes !== PUBLIC_UPLOAD_CHUNK_BYTES
    )
      throw new Error("ได้รับข้อมูลเซสชันอัปโหลดที่ไม่ถูกต้อง");

    upload = {
      file,
      title: normalizedTitle,
      description: normalizedDescription,
      account,
      sessionToken,
      session: session as PublicUploadSession,
      uploadedChunks: new Set<number>(),
    };
    activeUploads.set(file, [...(activeUploads.get(file) ?? []), upload]);
  }

  const session = upload.session;
  const chunkCount = Math.ceil(file.size / session.chunkBytes);
  const reportProgress = (phase: PublicUploadProgress["phase"]) => {
    const uploadedBytes = [...upload.uploadedChunks].reduce(
      (total, index) =>
        total +
        Math.min(
          session.chunkBytes,
          Math.max(0, file.size - index * session.chunkBytes)
        ),
      0
    );
    onProgress?.({
      phase,
      percent:
        phase === "processing"
          ? 100
          : Math.min(100, Math.floor((uploadedBytes / file.size) * 100)),
    });
  };

  reportProgress("uploading");
  for (let index = 0; index < chunkCount; index += 1) {
    if (upload.uploadedChunks.has(index)) continue;
    const start = index * session.chunkBytes;
    const chunk = file.slice(
      start,
      Math.min(file.size, start + session.chunkBytes)
    );
    let uploaded = false;
    for (let attempt = 0; attempt < 2 && !uploaded; attempt += 1) {
      try {
        const chunkResponse = await fetchWithTimeout(
          `/api/media/uploads/${encodeURIComponent(session.id)}/chunks/${index}`,
          {
            method: "PUT",
            credentials: "include",
            cache: "no-store",
            headers: {
              "Content-Type": "application/octet-stream",
              "X-Khing-Upload": "1",
              "X-Upload-Token": session.token,
              ...sessionHeaders(sessionToken),
              ...(account ? { "X-Khing-Media-Account": "1" } : {}),
            },
            body: chunk,
          },
          CHUNK_TIMEOUT_MS
        );
        if (chunkResponse.status === 410) {
          forgetActiveUpload(upload);
          throw new PublicUploadSessionExpiredError();
        } else if (chunkResponse.status === 204) {
          uploaded = true;
          upload.uploadedChunks.add(index);
          reportProgress("uploading");
        } else if (attempt === 0 && isTransientStatus(chunkResponse.status)) {
          continue;
        } else {
          throw new Error(await readApiError(chunkResponse));
        }
      } catch (cause) {
        if (attempt === 0 && isTransientNetworkFailure(cause)) continue;
        throw cause;
      }
    }
  }

  reportProgress("processing");
  const completeResponse = await fetchWithTimeout(
    `/api/media/uploads/${encodeURIComponent(session.id)}/complete`,
    {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "X-Khing-Upload": "1",
        "X-Upload-Token": session.token,
        ...sessionHeaders(sessionToken),
        ...(account ? { "X-Khing-Media-Account": "1" } : {}),
      },
    },
    COMPLETE_TIMEOUT_MS
  );
  if (completeResponse.status === 410) {
    forgetActiveUpload(upload);
    throw new PublicUploadSessionExpiredError();
  }
  if (!completeResponse.ok)
    throw new Error(await readApiError(completeResponse));
  const payload: unknown = await completeResponse.json();
  if (!payload || typeof payload !== "object")
    throw new Error("ได้รับผลการอัปโหลดที่ไม่ถูกต้อง");
  const result = payload as Partial<PublicMediaUploadResult>;
  if (
    !isPublicMediaSummary(result.item) ||
    typeof result.deleteToken !== "string" ||
    !result.deleteToken ||
    result.item.id !== session.id ||
    result.deleteToken !== session.token
  )
    throw new Error("ผลการอัปโหลดไม่ตรงกับเซสชัน กรุณาลองยืนยันอีกครั้ง");

  let localCapabilityWarning: string | undefined;
  if (!account) {
    try {
      saveOwnedToken(result.item.id, result.deleteToken);
    } catch {
      // The post is already public. Keep its capability in tab memory; never
      // roll back a successfully published post because localStorage failed.
      volatileOwnedTokens.set(result.item.id, result.deleteToken);
      localCapabilityWarning =
        "โพสต์เผยแพร่แล้ว แต่บันทึกรหัสลบในเบราว์เซอร์ไม่สำเร็จ คุณยังจัดการโพสต์นี้ได้ในแท็บนี้; หากปิดแท็บหรืออุปกรณ์อาจกู้คืนรหัสลบไม่ได้";
    }
  }
  forgetActiveUpload(upload);
  return {
    item: result.item,
    deleteToken: result.deleteToken,
    ...(localCapabilityWarning ? { localCapabilityWarning } : {}),
  };
}

function mimeTypeFromName(filename: string): string {
  const extension = filename.toLowerCase().match(/\.([^.]+)$/)?.[1];
  const types: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    bmp: "image/bmp",
    tif: "image/tiff",
    tiff: "image/tiff",
    avif: "image/avif",
    heic: "image/heic",
    heif: "image/heif",
    mp4: "video/mp4",
    mov: "video/quicktime",
    m4v: "video/x-m4v",
    webm: "video/webm",
    mkv: "video/x-matroska",
    avi: "video/x-msvideo",
  };
  return extension ? (types[extension] ?? "") : "";
}

export async function deletePublicMedia(
  id: string,
  deleteToken: string
): Promise<void> {
  const response = await fetch(`/api/media/${encodeURIComponent(id)}`, {
    method: "DELETE",
    credentials: "include",
    headers: {
      "X-Delete-Token": deleteToken,
      "X-Khing-Media-Account": "1",
      ...mediaSessionHeaders(),
    },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(await readApiError(response));
}

export function isPublicMediaSummary(
  value: unknown
): value is PublicMediaSummary {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    /^[a-f0-9]{32}$/.test(item.id) &&
    typeof item.title === "string" &&
    typeof item.description === "string" &&
    (item.kind === "image" || item.kind === "video") &&
    typeof item.mimeType === "string" &&
    typeof item.size === "number" &&
    (item.viewCount === undefined ||
      (typeof item.viewCount === "number" &&
        Number.isSafeInteger(item.viewCount) &&
        item.viewCount >= 0)) &&
    typeof item.createdAt === "string"
  );
}

export async function claimPublicMedia(
  id: string,
  token: string
): Promise<void> {
  const response = await fetch(`/api/media/${encodeURIComponent(id)}/claim`, {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: {
      "X-Khing-Media-Account": "1",
      "X-Delete-Token": token,
      ...mediaSessionHeaders(),
    },
  });
  if (!response.ok) throw new Error(await readApiError(response));
}

export async function fetchPublicMediaCreator(
  id: string
): Promise<PublicMediaCreator> {
  // The public creator ID is not the internal authenticated account ID.
  if (!/^[a-f0-9]{32}$/.test(id)) throw new Error("รหัสโปรไฟล์ไม่ถูกต้อง");
  const response = await fetch(`/api/media/creators/${id}`, {
    cache: "no-store",
  });
  if (!response.ok) throw new Error(await readApiError(response));
  return (await response.json()) as PublicMediaCreator;
}
export async function fetchCreatorMediaPage(
  id: string,
  cursor: string | null = null,
  limit = 40
): Promise<PublicMediaPage> {
  if (!/^[a-f0-9]{32}$/.test(id)) throw new Error("รหัสโปรไฟล์ไม่ถูกต้อง");
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set("cursor", cursor);
  const response = await fetch(`/api/media/creators/${id}/posts?${params}`, {
    credentials: "include",
    cache: "no-store",
    headers: mediaSessionHeaders(),
  });
  if (!response.ok) throw new Error(await readApiError(response));
  return (await response.json()) as PublicMediaPage;
}
