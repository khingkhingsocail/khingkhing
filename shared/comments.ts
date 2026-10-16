import { z } from "zod";
export const MAX_COMMENT_LENGTH = 1000;
export const commentInput = z
  .object({
    clientId: z.string().uuid(),
    replyToId: z.number().int().positive().max(2147483647).nullable().default(null),
    text: z
      .string()
      .transform(value => value.replace(/\r\n?/g, "\n").trim())
      .refine(
        value =>
          Array.from(value).length > 0 &&
          Array.from(value).length <= MAX_COMMENT_LENGTH,
        "ความคิดเห็นต้องมี 1–1000 อักขระ"
      )
      .refine(
        value => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value),
        "ความคิดเห็นมีอักขระที่ไม่รองรับ"
      ),
  })
  .strict();
export interface PublicComment {
  id: number;
  mediaId: string;
  isMine: boolean;
  authorName: string;
  text: string;
  createdAt: string;
  parentId: number | null;
  replyToName: string | null;
  deleted: boolean;
  replyCount: number;
}
export interface CommentPage {
  comments: PublicComment[];
  total: number;
  nextCursor: number | null;
}
export interface ReplyPage {
  replies: PublicComment[];
  total: number;
  nextCursor: number | null;
}
export function commentAuthorName(name: string | null | undefined) {
  const cleaned = (name ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return cleaned && !cleaned.includes("@")
    ? Array.from(cleaned).slice(0, 60).join("")
    : "สมาชิกขิงขิง";
}
