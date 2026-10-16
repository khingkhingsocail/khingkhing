import {
  useRef,
  type PointerEvent,
  type KeyboardEvent,
  type RefObject,
} from "react";
export function swipeDirection(dx: number, dy: number): number {
  return Math.abs(dy) >= 45 && Math.abs(dy) > Math.abs(dx) * 1.25
    ? dy < 0
      ? 1
      : -1
    : 0;
}
export function useFeedSwipe(
  ref: RefObject<HTMLDivElement | null>,
  disabled: boolean
) {
  const start = useRef<{ x: number; y: number; pointer: number } | null>(null);
  const last = useRef(0);
  function move(direction: number) {
    const root = ref.current;
    if (!root || disabled || performance.now() - last.current < 250) return;
    const posts = [...root.querySelectorAll<HTMLElement>(".short-post")];
    if (!posts.length) return;
    const top = root.getBoundingClientRect().top;
    const nearest = posts.reduce(
      (best, post, index) =>
        Math.abs(post.getBoundingClientRect().top - top) <
        Math.abs(posts[best].getBoundingClientRect().top - top)
          ? index
          : best,
      0
    );
    const target =
      posts[Math.max(0, Math.min(posts.length - 1, nearest + direction))];
    const scrollTop = target.getBoundingClientRect().top - top + root.scrollTop;
    last.current = performance.now();
    root.scrollTo({
      top: scrollTop,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }
  const interactive = (target: EventTarget | null) =>
    target instanceof Element &&
    !!target.closest(
      "button,a,input,textarea,select,[role=dialog],[contenteditable=true]"
    );
  return {
    move,
    handlers: {
      onPointerDown(event: PointerEvent<HTMLDivElement>) {
        if (
          disabled ||
          event.pointerType !== "touch" ||
          !event.isPrimary ||
          interactive(event.target)
        )
          return;
        start.current = {
          x: event.clientX,
          y: event.clientY,
          pointer: event.pointerId,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
      },
      onPointerUp(event: PointerEvent<HTMLDivElement>) {
        const origin = start.current;
        start.current = null;
        if (!origin || origin.pointer !== event.pointerId || disabled) return;
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
        const direction = swipeDirection(
          event.clientX - origin.x,
          event.clientY - origin.y
        );
        if (direction) move(direction);
      },
      onPointerCancel() {
        start.current = null;
      },
      onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
        if (
          disabled ||
          interactive(event.target) ||
          !["ArrowDown", "ArrowUp", "PageDown", "PageUp"].includes(event.key)
        )
          return;
        event.preventDefault();
        move(event.key === "ArrowDown" || event.key === "PageDown" ? 1 : -1);
      },
    },
  };
}
