import { z } from "zod";

export const publicMediaIdSchema = z.string().regex(/^[a-f0-9]{32}$/);
export const mediaViewInputSchema = z
  .object({ eventId: z.string().uuid() })
  .strict();
export const mediaViewResultSchema = z.object({
  mediaId: publicMediaIdSchema,
  viewCount: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  counted: z.boolean(),
});
export type MediaViewResult = z.infer<typeof mediaViewResultSchema>;
export const MEDIA_VIEW_SECONDS = 2;
export function validViewCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
