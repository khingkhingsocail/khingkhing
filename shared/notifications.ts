export type NotificationKind = "comment" | "reply";

/** A notification projection safe to expose to its authenticated recipient. */
export interface PublicNotification {
  id: number;
  kind: NotificationKind;
  actorName: string;
  text: string;
  mediaTitle: string;
  mediaId: string;
  commentId: number;
  rootId: number;
  createdAt: string;
  readAt: string | null;
}

export interface NotificationPage {
  items: PublicNotification[];
  nextCursor: number | null;
  unread: number;
  /** Highest visible notification id observed by this response, for snapshot read-all. */
  watermark: number | null;
}

export interface NotificationReadResult {
  readAt: string;
}

export const NOTIFICATION_PAGE_SIZE = 30;
export const MAX_NOTIFICATION_ID = 2147483647;
