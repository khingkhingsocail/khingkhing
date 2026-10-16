import { z } from "zod";
import { rankArenaEntries, validDate, type ArenaCategory } from "./arena";
import { referenceBoard } from "./referenceBoards";

const day = z.string().refine(validDate);
const safeUrl = z
  .string()
  .url()
  .max(1000)
  .refine(value => {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  });
export const arenaReferenceSchema = z
  .object({
    id: z.string().regex(/^[a-f0-9]{32}$/),
    personId: z.string().regex(/^[a-z0-9-]{3,80}$/),
    name: z.string().trim().min(1).max(100),
    boardKey: z.string().refine(key => !!referenceBoard(key)),
    value: z.number().finite().nonnegative().max(1e12),
    displayValue: z.string().trim().min(1).max(80),
    observedAt: day,
    eventDate: z.union([z.literal(""), day]),
    retrievedAt: z.string().datetime(),
    scope: z.enum(["career-best", "career-total", "snapshot"]),
    approximate: z.boolean(),
    sourceUrl: safeUrl,
    sourceTitle: z.string().trim().min(1).max(300),
    sourceType: z.enum(["official", "data-provider", "report"]),
    excerpt: z.string().trim().min(1).max(4000),
    notes: z.string().max(4000),
  })
  .strict()
  .superRefine((record, ctx) => {
    const board = referenceBoard(record.boardKey);
    if (!board) return;
    if (
      (["followers", "likes"].includes(board.category) ||
        [
          "olympic-medals",
          "olympic-gold",
          "grand-slam-men",
          "grand-slam-women",
          "international-goals-men",
          "youtube-views",
          "grammy-wins",
          "grammy-nominations",
        ].includes(board.metric)) &&
      !Number.isInteger(record.value)
    )
      ctx.addIssue({
        code: "custom",
        message: "Counts must be integers",
      });
    const cumulativeMetrics = [
      "olympic-medals",
      "olympic-gold",
      "grand-slam-men",
      "grand-slam-women",
      "international-goals-men",
      "grammy-wins",
      "grammy-nominations",
    ];
    if (
      cumulativeMetrics.includes(board.metric) &&
      record.scope !== "career-total"
    )
      ctx.addIssue({
        code: "custom",
        message: "Cumulative metrics require career-total scope",
      });
    if (
      (["followers", "likes"].includes(board.category) ||
        board.metric === "youtube-views") &&
      record.scope !== "snapshot"
    )
      ctx.addIssue({
        code: "custom",
        message: "Platform statistics require dated snapshots",
      });
    if (
      record.scope === "career-best" &&
      (board.category !== "sports" || !record.eventDate)
    )
      ctx.addIssue({
        code: "custom",
        message: "Career best requires sports performance date",
      });
    if (record.scope !== "career-best" && record.eventDate)
      ctx.addIssue({
        code: "custom",
        message:
          "Cumulative or snapshot records must not claim a single event date",
      });
    if (
      [
        "run100",
        "100m-women",
        "200m-women",
        "marathon-men",
        "pole-vault-men",
      ].includes(board.metric) &&
      record.value <= 0
    )
      ctx.addIssue({ code: "custom", message: "Time must be positive" });
    if (
      record.observedAt > record.retrievedAt.slice(0, 10) ||
      (record.eventDate && record.eventDate > record.observedAt)
    )
      ctx.addIssue({ code: "custom", message: "Dates inconsistent" });
  });
export type ArenaReference = z.infer<typeof arenaReferenceSchema>;
export interface ArenaReferencePage {
  items: ArenaReference[];
  total: number;
}
export function referenceCategory(record: ArenaReference): ArenaCategory {
  return referenceBoard(record.boardKey)!.category;
}
export function referenceGroup(record: ArenaReference) {
  return `${record.boardKey}|${record.scope}|${record.scope === "career-best" ? "career" : record.observedAt}`;
}
export function rankReferences(
  records: readonly ArenaReference[],
  group: string
) {
  const matching = records.filter(r => referenceGroup(r) === group);
  const board = referenceBoard(matching[0]?.boardKey ?? "");
  if (!board) return [];
  const unique = [...new Map(matching.map(r => [r.personId, r])).values()];
  return rankArenaEntries(
    unique.map(r => ({ ...r, profileId: r.personId })),
    board.direction
  );
}
