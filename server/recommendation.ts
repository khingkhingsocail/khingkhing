export type FeedMode = "for-you" | "following";
export type VideoVisibility = "public" | "followers" | "private";
export type VideoStatus = "draft" | "processing" | "published" | "blocked" | "deleted";

export interface RecommendationCandidate {
  id: string;
  creatorId: number;
  createdAt: string | number | Date;
  status: VideoStatus;
  visibility: VideoVisibility;
  durationSeconds: number;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  saveCount: number;
  averageWatchSeconds: number;
  rewatchRate: number;
  skipRate: number;
  hashtags: readonly string[];
}

export interface RecommendationContext {
  nowMs: number;
  viewerId?: number;
  followedCreatorIds: ReadonlySet<number>;
  blockedCreatorIds: ReadonlySet<number>;
  interests: ReadonlySet<string>;
  maxPerCreator?: number;
}

export interface RankedVideo {
  video: RecommendationCandidate;
  score: number;
}

const clamp = (value: number, min = 0, max = 1): number =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;

function timestampMs(value: RecommendationCandidate["createdAt"]): number {
  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

/** Log-normalized action rate prevents raw view counts from dominating small creators. */
function normalizedActionRate(actions: number, views: number): number {
  const safeActions = Math.max(0, Number.isFinite(actions) ? actions : 0);
  const safeViews = Math.max(1, Number.isFinite(views) ? views : 0);
  return clamp(Math.log1p(safeActions) / Math.log1p(safeViews));
}

function interestMatch(tags: readonly string[], interests: ReadonlySet<string>): number {
  if (interests.size === 0 || tags.length === 0) return 0;
  const normalizedInterests = new Set([...interests].map((tag) => tag.replace(/^#/, "").toLocaleLowerCase()));
  const normalizedTags = new Set(tags.map((tag) => tag.replace(/^#/, "").toLocaleLowerCase()));
  let matches = 0;
  for (const tag of normalizedTags) if (normalizedInterests.has(tag)) matches += 1;
  return clamp(matches / Math.min(normalizedInterests.size, 5));
}

function isEligible(video: RecommendationCandidate, context: RecommendationContext): boolean {
  return (
    video.status === "published" &&
    video.visibility === "public" &&
    video.id.length > 0 &&
    video.creatorId !== context.viewerId &&
    !context.blockedCreatorIds.has(video.creatorId) &&
    video.durationSeconds > 0
  );
}

/**
 * A transparent MVP ranker. Engagement signals are normalized by views, freshness decays
 * over four days, and safety/visibility filters run before scoring. This function ranks only;
 * it does not replace authorization, moderation, or an online-learning model.
 */
export function scoreForYouVideo(
  video: RecommendationCandidate,
  context: RecommendationContext,
): number {
  const views = Math.max(1, video.viewCount);
  const watchRatio = clamp(video.averageWatchSeconds / Math.max(1, video.durationSeconds), 0, 1.5);
  const freshness = Math.exp(-Math.max(0, context.nowMs - timestampMs(video.createdAt)) / (96 * 60 * 60 * 1000));
  const followedCreatorBoost = context.followedCreatorIds.has(video.creatorId) ? 0.25 : 0;
  const skipPenalty = clamp(video.skipRate) * 1.8;

  return (
    watchRatio * 3.2 +
    clamp(video.rewatchRate) * 1.4 +
    normalizedActionRate(video.shareCount, views) * 1.7 +
    normalizedActionRate(video.saveCount, views) * 1.25 +
    normalizedActionRate(video.likeCount, views) * 1.1 +
    normalizedActionRate(video.commentCount, views) * 0.8 +
    interestMatch(video.hashtags, context.interests) * 0.9 +
    freshness * 0.55 +
    followedCreatorBoost -
    skipPenalty
  );
}

function diversify(ranked: readonly RankedVideo[], maxPerCreator: number): RankedVideo[] {
  const counts = new Map<number, number>();
  const result: RankedVideo[] = [];
  for (const item of ranked) {
    const count = counts.get(item.video.creatorId) ?? 0;
    if (count >= maxPerCreator) continue;
    counts.set(item.video.creatorId, count + 1);
    result.push(item);
  }
  return result;
}

export function rankVideos(
  candidates: readonly RecommendationCandidate[],
  context: RecommendationContext,
  mode: FeedMode,
): RankedVideo[] {
  const eligible = candidates.filter((video) => isEligible(video, context));

  if (mode === "following") {
    return eligible
      .filter((video) => context.followedCreatorIds.has(video.creatorId))
      .sort((a, b) => timestampMs(b.createdAt) - timestampMs(a.createdAt) || a.id.localeCompare(b.id))
      .map((video) => ({ video, score: 0 }));
  }

  const ranked = eligible
    .map((video) => ({ video, score: scoreForYouVideo(video, context) }))
    .sort((a, b) => b.score - a.score || timestampMs(b.video.createdAt) - timestampMs(a.video.createdAt) || a.video.id.localeCompare(b.video.id));

  return diversify(ranked, Math.max(1, context.maxPerCreator ?? 3));
}
