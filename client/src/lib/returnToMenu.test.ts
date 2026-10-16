import { afterEach, describe, expect, it, vi } from "vitest";
import { captureMenuReturn, restoreMenuReturn } from "./returnToMenu";
afterEach(() => vi.unstubAllGlobals());
describe("return to original investment menu", () => {
  it("captures nested horizontal and vertical scroll, restores without changing navigation", () => {
    const scrollTo = vi.fn();
    vi.stubGlobal("window", { scrollX: 8, scrollY: 620, scrollTo });
    const outer = {
      scrollHeight: 1800,
      clientHeight: 600,
      scrollWidth: 700,
      clientWidth: 700,
      scrollTop: 520,
      scrollLeft: 0,
      isConnected: true,
      parentElement: null,
    };
    const inner = {
      scrollHeight: 400,
      clientHeight: 400,
      scrollWidth: 1100,
      clientWidth: 500,
      scrollTop: 0,
      scrollLeft: 175,
      isConnected: true,
      parentElement: outer,
    };
    const focus = vi.fn();
    const opener = {
      parentElement: inner,
      isConnected: true,
      focus,
    } as unknown as HTMLElement;
    const snapshot = captureMenuReturn(opener);
    outer.scrollTop = 0;
    inner.scrollLeft = 0;
    restoreMenuReturn(snapshot);
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(outer.scrollTop).toBe(520);
    expect(inner.scrollLeft).toBe(175);
    expect(scrollTo).toHaveBeenCalledWith({
      left: 8,
      top: 620,
      behavior: "instant",
    });
  });
  it("does not focus a removed opener or alter detached scroll elements", () => {
    const scrollTo = vi.fn();
    vi.stubGlobal("window", { scrollTo });
    const focus = vi.fn();
    const element = {
      isConnected: false,
      scrollTop: 0,
      scrollLeft: 0,
    } as HTMLElement;
    restoreMenuReturn({
      opener: { isConnected: false, focus } as unknown as HTMLElement,
      scroll: [{ element, top: 12, left: 7 }],
      x: 0,
      y: 0,
    });
    expect(focus).not.toHaveBeenCalled();
    expect(element.scrollTop).toBe(0);
  });
});
