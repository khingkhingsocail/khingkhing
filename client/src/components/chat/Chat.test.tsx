import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ChatPage from "./ChatPage";
import ChatComposer from "./ChatComposer";
import ChatMedia from "./ChatMedia";
import { mergeChatMessages } from "../../lib/chat";
import type { ChatMessage } from "../../../../shared/chat";
const person = {
  userId: 1,
  displayName: "Tester",
  avatar: null,
  handle: null,
  arenaProfileId: null,
};
const message = (id: number, text: string): ChatMessage => ({
  id,
  roomId: "a".repeat(32),
  sender: person,
  text,
  clientId: "id",
  files: [],
  createdAt: "2026-10-08T00:00:00Z",
});
describe("chat frontend privacy and rendering", () => {
  it("does not fake an authenticated user during initial render", () => {
    const html = renderToStaticMarkup(<ChatPage />);
    expect(html).toContain("กำลังยืนยันบัญชีแชท");
    expect(html).toContain("manus-no-record");
    expect(html).not.toContain("Tester");
  });
  it("composer has attachment control privacy notice length cap and disabled empty send", () => {
    const html = renderToStaticMarkup(
      <ChatComposer
        roomId={"a".repeat(32)}
        onSent={() => {}}
        onForbidden={() => {}}
      />
    );
    expect(html).toContain("แนบรูปภาพหรือวิดีโอ");
    expect(html.toLowerCase()).toContain('maxlength="2000"');
    expect(html).toContain("ไม่ขึ้นฟีด/ไม่ส่ง AI");
    expect(html).toContain("disabled");
    expect(html).toContain("manus-no-record");
  });
  it("private media does not emit publicly fetchable image or video source URL", () => {
    const html = renderToStaticMarkup(
      <ChatMedia
        file={{
          id: "b".repeat(32),
          filename: "private.jpg",
          kind: "image",
          mimeType: "image/jpeg",
          size: 100,
        }}
      />
    );
    expect(html).toContain("private.jpg");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("/api/chat/files");
  });
  it("merges history and polls by message id without duplicates and keeps order", () => {
    const result = mergeChatMessages(
      [message(3, "old"), message(2, "earlier")],
      [message(3, "updated"), message(4, "new")]
    );
    expect(result.map(m => m.id)).toEqual([2, 3, 4]);
    expect(result[1].text).toBe("updated");
  });
});

import { mergeChatRooms } from "../../lib/chat";
import type { ChatRoom } from "../../../../shared/chat";
it("keeps old loaded rooms when polling updates newest page and does not duplicate room ids", () => {
  const base = {
    kind: "group" as const,
    title: "room",
    ownerUserId: 1,
    category: null,
    boardKey: null,
    period: null,
    state: "active" as const,
  };
  const old: ChatRoom = {
    ...base,
    id: "a".repeat(32),
    updatedAt: "2026-10-01T00:00:00.000Z",
  };
  const latest: ChatRoom = {
    ...base,
    id: "b".repeat(32),
    updatedAt: "2026-10-08T00:00:00.000Z",
  };
  const merged = mergeChatRooms(
    [latest, old],
    [{ ...latest, title: "updated" }]
  );
  expect(merged.map(room => room.id)).toEqual([latest.id, old.id]);
  expect(merged[0].title).toBe("updated");
});
