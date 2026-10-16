import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const harness = vi.hoisted(() => ({
  effects: [] as Array<() => void | (() => void)>,
}));
vi.mock("react", () => ({
  useState: (initial: any) => [
    typeof initial === "function" ? initial() : initial,
    vi.fn(),
  ],
  useRef: (current: any) => ({ current }),
  useCallback: (fn: any) => fn,
  useEffect: (fn: any) => {
    harness.effects.push(fn);
  },
}));
import { usePublicPostView } from "./usePublicPostView";
import { MediaViewSession } from "../lib/mediaViews";
const id = "a".repeat(32);
let cleanups: Array<() => void> = [];
beforeEach(() => {
  vi.useFakeTimers();
  harness.effects = [];
  cleanups = [];
  vi.stubGlobal("window", { setTimeout, clearTimeout });
  vi.stubGlobal("document", {
    visibilityState: "visible",
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
});
afterEach(() => {
  cleanups.forEach(fn => fn());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function mount(eligible: boolean, mediaId: string | undefined) {
  const send = vi.fn(async () => ({
    mediaId: id,
    viewCount: 1,
    counted: true,
  }));
  const session = new MediaViewSession(send, () => "test-event");
  const update = vi.fn();
  usePublicPostView(mediaId, eligible, session, update);
  harness.effects.forEach(fn => {
    const cleanup = fn();
    if (cleanup) cleanups.push(cleanup);
  });
  return { send, update };
}
describe("qualified visible post view timer (effect harness)", () => {
  it("waits for a full two seconds before writing and returns the real count", async () => {
    const { send, update } = mount(true, id);
    await vi.advanceTimersByTimeAsync(1999);
    expect(send).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(1);
  });
  it("cancels the view when visibility/play eligibility is lost before threshold", async () => {
    const { send } = mount(true, id);
    await vi.advanceTimersByTimeAsync(1000);
    cleanups.at(-1)?.();
    await vi.advanceTimersByTimeAsync(2000);
    expect(send).not.toHaveBeenCalled();
  });
  it("does not qualify hidden feeds, preload, private or demo posts", async () => {
    const first = mount(false, id);
    harness.effects = [];
    const second = mount(true, undefined);
    await vi.advanceTimersByTimeAsync(3000);
    expect(first.send).not.toHaveBeenCalled();
    expect(second.send).not.toHaveBeenCalled();
  });
  it("checks actual document visibility before the timer writes", async () => {
    const { send } = mount(true, id);
    (document as any).visibilityState = "hidden";
    await vi.advanceTimersByTimeAsync(2000);
    expect(send).not.toHaveBeenCalled();
  });
});
