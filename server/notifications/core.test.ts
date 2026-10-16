import { describe, expect, it } from "vitest";
import { buildNotificationRecipients } from "./core";

describe("notification recipient selection", () => {
  it("notifies a different post owner for a top-level comment", () => {
    expect(buildNotificationRecipients(7, 3, null, false)).toEqual([
      { recipientId: 3, kind: "comment" },
    ]);
  });

  it("notifies the owner and addressed author once each for a reply", () => {
    expect(buildNotificationRecipients(7, 3, 5, true)).toEqual([
      { recipientId: 3, kind: "reply" },
      { recipientId: 5, kind: "reply" },
    ]);
  });

  it("excludes the actor and deduplicates an owner who is also the target author", () => {
    expect(buildNotificationRecipients(7, 7, 3, true)).toEqual([
      { recipientId: 3, kind: "reply" },
    ]);
    expect(buildNotificationRecipients(7, 3, 3, true)).toEqual([
      { recipientId: 3, kind: "reply" },
    ]);
    expect(buildNotificationRecipients(7, 7, 7, false)).toEqual([]);
  });

  it("ignores absent or invalid recipient identifiers", () => {
    expect(buildNotificationRecipients(7, null, undefined, true)).toEqual([]);
    expect(buildNotificationRecipients(0, 3, 5, true)).toEqual([]);
    expect(buildNotificationRecipients(7, -1, 1.5, false)).toEqual([]);
  });
});
