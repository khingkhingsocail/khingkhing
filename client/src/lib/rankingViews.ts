import {
  rankingCountsSchema,
  rankingTargetId,
  type RankingTarget,
} from "../../../shared/rankingViews";
async function viewRequest(
  url: string,
  init: RequestInit = {},
  signal?: AbortSignal
) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timer = setTimeout(abort, 12000);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) throw new Error("โหลดหรือบันทึกจำนวนเปิดดูไม่ได้");
    return await response.json();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}
export async function readRankingViews(
  targets: RankingTarget[],
  signal?: AbortSignal
) {
  const result = new Map<string, number>();
  const unique = [
    ...new Map(
      targets.map(target => [rankingTargetId(target), target])
    ).values(),
  ];
  // Bound request URL length even for long metric bases and UTF-8 URLs.
  for (let index = 0; index < unique.length; ) {
    const batch: RankingTarget[] = [];
    while (index < unique.length && batch.length < 10) {
      const candidate = [...batch, unique[index]];
      if (
        batch.length &&
        encodeURIComponent(JSON.stringify(candidate)).length > 6000
      )
        break;
      batch.push(unique[index++]);
    }
    const body = rankingCountsSchema.parse(
      await viewRequest(
        `/api/ranking-views?targets=${encodeURIComponent(JSON.stringify(batch))}`,
        { cache: "no-store" },
        signal
      )
    );
    const expected = new Set(batch.map(rankingTargetId));
    if (
      body.counts.length !== expected.size ||
      body.counts.some(row => !expected.has(row.id)) ||
      new Set(body.counts.map(row => row.id)).size !== expected.size
    )
      throw new Error("ยอดเปิดดูไม่ครบตามรายการ");
    body.counts.forEach(row => result.set(row.id, row.total));
  }
  return result;
}
export async function recordRankingView(
  target: RankingTarget,
  eventId: string
) {
  const body = await viewRequest("/api/ranking-views/open", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Khing-Views": "1" },
    body: JSON.stringify({ target, eventId }),
  });
  if (
    body.id !== rankingTargetId(target) ||
    !Number.isSafeInteger(body.total) ||
    body.total < 0
  )
    throw new Error("ยอดเปิดดูไม่ถูกต้อง");
  return body.total as number;
}
