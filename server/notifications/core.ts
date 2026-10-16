import type { NotificationKind } from "../../shared/notifications";

export interface NotificationRecipient {
  recipientId: number;
  kind: NotificationKind;
}

/**
 * Select the post owner and, for replies, the addressed comment author.
 * The actor is excluded and repeated recipients are emitted exactly once.
 */
export function buildNotificationRecipients(
  actorId: number,
  postOwnerId: number | null | undefined,
  targetAuthorId: number | null | undefined,
  isReply: boolean
): NotificationRecipient[] {
  if (!Number.isSafeInteger(actorId) || actorId <= 0) return [];

  const kind: NotificationKind = isReply ? "reply" : "comment";
  const seen = new Set<number>([actorId]);
  const recipients: NotificationRecipient[] = [];
  for (const candidate of [postOwnerId, targetAuthorId]) {
    if (
      typeof candidate !== "number" ||
      !Number.isSafeInteger(candidate) ||
      candidate <= 0 ||
      seen.has(candidate)
    )
      continue;
    seen.add(candidate);
    recipients.push({ recipientId: candidate, kind });
  }
  return recipients;
}
