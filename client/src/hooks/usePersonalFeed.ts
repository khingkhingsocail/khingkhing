import { useEffect, useRef, useState } from "react";
import type { PublicMediaSummary } from "@shared/publicMedia";
import {
  applyFeedSignal,
  emptyFeedPreferences,
  isFeedPreferences,
  type FeedAction,
  type FeedPreferences,
  type FeedSignal,
} from "@shared/feedPersonalization";
import { previewSessionToken } from "@/lib/sessionToken";

const GUEST_KEY = "khingkhing.feed.guest-preferences.v1";
export async function personalFeedRequest(
  path: string,
  token: string | null,
  signal?: FeedSignal
): Promise<FeedPreferences> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`/api/feed-personalization/${path}`, {
      method: signal ? "POST" : "GET",
      credentials: "include",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "X-Khing-Feed": "1",
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(signal ? { "Content-Type": "application/json" } : {}),
      },
      ...(signal ? { body: JSON.stringify(signal) } : {}),
    });
    const payload: unknown = await response.json();
    if (!response.ok)
      throw new Error(
        response.status === 401
          ? "เข้าสู่ระบบใหม่เพื่อซิงค์ความชอบ"
          : "ซิงค์ความชอบไม่สำเร็จ ลองใหม่"
      );
    const preferences = (payload as { preferences?: unknown })?.preferences;
    if (!isFeedPreferences(preferences))
      throw new Error("ข้อมูลความชอบไม่ถูกต้อง");
    return preferences;
  } finally {
    clearTimeout(timeout);
  }
}

