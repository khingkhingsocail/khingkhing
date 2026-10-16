import { useEffect, useState, type RefObject } from "react";

/** No guessed visibility: unsupported observers disable autoplay and learning. */
export function useFeedVisibility(
  ref: RefObject<HTMLElement | null>,
  id: string,
  kind: "image" | "video"
) {
  const [inView, setInView] = useState(false);
  const [observable, setObservable] = useState(false);
  useEffect(() => {
    setInView(false);
    setObservable(false);
    const article = ref.current;
    if (!article || typeof IntersectionObserver === "undefined") return;
    setObservable(true);
    const observer = new IntersectionObserver(
      ([entry]) =>
        setInView(
          Boolean(entry?.isIntersecting && entry.intersectionRatio >= 0.6)
        ),
      { root: article.closest(".feed-scroll"), threshold: [0, 0.6, 1] }
    );
    observer.observe(article);
    return () => observer.disconnect();
  }, [ref, id, kind]);
  return { inView, observable };
}
