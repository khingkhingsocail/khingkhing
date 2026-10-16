import { describe, expect, it } from "vitest";
import type { PublicMediaSummary } from "../../../shared/publicMedia";
import { filterMediaStats, formatStatsBytes, mergeStatsItems, sortMediaStats, statsColumns, summarizeMediaStats, toMediaStatsRows } from "./mediaStats";

// Deterministic fixtures for tests only; never displayed as real analytics.
const items: PublicMediaSummary[] = [
  { id: "b", title: "Clip 10", description: "เมืองตอนเช้า", kind: "video", mimeType: "video/mp4", size: 2000, createdAt: "2026-10-01T12:00:00Z", viewCount: 12 },
  { id: "a", title: "Clip 2", description: "แสงเมือง", kind: "image", mimeType: "image/png", size: 900, createdAt: "2026-10-02T12:00:00Z" },
  { id: "c", title: "Clip 1", description: "สวน", kind: "image", mimeType: "image/png", size: 10000, createdAt: "2026-10-02T12:00:00Z", viewCount: 0 },
];
const rows = () => toMediaStatsRows(items, new Set(["public-b", "local-a"]), new Set(["public-a"]));

describe("public media statistics", () => {
  it("keeps unavailable counters unknown and scopes reactions to the public ID", () => {
    const result = rows();
    expect(result.map((row) => row.sessionLikes)).toEqual([1, 0, 0]);
    expect(result.map((row) => row.sessionBookmarks)).toEqual([0, 1, 0]);
    expect(result.map((row) => row.views)).toEqual([12, null, 0]);
    expect(result.every((row) => row.comments === null && row.shares === null)).toBe(true);
    expect(statsColumns.filter((column) => column.key === "views")).toHaveLength(1);
  });

  it("sorts bytes numerically ascending and descending without mutating input", () => {
    const original = rows();
    expect(sortMediaStats(original, "size", "asc").map((row) => row.id)).toEqual(["a", "b", "c"]);
    expect(sortMediaStats(original, "size", "desc").map((row) => row.id)).toEqual(["c", "b", "a"]);
    expect(original.map((row) => row.id)).toEqual(["b", "a", "c"]);
  });

  it("sorts real views numerically and keeps legacy unknown views last both ways", () => {
    expect(sortMediaStats(rows(), "views", "asc").map((row) => row.id)).toEqual(["c", "b", "a"]);
    expect(sortMediaStats(rows(), "views", "desc").map((row) => row.id)).toEqual(["b", "c", "a"]);
  });

  it("sorts dates chronologically and uses deterministic ties in both directions", () => {
    expect(sortMediaStats(rows(), "createdAt", "desc").map((row) => row.id)).toEqual(["a", "c", "b"]);
    expect(sortMediaStats(rows(), "createdAt", "asc").map((row) => row.id)).toEqual(["b", "a", "c"]);
  });

  it("sorts titles naturally and session reactions as numbers", () => {
    expect(sortMediaStats(rows(), "title", "asc").map((row) => row.title)).toEqual(["Clip 1", "Clip 2", "Clip 10"]);
    expect(sortMediaStats(rows(), "sessionLikes", "desc")[0].id).toBe("b");
    expect(sortMediaStats(rows(), "sessionBookmarks", "desc")[0].id).toBe("a");
  });

  it("filters by kind and trimmed Thai title/description search", () => {
    expect(filterMediaStats(rows(), "image", " เมือง ").map((row) => row.id)).toEqual(["a"]);
    expect(filterMediaStats(rows(), "all", "CLIP")).toHaveLength(3);
    expect(filterMediaStats(rows(), "video", "สวน")).toHaveLength(0);
  });

  it("summarizes only supplied/filtered rows", () => {
    expect(summarizeMediaStats(filterMediaStats(rows(), "image", ""))).toEqual({ count: 2, images: 2, videos: 0, bytes: 10900 });
    expect(summarizeMediaStats([])).toEqual({ count: 0, images: 0, videos: 0, bytes: 0 });
  });

  it("marks the total unknown rather than silently zeroing an invalid file size", () => {
    expect(summarizeMediaStats([...rows(), { ...rows()[0], size: -1 }]).bytes).toBeNull();
    expect(summarizeMediaStats([{ ...rows()[0], size: NaN }]).bytes).toBeNull();
  });

  it("merges pagination by ID and updates repeated metadata", () => {
    const updated = { ...items[0], title: "updated" };
    expect(mergeStatsItems(items.slice(0, 2), [updated, items[2]])).toEqual([updated, items[1], items[2]]);
  });

  it("projects only allowed metadata, not delete tokens or private information", () => {
    const incoming = { ...items[0], deleteToken: "test-only-secret", privateEmail: "private@example.test" };
    const result = toMediaStatsRows([incoming], new Set(), new Set())[0];
    expect(result).not.toHaveProperty("deleteToken");
    expect(result).not.toHaveProperty("privateEmail");
  });

  it("puts invalid dates last in either sort direction", () => {
    const input = [...rows(), { ...rows()[0], id: "invalid", createdAt: "invalid" }];
    expect(sortMediaStats(input, "createdAt", "asc").at(-1)?.id).toBe("invalid");
    expect(sortMediaStats(input, "createdAt", "desc").at(-1)?.id).toBe("invalid");
  });

  it("formats byte units and does not turn unavailable data into zero", () => {
    expect(formatStatsBytes(0)).toBe("0 B");
    expect(formatStatsBytes(1024)).toBe("1.0 KiB");
    expect(formatStatsBytes(1048576)).toBe("1.00 MiB");
    expect(formatStatsBytes(NaN)).toBe("—");
  });
});
