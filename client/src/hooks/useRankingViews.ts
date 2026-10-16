import { useCallback, useEffect, useRef, useState } from "react";
import {
  rankingTargetId,
  type RankingTarget,
} from "../../../shared/rankingViews";
import { readRankingViews, recordRankingView } from "../lib/rankingViews";
import {
  RankingGroupOpening,
  RankingOpeningQueue,
} from "../lib/rankingOpeningQueue";

export function useRankingViews(targets: RankingTarget[]) {
  const signature = JSON.stringify(targets);
  const [counts, setCounts] = useState(new Map<string, number>());
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  const latest = useRef(new Map<string, number>());
  const mounted = useRef(true);
  const queue = useRef<RankingOpeningQueue | null>(null);
  if (!queue.current)
    queue.current = new RankingOpeningQueue(
      recordRankingView,
      (id, total) => {
        latest.current.set(id, Math.max(latest.current.get(id) ?? 0, total));
        if (mounted.current) {
          setCounts(new Map(latest.current));
          setError(false);
        }
      },
      () => {
        if (mounted.current) setError(true);
      }
    );
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setError(false);
    const current: RankingTarget[] = JSON.parse(signature);
    const ids = new Set(current.map(rankingTargetId));
    setCounts(new Map([...latest.current].filter(([id]) => ids.has(id))));
    readRankingViews(current, controller.signal)
      .then(next => {
        if (active) {
          for (const [id, total] of next)
            latest.current.set(
              id,
              Math.max(latest.current.get(id) ?? 0, total)
            );
          setCounts(new Map([...latest.current].filter(([id]) => ids.has(id))));
        }
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [signature, revision]);
  useEffect(() => {
    const visible = () => {
      if (document.visibilityState === "visible")
        setRevision(value => value + 1);
    };
    document.addEventListener("visibilitychange", visible);
    return () => document.removeEventListener("visibilitychange", visible);
  }, []);
  const open = useCallback(
    (target: RankingTarget) => queue.current!.open(target),
    []
  );
  const retry = () => {
    setRevision(value => value + 1);
    queue.current!.retry();
  };
  return { counts, error, open, retry };
}
// Lives in the page, not in a conditional loading/detail subtree.
// Explicit navigation visibility resets opening; refresh/loading does not.
export function useRankingOpening(
  target: RankingTarget | null,
  ready: boolean,
  visible = true
) {
  const state = useRankingViews(target ? [target] : []);
  const id = target ? rankingTargetId(target) : "";
  const tracker = useRef(new RankingGroupOpening());
  useEffect(() => {
    if (tracker.current.shouldOpen(id, ready, visible) && target)
      state.open(target);
  }, [ready, visible, id, state.open]);
  return state;
}
