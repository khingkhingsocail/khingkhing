import { afterEach, describe, expect, it, vi } from "vitest";
import {
  rankingTargetId,
  type RankingTarget,
} from "../../../shared/rankingViews";
import { readRankingViews, recordRankingView } from "./rankingViews";
afterEach(() => vi.unstubAllGlobals());
const target: RankingTarget = { kind: "investment-entity", key: "voo" };
describe("ranking count transport", () => {
  it("batch GET reads without writing and validates returned targets", async () => {
    const fetcher = vi.fn(async (_url: string) => ({
      ok: true,
      json: async () => ({
        counts: [{ id: rankingTargetId(target), total: 4 }],
      }),
    }));
    vi.stubGlobal("fetch", fetcher);
    expect(
      (await readRankingViews([target])).get(rankingTargetId(target))
    ).toBe(4);
    expect(fetcher.mock.calls[0][0]).toContain("/api/ranking-views?targets=");
    expect((fetcher.mock.calls[0] as any)[1].method).toBeUndefined();
  });
  it("sends the same UUID on retry and never includes personal or client count fields", async () => {
    const requests: any[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, init) => {
        requests.push(JSON.parse(init.body));
        return {
          ok: true,
          json: async () => ({ id: rankingTargetId(target), total: 1 }),
        };
      })
    );
    const id = "11111111-1111-4111-8111-111111111111";
    await recordRankingView(target, id);
    await recordRankingView(target, id);
    expect(requests).toEqual([
      { target, eventId: id },
      { target, eventId: id },
    ]);
  });
  it("rejects incomplete or unrelated response rather than showing fake zero", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ counts: [] }) }))
    );
    await expect(readRankingViews([target])).rejects.toThrow();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ id: "wrong-target", total: 200 }),
      }))
    );
    await expect(recordRankingView(target, "id")).rejects.toThrow();
  });
  it("supports an empty list without network and shows an error on failure", async () => {
    const fetcher = vi.fn(async () => ({ ok: false }));
    vi.stubGlobal("fetch", fetcher);
    expect((await readRankingViews([])).size).toBe(0);
    expect(fetcher).not.toHaveBeenCalled();
    await expect(readRankingViews([target])).rejects.toThrow();
  });
});
