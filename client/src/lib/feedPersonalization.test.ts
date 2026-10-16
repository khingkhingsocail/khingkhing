import { describe, expect, it } from "vitest";
import {
  applyFeedSignal,
  emptyFeedPreferences,
  feedFeatures,
  isFeedPreferences,
  parseFeedSignal,
  rankPersonalFeed,
  personalFeedReason,
} from "../../../shared/feedPersonalization";
import type { PublicMediaSummary } from "../../../shared/publicMedia";
const make = (
  id: string,
  title: string,
  kind: "image" | "video" = "video",
  creator?: string
): PublicMediaSummary => ({
  id: id.repeat(32),
  title,
  description: "",
  kind,
  mimeType: kind === "video" ? "video/mp4" : "image/png",
  size: 100,
  createdAt: "2026-10-10T00:00:00Z",
  viewCount: 0,
  ...(creator
    ? {
        creator: {
          id: creator.repeat(32),
          displayName: "Creator",
          handle: "creator",
          avatarUrl: null,
        },
      }
    : {}),
});

describe("personal feed ranking from bounded metadata", () => {
  it("two individuals receive different priorities from their own likes", () => {
    const sport = make("a", "ฝึกฟุตบอล #football"),
      food = make("b", "ทำอาหาร #recipe", "image");
    const p1 = applyFeedSignal(emptyFeedPreferences(), sport, "like");
    const p2 = applyFeedSignal(emptyFeedPreferences(), food, "save");
    expect(rankPersonalFeed([food, sport], p1)[0].id).toBe(sport.id);
    expect(rankPersonalFeed([food, sport], p2)[0].id).toBe(food.id);
    expect(emptyFeedPreferences().weights).toEqual({});
  });
  it("skip lowers affinity, watch raises it, not-interested excludes only that post", () => {
    const sport = make("a", "ฟุตบอล", "video", "d"),
      next = make("b", "football", "video", "d");
    const watched = applyFeedSignal(emptyFeedPreferences(), sport, "watch");
    expect(watched.weights["topic:sports"]).toBeGreaterThan(0);
    expect(
      applyFeedSignal(emptyFeedPreferences(), sport, "skip").weights[
        "topic:sports"
      ]
    ).toBeLessThan(0);
    const dismissed = applyFeedSignal(watched, sport, "not-interested");
    expect(rankPersonalFeed([sport, next], dismissed).map(i => i.id)).toEqual([
      next.id,
    ]);
    expect(personalFeedReason(sport, watched)).toContain("ครีเอเตอร์");
  });
  it("extracts declared public topics without private account properties", () => {
    const item = make("a", "#ฟิตเนส #fitness #fitness #music");
    const features = feedFeatures(item);
    expect(features).toContain("topic:ฟิตเนส");
    expect(new Set(features).size).toBe(features.length);
    expect(features).not.toContain("userId");
  });
  it("diversifies creators while preserving candidates and source arrays", () => {
    const items = [
      make("a", "กีฬา", "video", "e"),
      make("b", "กีฬา", "video", "e"),
      make("c", "กีฬา", "video", "e"),
      make("d", "อาหาร", "image", "f"),
    ];
    const before = items.map(x => x.id);
    const ranked = rankPersonalFeed(
      items,
      applyFeedSignal(emptyFeedPreferences(), items[0], "like")
    );
    expect(ranked[2].creator?.id).toBe("f".repeat(32));
    expect(ranked).toHaveLength(4);
    expect(items.map(x => x.id)).toEqual(before);
  });
  it("bounds preference storage and rejects invalid identities/injected signals", () => {
    let p = emptyFeedPreferences();
    for (let i = 0; i < 350; i++)
      p = applyFeedSignal(
        p,
        { ...make("a", `#tag${i}`), id: i.toString(16).padStart(32, "0") },
        "not-interested"
      );
    expect(Object.keys(p.weights).length).toBeLessThanOrEqual(300);
    expect(p.dismissed).toHaveLength(200);
    expect(isFeedPreferences(p)).toBe(true);
    expect(
      isFeedPreferences({
        version: 1,
        weights: { "private:location": 2 },
        dismissed: [],
      })
    ).toBe(false);
    const signal = {
      mediaId: "a".repeat(32),
      eventId: "12345678-1234-4234-8234-123456789abc",
      action: "like",
    };
    expect(parseFeedSignal(signal)).toEqual(signal);
    expect(parseFeedSignal({ ...signal, userId: 2 })).toBeNull();
    expect(parseFeedSignal({ ...signal, mediaId: "local-123" })).toBeNull();
  });
});
