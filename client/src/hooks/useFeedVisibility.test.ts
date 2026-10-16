import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({
  effects: [] as Array<() => void | (() => void)>,
  setters: [] as Array<ReturnType<typeof vi.fn>>,
}));
vi.mock("react", () => ({
  useState: (initial: boolean) => {
    const setter = vi.fn();
    h.setters.push(setter);
    return [initial, setter];
  },
  useEffect: (effect: () => void | (() => void)) => h.effects.push(effect),
}));
import { useFeedVisibility } from "./useFeedVisibility";
beforeEach(() => {
  h.effects = [];
  h.setters = [];
});
afterEach(() => vi.unstubAllGlobals());
describe("feed visibility (effect harness)", () => {
  it("fails closed for every card when IntersectionObserver is unsupported", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    useFeedVisibility(
      { current: { closest: vi.fn() } as unknown as HTMLElement },
      "video-a",
      "video"
    );
    h.effects[0]();
    expect(h.setters[0]).toHaveBeenCalledWith(false);
    expect(h.setters[0]).not.toHaveBeenCalledWith(true);
    expect(h.setters[1]).toHaveBeenCalledWith(false);
    expect(h.setters[1]).not.toHaveBeenCalledWith(true);
  });
  it("qualifies only 60% visibility inside the feed root and disconnects", () => {
    let callback!: IntersectionObserverCallback;
    const root = {};
    const observe = vi.fn(),
      disconnect = vi.fn();
    const constructor = vi.fn(function (
      cb: IntersectionObserverCallback,
      options: IntersectionObserverInit
    ) {
      callback = cb;
      expect(options.root).toBe(root);
      return { observe, disconnect };
    });
    vi.stubGlobal("IntersectionObserver", constructor);
    const article = { closest: vi.fn(() => root) } as unknown as HTMLElement;
    useFeedVisibility({ current: article }, "video-a", "video");
    const cleanup = h.effects[0]();
    expect(observe).toHaveBeenCalledWith(article);
    callback(
      [
        {
          isIntersecting: true,
          intersectionRatio: 0.59,
        } as IntersectionObserverEntry,
      ],
      {} as IntersectionObserver
    );
    expect(h.setters[0]).toHaveBeenLastCalledWith(false);
    callback(
      [
        {
          isIntersecting: true,
          intersectionRatio: 0.6,
        } as IntersectionObserverEntry,
      ],
      {} as IntersectionObserver
    );
    expect(h.setters[0]).toHaveBeenLastCalledWith(true);
    if (typeof cleanup === "function") cleanup();
    expect(disconnect).toHaveBeenCalledOnce();
  });
});
