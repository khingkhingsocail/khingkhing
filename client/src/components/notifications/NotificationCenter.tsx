import { useEffect, useRef, useState } from "react";
import {
  Bell,
  CheckCheck,
  CircleAlert,
  CornerDownRight,
  LoaderCircle,
  MessageCircle,
  RefreshCw,
  X,
} from "lucide-react";
import type { PublicNotification } from "../../../../shared/notifications";
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  mergeNotificationItems,
  NotificationsApiError,
} from "../../lib/notifications";
import "./NotificationCenter.css";

export interface NotificationTarget {
  mediaId: string;
  rootId: number;
  commentId: number;
}

export interface NotificationCenterProps {
  authenticated: boolean;
  pending?: boolean;
  accountKey?: number;
  onOpen: (target: NotificationTarget) => void;
}

function errorMessage(error: unknown) {
  if (error instanceof NotificationsApiError && error.status === 401)
    return "เซสชันหมดอายุแล้ว กรุณาเข้าสู่ระบบใหม่ด้วยตนเอง";
  return error instanceof Error
    ? error.message
    : "โหลดการแจ้งเตือนไม่สำเร็จ กรุณาลองใหม่";
}

function dateLabel(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "เวลาไม่ระบุ";
  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function NotificationCenter({
  authenticated,
  pending = false,
  accountKey,
  onOpen,
}: NotificationCenterProps) {
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  const [items, setItems] = useState<PublicNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [watermark, setWatermark] = useState<number | null>(null);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [hasFetched, setHasFetched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busyItem, setBusyItem] = useState<number | null>(null);
  const [busyAll, setBusyAll] = useState(false);
  const [unauthorized, setUnauthorized] = useState(false);
  const [retryVersion, setRetryVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const accountKeyRef = useRef(accountKey);
  const hasFetchedRef = useRef(false);
  const reloadRef = useRef<(() => void) | null>(null);
  const aliveRef = useRef(true);
  const dataRevisionRef = useRef(0);
  const pageGenerationRef = useRef(0);
  const loadingMoreRef = useRef(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const returnFocusRef = useRef(true);
  const closePanel = () => {
    returnFocusRef.current = true;
    setOpen(false);
  };
  const closePanelRef = useRef(closePanel);
  closePanelRef.current = closePanel;

  if (accountKeyRef.current !== accountKey) accountKeyRef.current = accountKey;

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      dataRevisionRef.current++;
      pageGenerationRef.current++;
      reloadRef.current = null;
    };
  }, []);

  useEffect(() => {
    const updateVisibility = () =>
      setVisible(document.visibilityState === "visible");
    updateVisibility();
    document.addEventListener("visibilitychange", updateVisibility);
    return () =>
      document.removeEventListener("visibilitychange", updateVisibility);
  }, []);

  useEffect(() => {
    dataRevisionRef.current++;
    pageGenerationRef.current++;
    loadingMoreRef.current = false;
    hasFetchedRef.current = false;
    setItems([]);
    setUnread(0);
    setWatermark(null);
    setNextCursor(null);
    setHasFetched(false);
    setError(null);
    setUnauthorized(false);
    setLoading(false);
    setLoadingMore(false);
    setBusyItem(null);
    setBusyAll(false);
  }, [accountKey]);

  useEffect(() => {
    if (!authenticated || pending) {
      dataRevisionRef.current++;
      pageGenerationRef.current++;
      loadingMoreRef.current = false;
      hasFetchedRef.current = false;
      setItems([]);
      setUnread(0);
      setWatermark(null);
      setNextCursor(null);
      setHasFetched(false);
      setError(null);
      setUnauthorized(false);
      setLoading(false);
      setLoadingMore(false);
      setBusyItem(null);
      setBusyAll(false);
    }
  }, [authenticated, pending]);

  useEffect(() => {
    if (!authenticated || pending || !visible || unauthorized) return;
    let active = true;
    let inFlight = false;
    let queuedRefresh = false;
    let controller: AbortController | null = null;

    const refreshFirstPage = async (force = false) => {
      if (!active || !aliveRef.current || accountKeyRef.current !== accountKey)
        return;
      if (inFlight) {
        if (force) queuedRefresh = true;
        return;
      }
      inFlight = true;
      controller = new AbortController();
      const requestedRevision = dataRevisionRef.current;
      const requestedGeneration = pageGenerationRef.current;
      if (!hasFetchedRef.current) setLoading(true);
      try {
        const page = await fetchNotifications(null, controller.signal);
        if (
          !active ||
          !aliveRef.current ||
          accountKeyRef.current !== accountKey ||
          requestedRevision !== dataRevisionRef.current ||
          requestedGeneration !== pageGenerationRef.current
        )
          return;
        pageGenerationRef.current++;
        setItems(page.items);
        setUnread(page.unread);
        setWatermark(page.watermark);
        setNextCursor(page.nextCursor);
        setHasFetched(true);
        hasFetchedRef.current = true;
        setError(null);
      } catch (cause) {
        if (!active || controller.signal.aborted) return;
        if (
          !aliveRef.current ||
          accountKeyRef.current !== accountKey ||
          requestedRevision !== dataRevisionRef.current ||
          requestedGeneration !== pageGenerationRef.current
        )
          return;
        if (cause instanceof NotificationsApiError && cause.status === 401) {
          dataRevisionRef.current++;
          pageGenerationRef.current++;
          setItems([]);
          setUnread(0);
          setWatermark(null);
          setNextCursor(null);
          setHasFetched(false);
          hasFetchedRef.current = false;
          setUnauthorized(true);
        }
        setError(errorMessage(cause));
      } finally {
        if (active) {
          inFlight = false;
          controller = null;
          setLoading(false);
          if (queuedRefresh) {
            queuedRefresh = false;
            void refreshFirstPage(true);
          }
        }
      }
    };

    reloadRef.current = () => void refreshFirstPage(true);
    void refreshFirstPage();
    const interval = window.setInterval(() => void refreshFirstPage(), 15_000);
    return () => {
      active = false;
      window.clearInterval(interval);
      controller?.abort();
      reloadRef.current = null;
    };
  }, [authenticated, pending, visible, unauthorized, retryVersion, accountKey]);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closePanelRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),a[href],input:not(:disabled),[tabindex="0"]'
        ) ?? []
      ).filter(element => element.getClientRects().length > 0);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first) return;
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          !panelRef.current?.contains(document.activeElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !panelRef.current?.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (returnFocusRef.current && previouslyFocused?.isConnected)
        previouslyFocused.focus({ preventScroll: true });
      returnFocusRef.current = true;
    };
  }, [open]);

  const accountIsCurrent = (key: number | undefined) =>
    aliveRef.current && accountKeyRef.current === key;

  const expireSession = () => {
    dataRevisionRef.current++;
    pageGenerationRef.current++;
    hasFetchedRef.current = false;
    setItems([]);
    setUnread(0);
    setWatermark(null);
    setNextCursor(null);
    setHasFetched(false);
    setUnauthorized(true);
  };

  const loadMore = async () => {
    if (
      nextCursor === null ||
      loadingMoreRef.current ||
      !authenticated ||
      pending
    )
      return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setError(null);
    const accountAtStart = accountKey;
    const requestGeneration = pageGenerationRef.current;
    const requestRevision = dataRevisionRef.current;
    try {
      const page = await fetchNotifications(nextCursor);
      if (
        !accountIsCurrent(accountAtStart) ||
        requestGeneration !== pageGenerationRef.current ||
        requestRevision !== dataRevisionRef.current
      )
        return;
      pageGenerationRef.current++;
      setItems(current => mergeNotificationItems(current, page.items));
      setUnread(page.unread);
      setWatermark(page.watermark);
      setNextCursor(page.nextCursor);
    } catch (cause) {
      if (!accountIsCurrent(accountAtStart)) return;
      if (cause instanceof NotificationsApiError && cause.status === 401)
        expireSession();
      setError(errorMessage(cause));
    } finally {
      if (accountIsCurrent(accountAtStart)) setLoadingMore(false);
      loadingMoreRef.current = false;
    }
  };

  const openNotification = async (item: PublicNotification) => {
    if (!authenticated || pending || busyItem !== null) return;
    setBusyItem(item.id);
    setError(null);
    const accountAtStart = accountKey;
    try {
      const result = await markNotificationRead(item.id);
      if (!accountIsCurrent(accountAtStart)) return;
      dataRevisionRef.current++;
      pageGenerationRef.current++;
      setItems(current =>
        current.map(row =>
          row.id === item.id
            ? { ...row, readAt: result.readAt || new Date().toISOString() }
            : row
        )
      );
      if (item.readAt === null) setUnread(count => Math.max(0, count - 1));
      returnFocusRef.current = false;
      setOpen(false);
      reloadRef.current?.();
      onOpen({
        mediaId: item.mediaId,
        rootId: item.rootId,
        commentId: item.commentId,
      });
    } catch (cause) {
      if (!accountIsCurrent(accountAtStart)) return;
      if (cause instanceof NotificationsApiError && cause.status === 401)
        expireSession();
      setError(errorMessage(cause));
    } finally {
      if (accountIsCurrent(accountAtStart)) setBusyItem(null);
    }
  };

  const readAll = async () => {
    if (
      watermark === null ||
      unread === 0 ||
      busyAll ||
      !authenticated ||
      pending
    )
      return;
    setBusyAll(true);
    setError(null);
    const accountAtStart = accountKey;
    const throughId = watermark;
    try {
      await markAllNotificationsRead(throughId);
      if (!accountIsCurrent(accountAtStart)) return;
      dataRevisionRef.current++;
      pageGenerationRef.current++;
      const changedAt = new Date().toISOString();
      setItems(current =>
        current.map(item =>
          item.id <= throughId && item.readAt === null
            ? { ...item, readAt: changedAt }
            : item
        )
      );
      reloadRef.current?.();
    } catch (cause) {
      if (!accountIsCurrent(accountAtStart)) return;
      if (cause instanceof NotificationsApiError && cause.status === 401)
        expireSession();
      setError(errorMessage(cause));
    } finally {
      if (accountIsCurrent(accountAtStart)) setBusyAll(false);
    }
  };

  const retry = () => {
    setError(null);
    setUnauthorized(false);
    setRetryVersion(version => version + 1);
  };

  return (
    <div className="notification-center manus-no-record">
      <button
        ref={triggerRef}
        type="button"
        className="notification-center__trigger"
        aria-label={
          hasFetched && unread > 0
            ? `การแจ้งเตือน มี ${unread} รายการที่ยังไม่อ่าน`
            : "การแจ้งเตือน"
        }
        aria-expanded={open}
        aria-controls="notification-center-panel"
        onClick={() => {
          if (open) closePanel();
          else {
            returnFocusRef.current = true;
            setOpen(true);
          }
        }}
      >
        <Bell aria-hidden="true" />
        {hasFetched && unread > 0 ? (
          <span className="notification-center__badge" aria-hidden="true">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <>
          <button
            type="button"
            className="notification-center__backdrop"
            aria-label="ปิดการแจ้งเตือน"
            onClick={closePanel}
          />
          <section
            ref={panelRef}
            id="notification-center-panel"
            className="notification-center__panel manus-no-record"
            role="dialog"
            aria-modal="true"
            aria-labelledby="notification-center-title"
          >
            <header className="notification-center__header">
              <div className="notification-center__heading">
                <p className="notification-center__eyebrow">
                  KHING KHING / INBOX
                </p>
                <h2 id="notification-center-title">การแจ้งเตือน</h2>
                {authenticated && !pending && hasFetched ? (
                  <span className="notification-center__unread">
                    ยังไม่อ่าน <strong>{unread}</strong>
                  </span>
                ) : null}
              </div>
              <div className="notification-center__header-actions">
                {authenticated && !pending ? (
                  <button
                    type="button"
                    className="notification-center__read-all"
                    onClick={() => void readAll()}
                    disabled={unread === 0 || watermark === null || busyAll}
                    aria-label="ทำเครื่องหมายว่าอ่านทั้งหมดจนถึงรายการที่โหลดแล้ว"
                  >
                    {busyAll ? (
                      <LoaderCircle
                        aria-hidden="true"
                        className="animate-spin"
                      />
                    ) : (
                      <CheckCheck aria-hidden="true" />
                    )}
                    <span>อ่านทั้งหมด</span>
                  </button>
                ) : null}
                <button
                  ref={closeButtonRef}
                  type="button"
                  className="notification-center__close"
                  aria-label="ปิดแผงการแจ้งเตือน"
                  onClick={closePanel}
                >
                  <X aria-hidden="true" />
                </button>
              </div>
            </header>

            <p className="notification-center__privacy">
              ตรวจทุก 15 วินาทีขณะเปิดแอป
              การรีเฟรชกลับหน้าแรกเพื่อซ่อนรายการที่ถูกลบ
            </p>

            {!authenticated ? (
              <div className="notification-center__state">
                <Bell aria-hidden="true" />
                <strong>เข้าสู่ระบบเพื่อดูการแจ้งเตือน</strong>
                <p>เข้าสู่ระบบด้วยตนเองเพื่อเปิดกล่องข้อความส่วนตัว</p>
              </div>
            ) : pending ? (
              <div className="notification-center__state" role="status">
                <LoaderCircle aria-hidden="true" />
                <strong>กำลังตรวจสอบบัญชี</strong>
              </div>
            ) : error && items.length === 0 ? (
              <div
                className="notification-center__state notification-center__state--error"
                role="alert"
              >
                <CircleAlert aria-hidden="true" />
                <strong>ยังโหลดการแจ้งเตือนไม่ได้</strong>
                <p>{error}</p>
                <button
                  type="button"
                  className="notification-center__retry"
                  onClick={retry}
                >
                  <RefreshCw aria-hidden="true" /> ลองอีกครั้ง
                </button>
              </div>
            ) : loading && !hasFetched ? (
              <div className="notification-center__state" role="status">
                <LoaderCircle aria-hidden="true" className="animate-spin" />
                <strong>กำลังโหลดการแจ้งเตือน</strong>
              </div>
            ) : hasFetched && items.length === 0 ? (
              <div className="notification-center__state">
                <MessageCircle aria-hidden="true" />
                <strong>ยังไม่มีการแจ้งเตือน</strong>
                <p>
                  เมื่อมีคนแสดงความคิดเห็นหรือโต้ตอบกับโพสต์ รายการจะแสดงที่นี่
                </p>
              </div>
            ) : (
              <div className="notification-center__list" aria-live="polite">
                {items.map(item => {
                  const isReply = item.kind === "reply";
                  const waiting = busyItem === item.id;
                  return (
                    <button
                      type="button"
                      key={item.id}
                      className={`notification-center__item${item.readAt ? " is-read" : ""}`}
                      onClick={() => void openNotification(item)}
                      disabled={busyItem !== null}
                      aria-label={`${item.actorName} ${isReply ? "ตอบกลับความคิดเห็น" : "แสดงความคิดเห็น"}: ${item.text} — ${item.mediaTitle}${item.readAt ? "" : ", ยังไม่อ่าน"}`}
                    >
                      <span
                        className="notification-center__avatar"
                        aria-hidden="true"
                      >
                        {waiting ? (
                          <LoaderCircle className="animate-spin" />
                        ) : isReply ? (
                          <CornerDownRight />
                        ) : (
                          <MessageCircle />
                        )}
                      </span>
                      <span className="notification-center__content">
                        <span className="notification-center__title">
                          {item.actorName}{" "}
                          {isReply ? "ตอบกลับความคิดเห็น" : "แสดงความคิดเห็น"}
                        </span>
                        <span className="notification-center__copy">
                          {item.text}
                        </span>
                        <span className="notification-center__media">
                          ใน {item.mediaTitle}
                        </span>
                        <time
                          className="notification-center__time"
                          dateTime={item.createdAt}
                        >
                          {dateLabel(item.createdAt)}
                        </time>
                      </span>
                      {item.readAt === null ? (
                        <span
                          className="notification-center__dot"
                          aria-hidden="true"
                        />
                      ) : (
                        <span className="notification-center__sr-only">
                          อ่านแล้ว
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {error && items.length > 0 ? (
              <div
                className="notification-center__state notification-center__state--error"
                role="alert"
              >
                <p>{error}</p>
                <button
                  type="button"
                  className="notification-center__retry"
                  onClick={retry}
                >
                  <RefreshCw aria-hidden="true" /> ลองอีกครั้ง
                </button>
              </div>
            ) : null}
            {authenticated && !pending && nextCursor !== null ? (
              <footer className="notification-center__footer">
                <button
                  type="button"
                  className="notification-center__more"
                  onClick={() => void loadMore()}
                  disabled={loadingMore}
                >
                  {loadingMore ? (
                    <LoaderCircle aria-hidden="true" className="animate-spin" />
                  ) : null}
                  {loadingMore ? "กำลังโหลด" : "โหลดรายการก่อนหน้า"}
                </button>
              </footer>
            ) : null}
          </section>
        </>
      ) : null}
    </div>
  );
}
