import { describe, expect, it } from "vitest";
import { swipeDirection } from "./useFeedSwipe";
describe("vertical feed swipe", () => {
  it("moves up to the next post and down to the previous post", () => {
    expect(swipeDirection(5, -80)).toBe(1);
    expect(swipeDirection(-4, 70)).toBe(-1);
  });
  it("does not change posts on taps, short drags or horizontal gestures", () => {
    expect(swipeDirection(0, 20)).toBe(0);
    expect(swipeDirection(90, -50)).toBe(0);
    expect(swipeDirection(0, 0)).toBe(0);
  });
});
