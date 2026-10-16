import type {
  ChatPerson,
  ChatRoom,
  ChatChannel,
  ChatMessage,
  ChatTarget,
  ChatRoomCursor,
} from "../../../shared/chat";
import { arenaCapabilities } from "./arena";
import { previewSessionToken } from "./sessionToken";
export class ChatApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}
export function chatHeaders(): Record<string, string> {
  try {
    const token = previewSessionToken();
    return {
      "X-Khing-Chat": "1",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  } catch {
    return { "X-Khing-Chat": "1" };
  }
}
async function request<T>(
  path: string,
  method = "GET",
  body?: unknown,
  extra: Record<string, string> = {},
  signal?: AbortSignal
): Promise<T> {
  const multipart = body instanceof FormData;
  const response = await fetch("/api/chat" + path, {
    method,
    cache: "no-store",
    credentials: "include",
    signal,
    headers: {
      ...chatHeaders(),
      ...extra,
      ...(body && !multipart ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: multipart ? body : JSON.stringify(body) } : {}),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new ChatApiError(response.status, data?.error ?? "แชทไม่สำเร็จ");
  return data;
}
export const fetchChatMe = () =>
  request<{ userId: number; account: ChatPerson | null }>("/me");
export function saveChatAccount(
  displayName: string,
  arenaProfileId: string | null
) {
  return request<{ account: ChatPerson }>(
    "/me",
    "POST",
    { displayName, arenaProfileId },
    arenaProfileId
      ? { "X-Arena-Token": arenaCapabilities()[arenaProfileId] ?? "" }
      : {}
  );
}
export const fetchChatPeople = (q = "", profileId?: string) =>
  request<{ people: ChatPerson[] }>(
    `/people?${new URLSearchParams({ q, ...(profileId ? { profileId } : {}) })}`
  );
export const fetchChatRooms = (cursor?: ChatRoomCursor | null) =>
  request<{ rooms: ChatRoom[]; nextCursor: ChatRoomCursor | null }>(
    `/rooms${cursor ? "?" + new URLSearchParams({ beforeTime: cursor.time, beforeId: cursor.id }) : ""}`
  );
export const createDirectChat = (recipientId: number) =>
  request<{ roomId: string }>("/rooms", "POST", {
    kind: "direct",
    recipientId,
  });
export const createGroupChat = (title: string, memberIds: number[]) =>
  request<{ roomId: string }>("/rooms", "POST", {
    kind: "group",
    title,
    memberIds,
  });
export const fetchChatRoom = (id: string) =>
  request<{ room: ChatRoom; members: (ChatPerson & { state: string })[] }>(
    `/rooms/${id}`
  );
export const respondChatInvite = (id: string, accept: boolean) =>
  request(`/rooms/${id}/respond`, "POST", { accept });
export const leaveChatRoom = (id: string) =>
  request(`/rooms/${id}/leave`, "POST", {});
export const inviteChatPeople = (id: string, userIds: number[]) =>
  request(`/rooms/${id}/invite`, "POST", { userIds });
export const fetchChatChannels = (period: string) =>
  request<{ channels: ChatChannel[] }>(
    `/channels?${new URLSearchParams({ period })}`
  );
export const joinChatChannel = (input: ChatChannel) =>
  request<{ roomId: string }>("/channels/join", "POST", {
    category: input.category,
    boardKey: input.boardKey,
    period: input.period,
  });
export const fetchChatMessages = (
  id: string,
  params: { before?: number; after?: number } = {},
  signal?: AbortSignal
) =>
  request<{ messages: ChatMessage[]; hasMore: boolean }>(
    `/rooms/${id}/messages?${new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))}`,
    "GET",
    undefined,
    {},
    signal
  );
export function sendChatMessage(
  roomId: string,
  clientId: string,
  text: string,
  files: File[]
) {
  const data = new FormData();
  data.append("clientId", clientId);
  data.append("text", text);
  for (const file of files) data.append("files", file);
  return request<{ message: ChatMessage }>(
    `/rooms/${roomId}/messages`,
    "POST",
    data
  );
}
export async function fetchChatFile(id: string, signal?: AbortSignal) {
  const r = await fetch(`/api/chat/files/${id}`, {
    credentials: "include",
    cache: "no-store",
    headers: chatHeaders(),
    signal,
  });
  if (!r.ok)
    throw new ChatApiError(
      r.status,
      "ไม่มีสิทธิ์เปิดไฟล์ หรือโหลดไฟล์ไม่สำเร็จ"
    );
  return URL.createObjectURL(await r.blob());
}
export function mergeChatMessages(
  current: ChatMessage[],
  incoming: ChatMessage[]
) {
  return [
    ...new Map(
      [...current, ...incoming].map(message => [message.id, message])
    ).values(),
  ].sort((a, b) => a.id - b.id);
}
export type { ChatTarget };
export function mergeChatRooms(current: ChatRoom[], incoming: ChatRoom[]) {
  return [
    ...new Map([...current, ...incoming].map(room => [room.id, room])).values(),
  ].sort(
    (a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id)
  );
}
