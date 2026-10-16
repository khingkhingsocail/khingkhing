import { describe, expect, it } from "vitest";
import {
  mergeNotificationItems,
  NotificationsApiError,
  fetchNotifications,
  markNotificationRead,
} from "./notifications";
import type { PublicNotification } from "../../../shared/notifications";

const item = (id: number): PublicNotification => ({
  id,
  kind: "comment",
  actorName: "ผู้สร้าง",
  text: `ข้อความ ${id}`,
  mediaTitle: "ผลงาน",
  mediaId: "a".repeat(32),
  commentId: id,
  rootId: id,
  createdAt: new Date(0).toISOString(),
  readAt: null,
});

describe("notification client helpers", () => {
  it("merges page items without duplicates in newest-first order", () => {
    expect(
      mergeNotificationItems(
        [item(9), item(8)],
        [{ ...item(8), text: "ข้อความที่อัปเดต" }, item(7)]
      ).map(value => [value.id, value.text])
    ).toEqual([
      [9, "ข้อความ 9"],
      [8, "ข้อความที่อัปเดต"],
      [7, "ข้อความ 7"],
    ]);
  });

  it("rejects malformed cursors and notification IDs before making requests", async () => {
    expect(() => fetchNotifications(0)).toThrow(NotificationsApiError);
    expect(() => markNotificationRead(2147483648)).toThrow(NotificationsApiError);
  });
});
