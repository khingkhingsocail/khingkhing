import { z } from "zod";

export const rankingTargetSchema = z
  .object({
    kind: z.enum([
      "community-board",
      "community-entry",
      "reference-group",
      "reference-entry",
      "investment-group",
      "investment-entity",
    ]),
    key: z
      .string()
      .min(1)
      .max(600)
      .refine(value => !/[\u0000-\u001f\u007f]/.test(value)),
  })
  .strict();
export type RankingTarget = z.infer<typeof rankingTargetSchema>;
export const rankingReadSchema = z
  .object({ targets: z.array(rankingTargetSchema).min(1).max(100) })
  .strict();
export const rankingOpenSchema = z
  .object({ target: rankingTargetSchema, eventId: z.string().uuid() })
  .strict();
export const rankingCountsSchema = z
  .object({
    counts: z
      .array(
        z
          .object({
            id: z.string(),
            total: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
          })
          .strict()
      )
      .max(100),
  })
  .strict();
export function rankingTargetId(target: RankingTarget) {
  return JSON.stringify([target.kind, target.key]);
}
export function communityBoardTarget(
  board: string,
  period: string
): RankingTarget {
  return { kind: "community-board", key: `${board}|${period}` };
}
