import { useCallback, useEffect, useRef, useState } from "react";
import type { PublicComment } from "../../../../shared/comments";
import { fetchReplies, mergeComments } from "@/lib/comments";
import CommentMessage, { type ReplyTarget } from "./CommentMessage";
export default function CommentThread({
  mediaId,
  comment,
  authenticated,
  disabled,
  deleting,
  onReply,
  onDelete,
  refreshVersion,
  forceOpenId,
}: {
  mediaId: string;
  comment: PublicComment;
  authenticated: boolean;
  disabled: boolean;
  deleting: number | null;
  onReply: (target: ReplyTarget) => void;
  onDelete: (comment: PublicComment) => void;
  refreshVersion: number;
  forceOpenId: number | null;
}) {
  const [open, setOpen] = useState(false),
    [rows, setRows] = useState<PublicComment[]>([]),
    [total, setTotal] = useState(comment.replyCount),
    [cursor, setCursor] = useState<number | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const version = useRef(0),
    alive = useRef(true),
    busy = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      version.current++;
    };
  }, []);
  const load = useCallback(
    async (before: number | null = null) => {
      if (before && busy.current) return;
      busy.current = true;
      const request = ++version.current;
      setLoading(true);
      setError("");
      try {
        const page = await fetchReplies(mediaId, comment.id, before);
        if (!alive.current || request !== version.current) return;
        setRows(current =>
          before
            ? mergeComments(current, page.replies).sort((a, b) => a.id - b.id)
            : [...page.replies].sort((a, b) => a.id - b.id)
        );
        setTotal(page.total);
        setCursor(page.nextCursor);
      } catch (cause) {
        if (alive.current && request === version.current)
          setError(
            cause instanceof Error ? cause.message : "โหลดคำตอบไม่สำเร็จ"
          );
      } finally {
        if (request === version.current) {
          busy.current = false;
          if (alive.current) setLoading(false);
        }
      }
    },
    [mediaId, comment.id]
  );
  useEffect(() => {
    setTotal(comment.replyCount);
  }, [comment.replyCount]);
  useEffect(() => {
    if (forceOpenId === comment.id) setOpen(true);
  }, [forceOpenId, refreshVersion, comment.id]);
  useEffect(() => {
    if (open) void load();
  }, [open, load, refreshVersion, authenticated]);
  return (
    <div className="comment-thread">
      <CommentMessage
        comment={comment}
        rootId={comment.id}
        authenticated={authenticated}
        disabled={disabled || loading}
        deleting={deleting}
        onReply={onReply}
        onDelete={onDelete}
      />
      {total > 0 || open ? (
        <button
          type="button"
          className="comment-thread-toggle"
          disabled={loading || disabled}
          aria-expanded={open}
          aria-controls={`comment-replies-${comment.id}`}
          onClick={() => setOpen(current => !current)}
        >
          {open ? "ซ่อนคำตอบ" : `ดู ${total} คำตอบ`}
        </button>
      ) : null}
      {open ? (
        <section
          id={`comment-replies-${comment.id}`}
          className="comment-replies"
          aria-label={`คำตอบของ ${comment.authorName}`}
        >
          {rows.map(row => (
            <CommentMessage
              key={row.id}
              comment={row}
              rootId={comment.id}
              authenticated={authenticated}
              disabled={disabled || loading}
              deleting={deleting}
              onReply={onReply}
              onDelete={onDelete}
            />
          ))}
          {loading ? (
            <p role="status" className="comment-status">
              กำลังโหลดคำตอบ…
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="comment-error">
              {error}
              <button
                type="button"
                disabled={loading || disabled}
                onClick={() => void load()}
              >
                ลองอีกครั้ง
              </button>
            </p>
          ) : null}
          {!loading && !error && !rows.length ? (
            <p className="comment-status">ยังไม่มีคำตอบ</p>
          ) : null}
          {cursor ? (
            <button
              type="button"
              className="comment-load-more"
              disabled={loading || disabled}
              onClick={() => void load(cursor)}
            >
              โหลดคำตอบก่อนหน้า
            </button>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
