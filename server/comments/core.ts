import type { PublicComment } from "../../shared/comments";
export class CommentError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}
export function replyRoot(
  mediaId: string,
  target:
    | {
        id: number;
        mediaId: string;
        parentId: number | null;
        deletedAt: Date | null;
      }
    | undefined,
  root?: { id: number; mediaId: string; parentId: number | null }
) {
  if (!target || target.mediaId !== mediaId || target.deletedAt)
    throw new CommentError(
      404,
      "ความคิดเห็นที่ต้องการตอบถูกลบหรือไม่อยู่ในโพสต์นี้"
    );
  if (
    target.parentId !== null &&
    (!root ||
      root.id !== target.parentId ||
      root.mediaId !== mediaId ||
      root.parentId !== null)
  )
    throw new CommentError(404, "ไม่พบเธรดความคิดเห็นนี้");
  return target.parentId ?? target.id;
}
export function projectComment(
  row: {
    id: number;
    mediaId: string;
    authorId: number;
    authorName: string;
    text: string;
    createdAt: Date;
    parentId?: number | null;
    replyToName?: string | null;
    deletedAt?: Date | null;
  },
  viewerId?: number,
  replyCount = 0
): PublicComment {
  const deleted = Boolean(row.deletedAt);
  return {
    id: row.id,
    mediaId: row.mediaId,
    isMine: !deleted && row.authorId === viewerId,
    authorName: deleted ? "ความคิดเห็นถูกลบ" : row.authorName,
    text: deleted ? "" : row.text,
    createdAt: row.createdAt.toISOString(),
    parentId: row.parentId ?? null,
    replyToName: deleted ? null : (row.replyToName ?? null),
    deleted,
    replyCount,
  };
}
