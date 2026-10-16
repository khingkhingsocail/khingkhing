import { useEffect, useRef } from "react";
import type { FeedAction } from "@shared/feedPersonalization";
/** Only continuous qualified visibility is measured; hiding Comments/Arena is not a skip. */
export function useFeedBehavior(
  id: string,
  inView: boolean,
  qualified: boolean,
  active: boolean,
  onSignal: (action: FeedAction) => void
) {
  const state = useRef({ elapsed: 0, wasInView: false, sent: false });
  const callback = useRef(onSignal);
  callback.current = onSignal;
  useEffect(() => {
    state.current = { elapsed: 0, wasInView: false, sent: false };
  }, [id]);
  useEffect(() => {
    const current = state.current;
    if (!active) {
      current.elapsed = 0;
      current.wasInView = false;
      return;
    }
    if (!inView) {
      if (
        current.wasInView &&
        current.elapsed >= 200 &&
        current.elapsed < 2000 &&
        !current.sent
      ) {
        callback.current("skip");
        current.sent = true;
      }
      current.elapsed = 0;
      current.wasInView = false;
      return;
    }
    current.wasInView = true;
    if (!qualified) {
      current.elapsed = 0;
      return;
    }
    const timer = setInterval(() => {
      if (document.visibilityState !== "visible") {
        current.elapsed = 0;
        return;
      }
      current.elapsed += 200;
      if (current.elapsed >= 8000 && !current.sent) {
        current.sent = true;
        callback.current("watch");
      }
    }, 200);
    return () => clearInterval(timer);
  }, [inView, qualified, active, id]);
}
