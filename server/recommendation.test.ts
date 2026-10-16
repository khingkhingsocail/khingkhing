import { describe, expect, it } from "vitest";
import { rankVideos, type RecommendationCandidate, type RecommendationContext } from "./recommendation";

const nowMs = Date.parse("2026-10-07T00:00:00.000Z");
const context: RecommendationContext = {
  nowMs,
  viewerId: 99,
  followedCreatorIds: new Set([1]),
  blockedCreatorIds: new Set([8]),
  interests: new Set(["dance", "travel"]),
  maxPerCreator: 2,
};

function video(overrides: Partial<RecommendationCandidate> = {}): RecommendationCandidate {
  return {
    id: "video-1",
    creatorId: 1,
    createdAt: nowMs - 60 * 60 * 1000,
    status: "published",
    visibility: "public",
    durationSeconds: 30,
    viewCount: 100,
    likeCount: 20,
    commentCount: 4,
    shareCount: 5,
    saveCount: 7,
    averageWatchSeconds: 24,
    rewatchRate: 0.1,
    skipRate: 0.05,
    hashtags: ["#dance"],
    ...overrides,
  };
}

describe("rankVideos", () => {
  it("excludes blocked, private, non-published and the viewer's own videos", () => {
    const ranked = rankVideos(
      [
        video({ id: "visible" }),
        video({ id: "blocked", creatorId: 8 }),
        video({ id: "private", visibility: "private" }),
        video({ id: "draft", status: "draft" }),
        video({ id: "own", creatorId: 99 }),
      ],
      context,
      "for-you",
    );
    expect(ranked.map(({ video: item }) => item.id)).toEqual(["visible"]);
  });

  it("ranks retention and positive actions above early skips", () => {
    const ranked = rankVideos(
      [
        video({ id: "low", creatorId: 2, averageWatchSeconds: 2, likeCount: 0, shareCount: 0, saveCount: 0, commentCount: 0, skipRate: 0.9 }),
        video({ id: "high", creatorId: 3, averageWatchSeconds: 29, rewatchRate: 0.35, likeCount: 45, shareCount: 22, saveCount: 30, commentCount: 15, skipRate: 0.02 }),
      ],
      context,
      "for-you",
    );
    expect(ranked.map(({ video: item }) => item.id)).toEqual(["high", "low"]);
  });

  it("keeps Following chronological and limits it to followed creators", () => {
    const ranked = rankVideos(
      [
        video({ id: "older-followed", createdAt: nowMs - 5_000 }),
        video({ id: "newer-followed", createdAt: nowMs - 1_000 }),
        video({ id: "not-followed", creatorId: 3, createdAt: nowMs }),
      ],
      context,
      "following",
    );
    expect(ranked.map(({ video: item }) => item.id)).toEqual(["newer-followed", "older-followed"]);
    expect(ranked.every(({ score }) => score === 0)).toBe(true);
  });

  it("diversifies For You so one creator cannot fill the whole first page", () => {
    const ranked = rankVideos(
      [
        video({ id: "creator-1a", creatorId: 1 }),
        video({ id: "creator-1b", creatorId: 1 }),
        video({ id: "creator-1c", creatorId: 1 }),
        video({ id: "creator-1d", creatorId: 1 }),
        video({ id: "creator-2", creatorId: 2 }),
      ],
      context,
      "for-you",
    );
    expect(ranked.filter(({ video: item }) => item.creatorId === 1)).toHaveLength(2);
    expect(ranked.some(({ video: item }) => item.creatorId === 2)).toBe(true);
  });

  it("uses normalized hashtags for cold-start interest matching", () => {
    const matching = video({ id: "match", creatorId: 2, hashtags: ["Travel", "#dance"] });
    const unrelated = video({ id: "other", creatorId: 3, hashtags: ["food"] });
    const ranked = rankVideos([unrelated, matching], context, "for-you");
    expect(ranked[0]?.video.id).toBe("match");
  });
});
