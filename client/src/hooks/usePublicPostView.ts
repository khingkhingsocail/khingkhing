import { useCallback, useEffect, useRef, useState } from "react";
import { MEDIA_VIEW_SECONDS } from "../../../shared/mediaViews";
import { MediaViewSession } from "../lib/mediaViews";

export function usePublicPostView(
  id: string | undefined,
  eligible: boolean,
  session: MediaViewSession,
  onCount: (count: number) => void
) {
  const [pageVisible, setPageVisible] = useState(
    () =>
      typeof document !== "undefined" && document.visibilityState === "visible"
  );
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const callbackRef = useRef(onCount);
  callbackRef.current = onCount;
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    const change = () => setPageVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", change);
    return () => {
      mountedRef.current = false;
      document.removeEventListener("visibilitychange", change);
    };
  }, []);
  const submit = useCallback(async () => {
    if (!id) return;
    setBusy(true);
    setError(false);
    try {
      const result = await session.record(id);
      callbackRef.current(result.viewCount);
    } catch {
      if (mountedRef.current) setError(true);
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }, [id, session]);
  useEffect(() => {
    if (!id || !eligible || !pageVisible || session.hasRecorded(id)) return;
    const timer = window.setTimeout(() => {
      // Visibility can change before React renders the visibility event.
      if (document.visibilityState === "visible") void submit();
    }, MEDIA_VIEW_SECONDS * 1000);
    return () => window.clearTimeout(timer);
  }, [id, eligible, pageVisible, session, submit]);
  return { error, busy, retry: submit };
}