type Pending = { item: PublicMediaSummary; signal: FeedSignal };
export function usePersonalFeed(
  userId: number | null = null,
  authLoading = false
) {
  const identity = userId ? `account-${userId}` : "guest";
  const identityRef = useRef(identity);
  const epochRef = useRef(0);
  if (identityRef.current !== identity) {
    identityRef.current = identity;
    epochRef.current += 1;
  }
  const [preferences, setPreferences] =
    useState<FeedPreferences>(emptyFeedPreferences);
  const [ready, setReady] = useState(!userId && !authLoading);
  const [loadedIdentity, setLoadedIdentity] = useState(identity);
  const [enabled, setEnabledState] = useState(true);
  const [status, setStatus] = useState(
    userId ? "กำลังโหลดความชอบบัญชี" : "ความชอบเฉพาะเบราว์เซอร์นี้"
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const preferencesRef = useRef(preferences);
  const queueRef = useRef<Pending[]>([]);
  const processingRef = useRef(false);
  const tokenRef = useRef<string | null>(null);
  const enabledRef = useRef(enabled);

  useEffect(() => {
    if (authLoading) {
      setReady(false);
      return;
    }
    const epoch = ++epochRef.current;
    let active = true;
    queueRef.current = [];
    processingRef.current = false;
    setLoadedIdentity(identity);
    setError("");
    setBusy(false);
    tokenRef.current = previewSessionToken();
    const defaults = emptyFeedPreferences();
    preferencesRef.current = defaults;
    setPreferences(defaults);
    let on = true;
    try {
      on =
        localStorage.getItem(`khingkhing.feed.enabled.${identity}`) !== "false";
    } catch {
      /* Optional setting */
    }
    enabledRef.current = on;
    setEnabledState(on);
    const current = () => active && epoch === epochRef.current;
    if (!userId) {
      let p = defaults;
      try {
        const parsed: unknown = JSON.parse(
          localStorage.getItem(GUEST_KEY) ?? "null"
        );
        if (isFeedPreferences(parsed)) p = parsed;
      } catch {
        /* Keep in-memory preferences */
      }
      preferencesRef.current = p;
      setPreferences(p);
      setStatus("ความชอบเฉพาะเบราว์เซอร์นี้");
      setReady(true);
    } else {
      setReady(false);
      setStatus("กำลังโหลดความชอบบัญชี");
      void personalFeedRequest("me", tokenRef.current)
        .then(p => {
          if (!current()) return;
          preferencesRef.current = p;
          setPreferences(p);
          setStatus("ความชอบบัญชี · ซิงค์ข้ามอุปกรณ์");
        })
        .catch(() => {
          if (current()) {
            setError("โหลดความชอบบัญชีไม่ได้ กดลองใหม่");
            setStatus("ความชอบชั่วคราว · ยังไม่ซิงค์");
          }
        })
        .finally(() => {
          if (current()) setReady(true);
        });
    }
    return () => {
      active = false;
      epochRef.current += 1;
    };
  }, [identity, authLoading]);

  async function flush() {
    if (!userId || processingRef.current) return;
    const epoch = epochRef.current;
    processingRef.current = true;
    setBusy(true);
    setError("");
    try {
      while (queueRef.current.length && epoch === epochRef.current) {
        const head = queueRef.current[0];
        const p = await personalFeedRequest(
          "signals",
          tokenRef.current,
          head.signal
        );
        if (epoch !== epochRef.current) return;
        queueRef.current.shift();
        const rebased = queueRef.current.reduce(
          (current, event) =>
            applyFeedSignal(current, event.item, event.signal.action),
          p
        );
        preferencesRef.current = rebased;
        setPreferences(rebased);
      }
      if (epoch === epochRef.current)
        setStatus("ความชอบบัญชี · ซิงค์ข้ามอุปกรณ์");
    } catch {
      if (epoch === epochRef.current) {
        setError("ซิงค์ความชอบไม่สำเร็จ กดลองใหม่");
        setStatus("ความชอบชั่วคราว · ยังไม่ซิงค์");
      }
    } finally {
      if (epoch === epochRef.current) {
        processingRef.current = false;
        setBusy(false);
      }
    }
  }
  function record(item: PublicMediaSummary, action: FeedAction) {
    if (
      !enabledRef.current ||
      !ready ||
      loadedIdentity !== identity ||
      authLoading ||
      !/^[a-f0-9]{32}$/.test(item.id)
    )
      return;
    if (userId && queueRef.current.length >= 100) {
      setError("คิวความชอบเต็ม กรุณาลองซิงค์อีกครั้ง");
      return;
    }
    const p = applyFeedSignal(preferencesRef.current, item, action);
    preferencesRef.current = p;
    setPreferences(p);
    if (!userId) {
      try {
        localStorage.setItem(GUEST_KEY, JSON.stringify(p));
        setStatus("ความชอบเฉพาะเบราว์เซอร์นี้");
      } catch {
        setStatus("ความชอบในแท็บนี้ · บันทึกในเครื่องไม่ได้");
      }
      return;
    }
    setStatus("กำลังซิงค์ความชอบบัญชี…");
    queueRef.current.push({
      item,
      signal: { mediaId: item.id, eventId: crypto.randomUUID(), action },
    });
    void flush();
  }
  async function retry() {
    if (queueRef.current.length) return flush();
    if (!userId || busy) return;
    const epoch = epochRef.current;
    setBusy(true);
    try {
      const p = await personalFeedRequest("me", tokenRef.current);
      if (epoch !== epochRef.current) return;
      preferencesRef.current = p;
      setPreferences(p);
      setError("");
      setStatus("ความชอบบัญชี · ซิงค์ข้ามอุปกรณ์");
    } catch {
      if (epoch === epochRef.current) setError("โหลดความชอบไม่สำเร็จ ลองใหม่");
    } finally {
      if (epoch === epochRef.current) setBusy(false);
    }
  }
  function setEnabled(value: boolean) {
    enabledRef.current = value;
    setEnabledState(value);
    try {
      localStorage.setItem(
        `khingkhing.feed.enabled.${identity}`,
        String(value)
      );
    } catch {
      /* In-memory opt out */
    }
  }
  return {
    preferences:
      loadedIdentity === identity ? preferences : emptyFeedPreferences(),
    ready: ready && !authLoading && loadedIdentity === identity,
    enabled,
    status: loadedIdentity === identity ? status : "กำลังตรวจสอบความชอบผู้ชม",
    error,
    busy,
    record,
    retry,
    setEnabled,
  };
}
