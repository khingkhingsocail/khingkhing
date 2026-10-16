import { z } from "zod";
import type { ReviewStatus } from "./verification";

export const arenaCategories = [
  { id: "sports", label: "กีฬา", short: "SPORT" },
  { id: "stocks", label: "การลงทุน", short: "INVEST" },
  { id: "followers", label: "ผู้ติดตาม", short: "SOCIAL" },
  { id: "likes", label: "ยอดไลค์", short: "LIKES" },
  { id: "world", label: "สถิติอื่น / โลก", short: "RECORDS" },
] as const;
export type ArenaCategory = (typeof arenaCategories)[number]["id"];
export type ArenaDirection = "higher" | "lower";
export interface ArenaBoard {
  key: string;
  category: ArenaCategory;
  title: string;
  unit: string;
  direction: ArenaDirection;
  metric: string;
}
const platforms = ["TikTok", "YouTube", "Instagram", "Facebook"];
export const arenaBoards: ArenaBoard[] = [
  {
    key: "sports:run100",
    category: "sports",
    metric: "run100",
    title: "วิ่ง 100 เมตร",
    unit: "วินาที",
    direction: "lower",
  },
  {
    key: "sports:pushups",
    category: "sports",
    metric: "pushups",
    title: "วิดพื้นต่อเนื่อง",
    unit: "ครั้ง",
    direction: "higher",
  },
  {
    key: "stocks:return",
    category: "stocks",
    metric: "return",
    title: "ผลตอบแทนหุ้นรายเดือน",
    unit: "%",
    direction: "higher",
  },
  ...platforms.flatMap(platform => [
    {
      key: `followers:${platform.toLowerCase()}`,
      category: "followers" as const,
      metric: platform.toLowerCase(),
      title: `ผู้ติดตาม ${platform}`,
      unit: "คน",
      direction: "higher" as const,
    },
    {
      key: `likes:${platform.toLowerCase()}`,
      category: "likes" as const,
      metric: platform.toLowerCase(),
      title: `ไลค์รวม ${platform}`,
      unit: "ไลค์",
      direction: "higher" as const,
    },
  ]),
];

const safeText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine(
      s => !/[\u0000-\u001f\u007f]/.test(s),
      "ข้อความมีอักขระที่ไม่อนุญาต"
    );
export const profileInputSchema = z
  .object({
    displayName: safeText(60).refine(s => s.length > 0, "กรอกชื่อที่แสดง"),
    handle: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9_]{3,24}$/, "ชื่อผู้ใช้ใช้ a-z, 0-9, _ จำนวน 3–24 ตัว"),
    bio: safeText(160).default(""),
    avatar: z.string().max(280000).nullable().default(null),
  })
  .strict();
export type ArenaProfileInput = z.infer<typeof profileInputSchema>;

export function validEvidenceUrl(value: string): boolean {
  if (!value) return true;
  try {
    const u = new URL(value);
    return (
      ["https:", "http:"].includes(u.protocol) &&
      !u.username &&
      !u.password &&
      u.hostname.includes(".")
    );
  } catch {
    return false;
  }
}
export function validMonth(value: string): boolean {
  return (
    /^\d{4}-(0[1-9]|1[0-2])$/.test(value) &&
    Number(value.slice(0, 4)) >= 2000 &&
    Number(value.slice(0, 4)) <= 2100
  );
}
export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}
export const entryInputSchema = z
  .object({
    profileId: z.string().regex(/^[a-f0-9]{32}$/),
    boardKey: z.string().max(80),
    value: z.number().finite().min(-1000000).max(1000000000000),
    period: z.string().refine(validMonth, "เดือนต้องเป็น YYYY-MM"),
    observedAt: z.string().refine(validDate, "วันที่สถิติไม่ถูกต้อง"),
    evidenceUrl: z
      .string()
      .trim()
      .max(500)
      .refine(
        validEvidenceUrl,
        "ลิงก์หลักฐานต้องเป็น HTTP(S) ไม่มีชื่อผู้ใช้หรือรหัสผ่าน"
      ),
    custom: z
      .object({
        title: safeText(60).refine(s => s.length > 0),
        unit: safeText(20).refine(s => s.length > 0),
        direction: z.enum(["higher", "lower"]),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (input.observedAt.slice(0, 7) !== input.period)
      ctx.addIssue({
        code: "custom",
        message: "วันที่สถิติต้องอยู่ในเดือนที่เลือก",
      });
    const today = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Bangkok",
    }).format(new Date());
    if (input.observedAt > today)
      ctx.addIssue({
        code: "custom",
        message: "วันที่สถิติต้องไม่อยู่ในอนาคต",
      });
    if (Number(input.value.toFixed(6)) !== input.value)
      ctx.addIssue({
        code: "custom",
        message: "รองรับทศนิยมไม่เกิน 6 ตำแหน่ง",
      });
    const board = arenaBoards.find(b => b.key === input.boardKey);
    if (input.boardKey === "custom") {
      if (!input.custom)
        ctx.addIssue({
          code: "custom",
          message: "กรอกชื่อสถิติ หน่วย และทิศทาง",
        });
    } else if (!board && !/^world:[a-f0-9]{32}$/.test(input.boardKey)) {
      ctx.addIssue({ code: "custom", message: "ไม่พบหมวดการแข่งขัน" });
    }
    if (board && board.category !== "stocks" && input.value < 0)
      ctx.addIssue({ code: "custom", message: "สถิตินี้ต้องไม่ติดลบ" });
    if (board?.metric === "run100" && input.value <= 0)
      ctx.addIssue({ code: "custom", message: "เวลาวิ่งต้องมากกว่าศูนย์" });
    if (
      board &&
      (["followers", "likes"].includes(board.category) ||
        board.metric === "pushups") &&
      !Number.isInteger(input.value)
    )
      ctx.addIssue({ code: "custom", message: "จำนวนต้องเป็นเลขเต็ม" });
  });
export type ArenaEntryInput = z.infer<typeof entryInputSchema>;
export interface ArenaProfile {
  id: string;
  displayName: string;
  handle: string;
  bio: string;
  avatar: string | null;
  createdAt: string;
}
export interface ArenaEntry {
  id: string;
  profileId: string;
  boardKey: string;
  title: string;
  category: ArenaCategory;
  unit: string;
  direction: ArenaDirection;
  value: number;
  period: string;
  observedAt: string;
  evidenceUrl: string;
  verification: "self-reported" | "verified";
  reviewStatus: ReviewStatus;
  revision: string;
  updatedAt: string;
}
export interface ArenaRankedEntry extends ArenaEntry {
  profile: ArenaProfile;
  rank: number;
}
export interface ArenaLeaderboard {
  items: ArenaRankedEntry[];
  total: number;
  board: ArenaBoard;
}

export function rankArenaEntries<
  T extends { value: number; profileId: string },
>(entries: readonly T[], direction: ArenaDirection): (T & { rank: number })[] {
  const sorted = entries
    .filter(e => Number.isFinite(e.value))
    .slice()
    .sort(
      (a, b) =>
        (direction === "higher" ? b.value - a.value : a.value - b.value) ||
        a.profileId.localeCompare(b.profileId)
    );
  let rank = 0;
  return sorted.map((entry, index) => {
    if (index === 0 || entry.value !== sorted[index - 1].value)
      rank = index + 1;
    return { ...entry, rank };
  });
}
export function rankTier(
  rank: number
): "champion" | "challenger" | "elite" | "contender" {
  return rank === 1
    ? "champion"
    : rank === 2
      ? "challenger"
      : rank === 3
        ? "elite"
        : "contender";
}
