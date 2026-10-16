import type { PublicMediaSummary } from "../../../shared/publicMedia";

export type StatsSortKey = "title" | "kind" | "createdAt" | "size" | "sessionLikes" | "sessionBookmarks" | "views";
export type StatsDirection = "asc" | "desc";
export type StatsKindFilter = "all" | "image" | "video";

export interface MediaStatsRow extends PublicMediaSummary {
  sessionLikes: number;
  sessionBookmarks: number;
  views: number | null;
  comments: null;
  shares: null;
}

export const statsColumns: { key: StatsSortKey; label: string }[] = [
  { key: "title", label: "ชื่อผลงาน" },
  { key: "kind", label: "ประเภท" },
  { key: "createdAt", label: "วันที่เผยแพร่" },
  { key: "size", label: "ขนาดไฟล์" },
  { key: "sessionLikes", label: "ใจ · เซสชันนี้" },
  { key: "sessionBookmarks", label: "บันทึก · เซสชันนี้" },
  { key: "views", label: "วิว" },
];

export function toMediaStatsRows(
  items: readonly PublicMediaSummary[],
  likedIds: ReadonlySet<string>,
  savedIds: ReadonlySet<string>,
): MediaStatsRow[] {
  return items.map(({ id, title, description, kind, mimeType, size, createdAt, viewCount }) => ({
    id, title, description, kind, mimeType, size, createdAt,
    sessionLikes: likedIds.has(`public-${id}`) ? 1 : 0,
    sessionBookmarks: savedIds.has(`public-${id}`) ? 1 : 0,
    views: typeof viewCount === "number" && Number.isSafeInteger(viewCount) && viewCount >= 0 ? viewCount : null,
    comments: null, shares: null,
  }));
}

export function mergeStatsItems(current: readonly PublicMediaSummary[], incoming: readonly PublicMediaSummary[]): PublicMediaSummary[] {
  return [...new Map([...current, ...incoming].map((item) => [item.id, item])).values()];
}

export function filterMediaStats(rows: readonly MediaStatsRow[], kind: StatsKindFilter, query: string): MediaStatsRow[] {
  const term = query.trim().toLocaleLowerCase("th-TH");
  return rows.filter((row) => (kind === "all" || row.kind === kind)
    && (!term || `${row.title} ${row.description}`.toLocaleLowerCase("th-TH").includes(term)));
}

export function sortMediaStats(rows: readonly MediaStatsRow[], key: StatsSortKey, direction: StatsDirection): MediaStatsRow[] {
  const collator = new Intl.Collator("th-TH", { numeric: true, sensitivity: "base" });
  return [...rows].sort((a, b) => {
    let compared: number;
    if (key === "title" || key === "kind") {
      const left = key === "kind" ? (a.kind === "image" ? "ภาพ" : "วิดีโอ") : a.title;
      const right = key === "kind" ? (b.kind === "image" ? "ภาพ" : "วิดีโอ") : b.title;
      compared = collator.compare(left, right);
    } else {
      const left = key === "createdAt" ? Date.parse(a.createdAt) : a[key];
      const right = key === "createdAt" ? Date.parse(b.createdAt) : b[key];
      // Unknown or invalid values stay last in both directions.
      const leftIsKnown = typeof left === "number" && Number.isFinite(left);
      const rightIsKnown = typeof right === "number" && Number.isFinite(right);
      if (!leftIsKnown || !rightIsKnown) {
        if (leftIsKnown) return -1;
        if (rightIsKnown) return 1;
        return a.id.localeCompare(b.id);
      }
      compared = (left as number) - (right as number);
    }
    return compared === 0 ? a.id.localeCompare(b.id) : direction === "asc" ? compared : -compared;
  });
}

export function summarizeMediaStats(rows: readonly MediaStatsRow[]) {
  return {
    count: rows.length,
    images: rows.filter((row) => row.kind === "image").length,
    videos: rows.filter((row) => row.kind === "video").length,
    bytes: rows.every((row) => Number.isFinite(row.size) && row.size >= 0)
      ? rows.reduce((total, row) => total + row.size, 0)
      : null,
  };
}

export function formatStatsBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}
