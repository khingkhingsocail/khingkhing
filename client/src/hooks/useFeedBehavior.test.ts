import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({
  refs: [] as Array<{ current: any }>,
  cursor: 0,
  effects: [] as Array<() => void | (() => void)>,
}));
vi.mock("react", () => ({
  useRef: (value: any) => {
    const index = h.cursor++;
    return h.refs[index] ?? (h.refs[index] = { current: value });
  },
  useEffect: (fn: () => void | (() => void)) => h.effects.push(fn),
}));
import { useFeedBehavior } from "./useFeedBehavior";
let cleanup: (() => void) | undefined;
beforeEach(() => {
  vi.useFakeTimers();
  h.refs = [];
  h.cursor = 0;
  h.effects = [];
  vi.stubGlobal("document", { visibilityState: "visible" });
});
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function mount(
  view: boolean,
  qualified: boolean,
  active: boolean,
  send = vi.fn()
) {
  h.cursor = 0;
  h.effects = [];
  useFeedBehavior("post", view, qualified, active, send);
  // Reset-by-ID effect executes only at the first mount.
  if (h.refs[0].current.elapsed === undefined)
    throw new Error("Invalid harness");
  const fn = h.effects[1];
  const result = fn();
  cleanup = typeof result === "function" ? result : undefined;
  return send;
}
describe("qualified feed preference signals (effect harness)", () => {
  it("learns a long watch once after eight seconds and not from looping", async () => {
    const send = mount(true, true, true);
    await vi.advanceTimersByTimeAsync(7999);
    expect(send).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(send).toHaveBeenCalledWith("watch");
    await vi.advanceTimersByTimeAsync(16000);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("marks a fast exit as skip but does not mark opening Comments as skip", async () => {
    const send = mount(true, true, true);
    await vi.advanceTimersByTimeAsync(800);
    cleanup?.();
    mount(false, false, true, send);
    expect(send).toHaveBeenCalledWith("skip");
  });
  it("does not learn hidden/private/unready media", async () => {
    const send = mount(true, false, true);
    await vi.advanceTimersByTimeAsync(9000);
    expect(send).not.toHaveBeenCalled();
    cleanup?.();
    mount(false, false, false, send);
    expect(send).not.toHaveBeenCalled();
  });
  it("opening an overlay clears the short-watch state without a skip", async () => {
    const send = mount(true, true, true);
    await vi.advanceTimersByTimeAsync(500);
    cleanup?.();
    mount(true, true, false, send);
    expect(send).not.toHaveBeenCalled();
  });
  it("a hidden document cannot send a long-watch", async () => {
    const send = mount(true, true, true);
    (document as any).visibilityState = "hidden";
    await vi.advanceTimersByTimeAsync(12000);
    expect(send).not.toHaveBeenCalled();
  });
});
