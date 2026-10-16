import { describe, expect, it, vi } from "vitest";
import {
  RankingGroupOpening,
  RankingOpeningQueue,
} from "./rankingOpeningQueue";
const target = { kind: "community-entry" as const, key: "a".repeat(32) };
describe("ranking distinct openings and retry", () => {
  it("keeps separate events for close/reopen while first write is pending", async () => {
    const promises: Array<(n: number) => void> = [];
    let sequence = 0;
    const write = vi.fn(
      () => new Promise<number>(resolve => promises.push(resolve))
    );
    const done = vi.fn();
    const queue = new RankingOpeningQueue(
      write,
      done,
      vi.fn(),
      () => `event-${++sequence}`
    );
    queue.open(target);
    queue.open(target);
    expect(write.mock.calls).toHaveLength(2);
    expect((write.mock.calls as any)[0][1]).toBe("event-1");
    expect((write.mock.calls as any)[1][1]).toBe("event-2");
    promises[1](2);
    promises[0](1);
    await new Promise(r => setTimeout(r, 0));
    expect(done).toHaveBeenCalledTimes(2);
    queue.retry();
    expect(write).toHaveBeenCalledTimes(2);
  });
  it("failed event retries same UUID without redoing successful clicks", async () => {
    let sequence = 0;
    const write = vi
      .fn()
      .mockRejectedValueOnce(new Error())
      .mockResolvedValue(1);
    const queue = new RankingOpeningQueue(
      write,
      vi.fn(),
      vi.fn(),
      () => `event-${++sequence}`
    );
    queue.open(target);
    await new Promise(r => setTimeout(r, 0));
    queue.retry();
    await new Promise(r => setTimeout(r, 0));
    expect(write.mock.calls.map(call => call[1])).toEqual([
      "event-1",
      "event-1",
    ]);
    queue.retry();
    expect(write).toHaveBeenCalledTimes(2);
  });
  it("refresh/search/sort do not count, but actual hidden-tab reopening does", () => {
    const tracker = new RankingGroupOpening();
    expect(tracker.shouldOpen("board-a", false, true)).toBe(false);
    expect(tracker.shouldOpen("board-a", true, true)).toBe(true);
    expect(tracker.shouldOpen("board-a", false, true)).toBe(false);
    expect(tracker.shouldOpen("board-a", true, true)).toBe(false);
    expect(tracker.shouldOpen("board-a", true, false)).toBe(false);
    expect(tracker.shouldOpen("board-a", true, true)).toBe(true);
    expect(tracker.shouldOpen("board-b", true, true)).toBe(true);
  });
});
