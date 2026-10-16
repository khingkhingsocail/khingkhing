import type {
  CommentPage,
  PublicComment,
  ReplyPage,
} from "../../../shared/comments";
import { previewSessionToken } from "./sessionToken";
export class CommentsApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}
async function request<T>(path: string, init: RequestInit = {}) {
  const token = previewSessionToken();
  const response = await fetch(`/api/comments/${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "X-Khing-Comments": "1",
      ...init.headers,
    },
  });
  if (response.status === 204) return undefined as T;
  const body = await response
    .json()
    .catch(() => ({ error: "ระบบความคิดเห็นไม่พร้อม กรุณาลองใหม่" }));
  if (!response.ok)
    throw new CommentsApiError(
      response.status,
      body.error ?? "ความคิดเห็นไม่สำเร็จ"
    );
  return body as T;
}
export function fetchComments(
  mediaId: string,
  before?: number | null,
  signal?: AbortSignal
) {
  return request<CommentPage>(
    `${mediaId}${before ? `?before=${before}` : ""}`,
    { signal }
  );
}
export function postComment(
  mediaId: string,
  text: string,
  clientId: string,
  replyToId: number | null = null
) {
  return request<{ comment: PublicComment }>(mediaId, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, clientId, replyToId }),
  });
}
export function fetchReplies(
  mediaId: string,
  rootId: number,
  before?: number | null
) {
  return request<ReplyPage>(
    `${mediaId}/${rootId}/replies${before ? `?before=${before}` : ""}`
  );
}
export function deleteComment(mediaId: string, id: number) {
  return request<void>(`${mediaId}/${id}`, { method: "DELETE" });
}
export function mergeComments(
  current: PublicComment[],
  incoming: PublicComment[]
) {
  return [
    ...new Map(
      [...current, ...incoming].map(comment => [comment.id, comment])
    ).values(),
  ]
    .filter(
      comment =>
        !(
          comment.deleted &&
          comment.parentId === null &&
          comment.replyCount === 0
        )
    )
    .sort((a, b) => b.id - a.id);
}

export function fetchCommentRoot(mediaId: string, rootId: number) {
  return request<{ comment: PublicComment }>(`${mediaId}/${rootId}`);
}
