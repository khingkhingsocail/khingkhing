import { useCallback, useEffect, useRef, useState } from "react";
import { MessageCircle, RefreshCw, Send, X } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { openLoginPage } from "@/const";
import {
  CommentsApiError,
  deleteComment,
  fetchComments,
  fetchCommentRoot,
  mergeComments,
  postComment,
} from "@/lib/comments";
import {
  MAX_COMMENT_LENGTH,
  type PublicComment,
} from "../../../../shared/comments";
import "./comments.css";
import CommentThread from "./CommentThread";
import type { ReplyTarget } from "./CommentMessage";
export interface CommentsPost {
  id: string;
  title: string;
  caption: string;
  visibility: "public" | "demo" | "private";
  publicMediaId?: string;
}
export default function CommentsPanel({
  post,
  onClose,
  onCount,
  initialRootId,
}: {
  post: CommentsPost;
  onClose: () => void;
  onCount?: (total: number) => void;
  initialRootId?: number;
}) {
  const sectionRef = useRef<HTMLElement>(null),
    closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const focus =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null,
      overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        sectionRef.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),a[href],textarea:not(:disabled),input:not(:disabled),[tabindex="0"]'
        ) ?? []
      ).filter(el => el.getClientRects().length > 0);
      const first = focusable[0],
        last = focusable[focusable.length - 1];
      if (!first) return;
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          !sectionRef.current?.contains(document.activeElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !sectionRef.current?.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = overflow;
      focus?.focus({ preventScroll: true });
    };
  }, []);
  return (
    <div
      className="comments-overlay"
      role="presentation"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={sectionRef}
        className="comments-panel manus-no-record"
        id="comments-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="comments-panel-title"
        aria-describedby="comments-panel-description"
      >
        <header className="comments-panel__header">
          <div>
            <p className="comments-panel__eyebrow">COMMUNITY · COMMENTS</p>
            <h2 id="comments-panel-title">
              ความคิดเห็น <span>Comments</span>
            </h2>
          </div>
          <button
            ref={closeRef}
            className="comments-panel__close"
            type="button"
            onClick={onClose}
            aria-label="ปิดแผงความคิดเห็น"
          >
            <X size={19} />
          </button>
        </header>
        <div className="comments-panel__post">
          <span>
            {post.visibility === "public" ? "โพสต์สาธารณะ" : "โพสต์ตัวอย่าง"}
          </span>
          <strong>{post.title}</strong>
          <p>{post.caption}</p>
        </div>
        {post.visibility === "public" && post.publicMediaId ? (
          <PublicComments
            key={post.publicMediaId}
            mediaId={post.publicMediaId}
            onCount={onCount}
            initialRootId={initialRootId}
          />
        ) : (
          <div className="comments-panel__empty" role="status">
            <MessageCircle size={24} />
            <strong>ความคิดเห็นเปิดเฉพาะโพสต์สาธารณะ</strong>
            <p id="comments-panel-description">
              โพสต์ตัวอย่างและไฟล์ส่วนตัวไม่บันทึกความคิดเห็น
              เลือกรูปหรือวิดีโอจากผู้เข้าชมในฟีดเพื่อพูดคุย
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
function PublicComments({
  mediaId,
  onCount,
  initialRootId,
}: {
  mediaId: string;
  onCount?: (total: number) => void;
  initialRootId?: number;
}) {
  const auth = useAuth();
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);
  const [threadVersion, setThreadVersion] = useState(0);
  const [forceOpenId, setForceOpenId] = useState<number | null>(
    initialRootId ?? null
  );
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [comments, setComments] = useState<PublicComment[]>([]),
    [total, setTotal] = useState<number | null>(null),
    [cursor, setCursor] = useState<number | null>(null);
  const [loading, setLoading] = useState(true),
    [more, setMore] = useState(false),
    [sending, setSending] = useState(false),
    [deleting, setDeleting] = useState<number | null>(null);
  const [error, setError] = useState(""),
    [sendError, setSendError] = useState(""),
    [draft, setDraft] = useState(""),
    [sent, setSent] = useState(""),
    [blocked, setBlocked] = useState(false),
    [needsLogin, setNeedsLogin] = useState(false);
  const alive = useRef(true),
    requestVersion = useRef(0),
    uuid = useRef<string | null>(null),
    busy = useRef(false);
  const countRef = useRef(onCount);
  countRef.current = onCount;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      requestVersion.current++;
    };
  }, []);
  const load = useCallback(
    async (preserve = false, rootId?: number) => {
      const version = ++requestVersion.current;
      setLoading(true);
      setError("");
      try {
        const page = await fetchComments(mediaId);
        const root = rootId
          ? await fetchCommentRoot(mediaId, rootId)
              .then(r => r.comment)
              .catch(cause => {
                if (cause instanceof CommentsApiError && cause.status === 404)
                  return null;
                throw cause;
              })
          : null;
        if (!alive.current || version !== requestVersion.current) return;
        setComments(current =>
          preserve
            ? mergeComments(current, [
                ...page.comments,
                ...(root ? [root] : []),
              ])
            : [
                ...page.comments,
                ...(root && !page.comments.some(c => c.id === root.id)
                  ? [root]
                  : []),
              ]
        );
        setCursor(current => (preserve ? current : page.nextCursor));
        setTotal(page.total);
        countRef.current?.(page.total);
        setBlocked(false);
        setThreadVersion(current => current + 1);
      } catch (cause) {
        if (alive.current && version === requestVersion.current) {
          setError(
            cause instanceof Error ? cause.message : "เปิดความคิดเห็นไม่สำเร็จ"
          );
          if (cause instanceof CommentsApiError && cause.status === 404)
            setBlocked(true);
        }
      } finally {
        if (alive.current && version === requestVersion.current)
          setLoading(false);
      }
    },
    [mediaId]
  );
  useEffect(() => {
    if (initialRootId) setForceOpenId(initialRootId);
    void load(false, initialRootId);
  }, [load, auth.user?.id, initialRootId]);
  async function older() {
    if (!cursor || more || loading || sending || busy.current) return;
    const version = requestVersion.current;
    setMore(true);
    setError("");
    try {
      const page = await fetchComments(mediaId, cursor);
      if (!alive.current || version !== requestVersion.current) return;
      setComments(current => mergeComments(current, page.comments));
      setCursor(page.nextCursor);
      setTotal(page.total);
      countRef.current?.(page.total);
    } catch (cause) {
      if (alive.current)
        setError(
          cause instanceof Error ? cause.message : "โหลดความคิดเห็นไม่สำเร็จ"
        );
    } finally {
      if (alive.current) setMore(false);
    }
  }
  async function send() {
    if (
      busy.current ||
      blocked ||
      !auth.isAuthenticated ||
      auth.loading ||
      needsLogin ||
      !draft.trim()
    )
      return;
    busy.current = true;
    setSending(true);
    setSendError("");
    setSent("");
    try {
      uuid.current ??= crypto.randomUUID();
      await postComment(mediaId, draft, uuid.current, replyTarget?.id ?? null);
      if (!alive.current) return;
      setDraft("");
      uuid.current = null;
      setSent(replyTarget ? "ส่งคำตอบแล้ว" : "ส่งความคิดเห็นแล้ว");
      if (replyTarget) {
        setForceOpenId(replyTarget.rootId);
        setThreadVersion(current => current + 1);
      }
      setReplyTarget(null);
      await load(Boolean(replyTarget), replyTarget?.rootId);
    } catch (cause) {
      if (alive.current) {
        setSendError(
          cause instanceof Error
            ? cause.message
            : "ส่งความคิดเห็นไม่สำเร็จ กรุณาลองใหม่"
        );
        if (cause instanceof CommentsApiError && cause.status === 401) {
          setNeedsLogin(true);
          const refreshed = await auth.refresh();
          if (alive.current && refreshed.data && !refreshed.error)
            setNeedsLogin(false);
        }
        if (cause instanceof CommentsApiError && cause.status === 404) {
          setReplyTarget(null);
          uuid.current = null;
          await load();
        }
      }
    } finally {
      busy.current = false;
      if (alive.current) setSending(false);
    }
  }
  async function remove(comment: PublicComment) {
    if (
      busy.current ||
      loading ||
      more ||
      !window.confirm("ลบความคิดเห็นนี้ของคุณหรือไม่?")
    )
      return;
    busy.current = true;
    setDeleting(comment.id);
    setSendError("");
    try {
      await deleteComment(mediaId, comment.id);
      if (alive.current) {
        setComments(current => current.filter(row => row.id !== comment.id));
        if (replyTarget?.id === comment.id) {
          setReplyTarget(null);
          uuid.current = null;
        }
        setThreadVersion(current => current + 1);
        await load(
          true,
          comment.parentId ?? (comment.replyCount > 0 ? comment.id : undefined)
        );
      }
    } catch (cause) {
      if (alive.current)
        setSendError(
          cause instanceof Error ? cause.message : "ลบความคิดเห็นไม่สำเร็จ"
        );
    } finally {
      busy.current = false;
      if (alive.current) setDeleting(null);
    }
  }
  const length = Array.from(draft.trim()).length;
  return (
    <>
      <p id="comments-panel-description" className="comment-public-note">
        ความคิดเห็นเป็นสาธารณะ · พูดคุยอย่างให้เกียรติ ไม่ส่งข้อมูลส่วนตัว
      </p>
      <div className="comment-list-toolbar">
        <span>
          {total === null
            ? "ความคิดเห็น"
            : `${total.toLocaleString("th-TH")} ความคิดเห็น`}
        </span>
        <button
          type="button"
          disabled={loading || more || sending || deleting !== null}
          onClick={() => void load(false, initialRootId)}
          aria-label="รีเฟรชความคิดเห็น"
        >
          <RefreshCw size={14} />
          {loading ? "กำลังโหลด…" : "รีเฟรช"}
        </button>
      </div>
      <div className="comment-list">
        {error ? (
          <p className="comment-error" role="alert">
            {error}
          </p>
        ) : null}
        {loading && comments.length === 0 ? (
          <p className="comment-status" role="status">
            กำลังโหลดความคิดเห็น…
          </p>
        ) : null}
        {!loading && !error && comments.length === 0 ? (
          <div className="comments-panel__empty" role="status">
            <span className="comments-panel__empty-icon">
              <MessageCircle size={24} />
            </span>
            <strong>ยังไม่มีความคิดเห็น</strong>
            <p>มาเป็นคนแรกที่พูดคุยกับโพสต์นี้</p>
          </div>
        ) : null}
        {comments.map(comment => (
          <CommentThread
            key={comment.id}
            mediaId={mediaId}
            comment={comment}
            authenticated={auth.isAuthenticated}
            disabled={loading || more || sending || deleting !== null}
            deleting={deleting}
            onDelete={row => void remove(row)}
            onReply={target => {
              if (!auth.isAuthenticated || needsLogin) {
                openLoginPage();
                return;
              }
              setReplyTarget(target);
              uuid.current = null;
              setSendError("");
              setSent("");
              textareaRef.current?.focus();
            }}
            refreshVersion={threadVersion}
            forceOpenId={forceOpenId}
          />
        ))}
        {cursor ? (
          <button
            type="button"
            className="comment-load-more"
            disabled={loading || more || sending || deleting !== null}
            onClick={() => void older()}
          >
            {more ? "กำลังโหลด…" : "โหลดความคิดเห็นก่อนหน้า"}
          </button>
        ) : null}
      </div>
      {sendError ? (
        <p className="comment-error" role="alert">
          {sendError}
        </p>
      ) : null}
      {sent ? (
        <p className="comment-status" role="status">
          {sent}
        </p>
      ) : null}
      {auth.loading ? (
        <p className="comment-status" role="status">
          กำลังตรวจสอบบัญชี…
        </p>
      ) : !auth.isAuthenticated || needsLogin ? (
        <div className="comment-login">
          <p>เข้าสู่ระบบเพื่อเพิ่มความคิดเห็นจากบัญชีของคุณ</p>
          <button type="button" onClick={() => openLoginPage()}>
            เข้าสู่ระบบขิงขิง
          </button>
        </div>
      ) : (
        <form
          className="comment-composer"
          onSubmit={event => {
            event.preventDefault();
            void send();
          }}
        >
          {replyTarget ? (
            <div className="comment-reply-banner">
              <div>
                <strong>กำลังตอบกลับ {replyTarget.authorName}</strong>
                <p>{replyTarget.text}</p>
              </div>
              <button
                type="button"
                disabled={sending}
                onClick={() => {
                  setReplyTarget(null);
                  uuid.current = null;
                  textareaRef.current?.focus();
                }}
                aria-label="ยกเลิกการตอบกลับ"
              >
                <X size={14} />
              </button>
            </div>
          ) : null}
          <label htmlFor="comment-text">
            {replyTarget ? "พิมพ์คำตอบ" : "เพิ่มความคิดเห็น"}
          </label>
          <textarea
            ref={textareaRef}
            id="comment-text"
            value={draft}
            disabled={sending || blocked}
            placeholder="บอกความรู้สึกของคุณ…"
            rows={2}
            onChange={event => {
              setDraft(event.target.value);
              uuid.current = null;
              setSendError("");
              setSent("");
            }}
            aria-describedby="comment-length"
          />
          <div>
            <span
              id="comment-length"
              className={length > MAX_COMMENT_LENGTH ? "comment-error" : ""}
            >
              {length}/{MAX_COMMENT_LENGTH} · แสดงต่อสาธารณะ
            </span>
            <button
              type="submit"
              disabled={
                sending ||
                deleting !== null ||
                loading ||
                more ||
                blocked ||
                !length ||
                length > MAX_COMMENT_LENGTH
              }
            >
              <Send size={14} />
              {sending
                ? "กำลังส่ง…"
                : replyTarget
                  ? "ส่งคำตอบ"
                  : "ส่งความคิดเห็น"}
            </button>
          </div>
        </form>
      )}
    </>
  );
}
