import { CornerDownRight, Trash2 } from "lucide-react";
import type { PublicComment } from "../../../../shared/comments";
export interface ReplyTarget {
  id: number;
  rootId: number;
  authorName: string;
  text: string;
}
export default function CommentMessage({
  comment,
  rootId,
  authenticated,
  disabled,
  deleting,
  onReply,
  onDelete,
}: {
  comment: PublicComment;
  rootId: number;
  authenticated: boolean;
  disabled: boolean;
  deleting: number | null;
  onReply: (target: ReplyTarget) => void;
  onDelete: (comment: PublicComment) => void;
}) {
  return (
    <article
      className={`comment-item ${comment.parentId !== null ? "comment-item--reply" : ""}`}
    >
      <span className="comment-avatar" aria-hidden="true">
        {comment.deleted ? "—" : Array.from(comment.authorName)[0] || "ข"}
      </span>
      <div>
        <header>
          <strong>{comment.authorName}</strong>
          <time dateTime={comment.createdAt}>
            {new Date(comment.createdAt).toLocaleString("th-TH", {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </time>
        </header>
        {comment.deleted ? (
          <p className="comment-tombstone">
            ความคิดเห็นนี้ถูกลบแล้ว · คำตอบของผู้อื่นยังคงอยู่
          </p>
        ) : (
          <>
            {comment.replyToName ? (
              <span className="comment-reply-to">
                <CornerDownRight size={11} />
                ตอบกลับ {comment.replyToName}
              </span>
            ) : null}
            <p>{comment.text}</p>
            <div className="comment-actions">
              <button
                type="button"
                className="comment-reply-button"
                disabled={disabled}
                onClick={() =>
                  onReply({
                    id: comment.id,
                    rootId,
                    authorName: comment.authorName,
                    text: comment.text,
                  })
                }
                aria-label={`ตอบกลับความคิดเห็นของ ${comment.authorName}`}
              >
                <CornerDownRight size={12} />
                ตอบกลับ
              </button>
              {authenticated && comment.isMine ? (
                <button
                  type="button"
                  className="comment-delete"
                  disabled={disabled}
                  onClick={() => onDelete(comment)}
                >
                  <Trash2 size={12} />
                  {deleting === comment.id ? "กำลังลบ…" : "ลบความคิดเห็น"}
                </button>
              ) : null}
            </div>
          </>
        )}
      </div>
    </article>
  );
}
