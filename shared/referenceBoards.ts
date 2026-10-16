import { arenaBoards, type ArenaBoard } from "./arena";

// Reference-only metrics must never silently become monthly competition boards.
export const referenceBoards: ArenaBoard[] = [
  ...arenaBoards,
  {
    key: "ref:sports:100m-women",
    category: "sports",
    metric: "100m-women",
    title: "วิ่ง 100 เมตร · หญิง",
    unit: "วินาที",
    direction: "lower",
  },
  {
    key: "ref:sports:200m-women",
    category: "sports",
    metric: "200m-women",
    title: "วิ่ง 200 เมตร · หญิง",
    unit: "วินาที",
    direction: "lower",
  },
  {
    key: "ref:sports:pole-vault-men",
    category: "sports",
    metric: "pole-vault-men",
    title: "กระโดดค้ำถ่อ · ชาย",
    unit: "เมตร",
    direction: "higher",
  },
  {
    key: "ref:sports:marathon-men",
    category: "sports",
    metric: "marathon-men",
    title: "มาราธอน · ชาย",
    unit: "วินาที",
    direction: "lower",
  },
  {
    key: "ref:sports:olympic-medals",
    category: "sports",
    metric: "olympic-medals",
    title: "เหรียญโอลิมปิกรวม · ทุกชนิดกีฬา",
    unit: "เหรียญ",
    direction: "higher",
  },
  {
    key: "ref:sports:olympic-gold",
    category: "sports",
    metric: "olympic-gold",
    title: "เหรียญทองโอลิมปิก · ทุกชนิดกีฬา",
    unit: "เหรียญทอง",
    direction: "higher",
  },
  {
    key: "ref:sports:grand-slam-women",
    category: "sports",
    metric: "grand-slam-women",
    title: "แกรนด์สแลมเดี่ยว · หญิง",
    unit: "แชมป์",
    direction: "higher",
  },
  {
    key: "ref:sports:grand-slam-men",
    category: "sports",
    metric: "grand-slam-men",
    title: "แกรนด์สแลมเดี่ยว · ชาย",
    unit: "แชมป์",
    direction: "higher",
  },
  {
    key: "ref:sports:international-goals-men",
    category: "sports",
    metric: "international-goals-men",
    title: "ประตูทีมชาติชุดใหญ่ · ชาย",
    unit: "ประตู",
    direction: "higher",
  },
  {
    key: "ref:world:youtube-views",
    category: "world",
    metric: "youtube-views",
    title: "ยอดวิวรวมช่อง YouTube",
    unit: "วิว",
    direction: "higher",
  },
  {
    key: "ref:world:grammy-wins",
    category: "world",
    metric: "grammy-wins",
    title: "รางวัล GRAMMY · ชนะ",
    unit: "รางวัล",
    direction: "higher",
  },
  {
    key: "ref:world:grammy-nominations",
    category: "world",
    metric: "grammy-nominations",
    title: "รางวัล GRAMMY · เสนอชื่อ",
    unit: "ครั้ง",
    direction: "higher",
  },
];
export function referenceBoard(key: string) {
  return referenceBoards.find(board => board.key === key);
}
export function referenceScopeLabel(
  scope: "career-best" | "career-total" | "snapshot",
  day: string
) {
  return scope === "career-best"
    ? "สถิติดีที่สุดตลอดอาชีพ"
    : scope === "career-total"
      ? `ยอดสะสมที่แหล่งรายงาน ${day}`
      : `ข้อมูลวันที่ ${day}`;
}
