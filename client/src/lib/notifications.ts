import type {
  NotificationPage,
  NotificationReadResult,
  PublicNotification,
} from "../../../shared/notifications";
import { MAX_NOTIFICATION_ID } from "../../../shared/notifications";
import { previewSessionToken } from "./sessionToken";

export class NotificationsApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

function validId(id: number): number {
  if (
    !Number.isSafeInteger(id) ||
    id <= 0 ||
    id > MAX_NOTIFICATION_ID
  )
    throw new NotificationsApiError(400, "ลำดับการแจ้งเตือนไม่ถูกต้อง");
  return id;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("X-Khing-Notifications", "1");
  const token = previewSessionToken();
  if (token && !headers.has("Authorization"))
    headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`/api/notifications${path}`, {
    ...init,
    credentials: "include",
    cache: "no-store",
    headers,
  });
  const body = await response
    .json()
    .catch(() => ({ error: "ระบบการแจ้งเตือนไม่พร้อม กรุณาลองใหม่" }));
  if (!response.ok)
    throw new NotificationsApiError(
      response.status,
      body.error ?? "โหลดการแจ้งเตือนไม่สำเร็จ"
    );
  return body as T;
}

export function fetchNotifications(
  before?: number | null,
  signal?: AbortSignal
): Promise<NotificationPage> {
  const cursor = before == null ? "" : `?before=${validId(before)}`;
  return request<NotificationPage>(cursor, { signal });
}

export function markNotificationRead(
  id: number
): Promise<NotificationReadResult> {
  return request<NotificationReadResult>(`/${validId(id)}/read`, {
    method: "POST",
  });
}

export function markAllNotificationsRead(throughId: number): Promise<{ ok: true }> {
  return request<{ ok: true }>("/read-all", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ throughId: validId(throughId) }),
  });
}

/** Deduplicate page updates by ID and keep the newest notification first. */
export function mergeNotificationItems(
  current: PublicNotification[],
  incoming: PublicNotification[]
): PublicNotification[] {
  return Array.from(
    new Map([...current, ...incoming].map(item => [item.id, item])).values()
  ).sort((a, b) => b.id - a.id);
}
