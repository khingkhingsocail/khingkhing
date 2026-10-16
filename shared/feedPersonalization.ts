import type { PublicMediaSummary } from "./publicMedia";

export const feedActions = [
  "like",
  "unlike",
  "save",
  "unsave",
  "watch",
  "skip",
  "not-interested",
] as const;
export type FeedAction = (typeof feedActions)[number];
export interface FeedSignal {
  mediaId: string;
  eventId: string;
  action: FeedAction;
}
export interface FeedPreferences {
  version: 1;
  weights: Record<string, number>;
  dismissed: string[];
}
export const emptyFeedPreferences = (): FeedPreferences => ({
  version: 1,
  weights: {},
  dismissed: [],
});
export function isFeedPreferences(value: unknown): value is FeedPreferences {
  if (!value || typeof value !== "object") return false;
  const p = value as FeedPreferences;
  return (
    p.version === 1 &&
    !!p.weights &&
    typeof p.weights === "object" &&
    !Array.isArray(p.weights) &&
    Object.keys(p.weights).length <= 300 &&
    Object.entries(p.weights).every(
      ([key, v]) =>
        /^(kind:(image|video)|topic:[\p{L}\p{M}\p{N}_-]{1,40}|creator:[a-f0-9]{32})$/u.test(
          key
        ) &&
        typeof v === "number" &&
        Number.isFinite(v) &&
        Math.abs(v) <= 20
    ) &&
    Array.isArray(p.dismissed) &&
    p.dismissed.length <= 200 &&
    p.dismissed.every(id => typeof id === "string" && /^[a-f0-9]{32}$/.test(id))
  );
}
export function parseFeedSignal(raw: unknown): FeedSignal | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const p = raw as Record<string, unknown>;
  if (
    Object.keys(p).some(k => !["mediaId", "eventId", "action"].includes(k)) ||
    typeof p.mediaId !== "string" ||
    !/^[a-f0-9]{32}$/.test(p.mediaId) ||
    typeof p.eventId !== "string" ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
      p.eventId
    ) ||
    !feedActions.includes(p.action as FeedAction)
  )
    return null;
  return {
    mediaId: p.mediaId,
    eventId: p.eventId.toLowerCase(),
    action: p.action as FeedAction,
  };
}
const topicWords: Record<string, RegExp> = {
  sports: /กีฬา|ฟุตบอล|วิ่ง|ฟิตเนส|ออกกำลัง|sport|football|fitness|running/i,
  investment: /ลงทุน|หุ้น|กองทุน|invest|stock|finance|fund/i,
  games: /เกม|เกมส์|gaming|game|esport/i,
  music: /เพลง|ดนตรี|ร้องเพลง|music|sing|dance|เต้น/i,
  travel: /เที่ยว|ท่องเที่ยว|ทะเล|ภูเขา|travel|beach|trip/i,
  food: /อาหาร|ทำอาหาร|อร่อย|food|cook|recipe/i,
  art: /ภาพถ่าย|ศิลปะ|วาด|ออกแบบ|photo|art|design/i,
  pets: /แมว|สุนัข|สัตว์เลี้ยง|cat|dog|pet/i,
};
export function feedFeatures(
  item: Pick<PublicMediaSummary, "kind" | "title" | "description" | "creator">
): string[] {
  const text = `${item.title} ${item.description}`.normalize("NFKC");
  const topics = new Set<string>();
  for (const [topic, pattern] of Object.entries(topicWords))
    if (pattern.test(text)) topics.add(topic);
  for (const match of text.matchAll(/#([\p{L}\p{M}\p{N}_-]{1,40})/gu))
    topics.add(match[1].toLowerCase());
  return [
    `kind:${item.kind}`,
    ...[...topics].slice(0, 12).map(t => `topic:${t}`),
    ...(item.creator && /^[a-f0-9]{32}$/.test(item.creator.id)
      ? [`creator:${item.creator.id}`]
      : []),
  ];
}
const actionWeight: Record<FeedAction, number> = {
  like: 5,
  unlike: -5,
  save: 7,
  unsave: -7,
  watch: 1,
  skip: -1,
  "not-interested": -6,
};
export function applyFeedSignal(
  preferences: FeedPreferences,
  item: Pick<
    PublicMediaSummary,
    "id" | "kind" | "title" | "description" | "creator"
  >,
  action: FeedAction
): FeedPreferences {
  const weights = { ...preferences.weights };
  for (const key of feedFeatures(item)) {
    const value = (weights[key] ?? 0) * 0.98 + actionWeight[action];
    delete weights[key]; // Recently updated keys are kept when bounded to 300.
    weights[key] = Math.max(-20, Math.min(20, value));
  }
  const dismissed =
    action === "not-interested"
      ? [...preferences.dismissed.filter(id => id !== item.id), item.id].slice(
          -200
        )
      : [...preferences.dismissed];
  return {
    version: 1,
    weights: Object.fromEntries(Object.entries(weights).slice(-300)),
    dismissed,
  };
}
export function feedScore(
  item: PublicMediaSummary,
  p: FeedPreferences,
  now = Date.now()
): number {
  const features = feedFeatures(item);
  const affinity = features.reduce(
    (sum, key) =>
      sum + (p.weights[key] ?? 0) * (key.startsWith("kind:") ? 0.25 : 1),
    0
  );
  const time = Date.parse(item.createdAt);
  const fresh = Number.isFinite(time)
    ? Math.exp(-Math.max(0, now - time) / (7 * 86400000))
    : 0;
  return (
    affinity + fresh * 2 + Math.min(1, Math.log1p(item.viewCount ?? 0) / 20)
  );
}
/** Bounded candidate ranking, not a global popularity chart. Every fifth slot explores. */
export function rankPersonalFeed(
  items: readonly PublicMediaSummary[],
  p: FeedPreferences,
  now = Date.now()
): PublicMediaSummary[] {
  const hidden = new Set(p.dismissed);
  const available = [
    ...new Map(
      items.filter(i => !hidden.has(i.id)).map(i => [i.id, i])
    ).values(),
  ];
  const pending = available.sort(
    (a, b) =>
      feedScore(b, p, now) - feedScore(a, p, now) ||
      b.createdAt.localeCompare(a.createdAt) ||
      a.id.localeCompare(b.id)
  );
  const result: PublicMediaSummary[] = [];
  while (pending.length) {
    const lastCreator = result.at(-1)?.creator?.id;
    const previousCreator = result.at(-2)?.creator?.id;
    const alternatives = pending
      .map((item, i) => ({ item, i }))
      .filter(
        ({ item }) =>
          !(
            lastCreator &&
            lastCreator === previousCreator &&
            item.creator?.id === lastCreator
          )
      );
    const eligible = alternatives.length
      ? alternatives
      : pending.map((item, i) => ({ item, i }));
    const choice =
      result.length % 5 === 4
        ? eligible.reduce((best, x) =>
            x.item.createdAt > best.item.createdAt ? x : best
          )
        : eligible[0];
    result.push(...pending.splice(choice.i, 1));
  }
  return result;
}
export function personalFeedReason(
  item: PublicMediaSummary,
  p: FeedPreferences
): string {
  const matching = feedFeatures(item).filter(key => (p.weights[key] ?? 0) > 0);
  if (matching.some(key => key.startsWith("creator:")))
    return "จากครีเอเตอร์ที่คุณเคยสนใจ";
  if (matching.some(key => key.startsWith("topic:")))
    return "ใกล้เคียงหัวข้อที่คุณเคยสนใจ";
  if (matching.includes(`kind:${item.kind}`))
    return item.kind === "video" ? "คุณสนใจคลิปวิดีโอ" : "คุณสนใจโพสต์รูปภาพ";
  return "สำรวจโพสต์ใหม่สำหรับคุณ";
}
