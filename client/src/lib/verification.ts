import { arenaCapabilities } from "./arena";
import { previewSessionToken } from "./sessionToken";
import type {
  EvidenceBundle,
  EvidenceReview,
} from "../../../shared/verification";
function headers(profileId?: string): Record<string, string> {
  let session: string | null = null;
  try {
    session = previewSessionToken();
  } catch {}
  return {
    ...(profileId && arenaCapabilities()[profileId]
      ? { "X-Arena-Token": arenaCapabilities()[profileId] }
      : {}),
    ...(session ? { Authorization: `Bearer ${session}` } : {}),
  };
}
async function request<T>(
  path: string,
  method = "GET",
  body?: unknown,
  profileId?: string
): Promise<T> {
  const multipart = body instanceof FormData;
  const response = await fetch("/api/arena/verification" + path, {
    method,
    cache: "no-store",
    credentials: "include",
    headers: {
      ...headers(profileId),
      ...(!multipart && body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: multipart ? body : JSON.stringify(body) } : {}),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(payload?.error ?? `คำขอไม่สำเร็จ (${response.status})`);
  return payload;
}
export function fetchEvidenceBundle(entryId: string, profileId?: string) {
  return request<EvidenceBundle>(
    `/entries/${entryId}`,
    "GET",
    undefined,
    profileId
  );
}
export function uploadEvidence(
  entryId: string,
  profileId: string,
  file: File,
  revision: string
) {
  const body = new FormData();
  body.append("file", file);
  body.append("revision", revision);
  body.append("consent", "true");
  return request<{ message: string }>(
    `/entries/${entryId}/evidence`,
    "POST",
    body,
    profileId
  );
}
export function deleteEvidence(id: string, profileId: string) {
  return request<{ message: string }>(
    `/evidence/${id}`,
    "DELETE",
    undefined,
    profileId
  );
}
export function reviewEvidence(
  entryId: string,
  profileId: string,
  sourceUrls: string[],
  publicLookup: boolean
) {
  return request<{ message: string; status: string }>(
    `/entries/${entryId}/review`,
    "POST",
    { consent: true, publicLookup, sourceUrls },
    profileId
  );
}
export async function evidenceObjectUrl(id: string, profileId?: string) {
  const response = await fetch(`/api/arena/verification/evidence/${id}/file`, {
    headers: headers(profileId),
    cache: "no-store",
    credentials: "include",
  });
  if (!response.ok) throw new Error("ไม่มีสิทธิ์เปิดหลักฐานหรือโหลดไม่ได้");
  return URL.createObjectURL(await response.blob());
}
export interface ReviewQueueItem {
  review: EvidenceReview;
  entry: {
    id: string;
    title: string;
    value: number;
    unit: string;
    period: string;
    observedAt: string;
  };
  profile: { id: string; displayName: string; handle: string };
}
export function fetchReviewQueue() {
  return request<{ items: ReviewQueueItem[] }>("/admin/queue");
}
export function decideReview(
  id: string,
  decision: "approved" | "rejected",
  reason: string,
  snapshot: string,
  profileId: string
) {
  return request<{ message: string }>(
    `/reviews/${id}/decision`,
    "POST",
    { decision, reason, snapshot },
    profileId
  );
}
