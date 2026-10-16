import { z } from "zod";
import { arenaCategories, type ArenaCategory } from "./arena";
export const chatId = z.string().regex(/^[a-f0-9]{32}$/);
export const chatAccountInput = z
  .object({
    displayName: z.string().trim().min(2).max(60),
    arenaProfileId: chatId.nullable().default(null),
  })
  .strict();
export const createChatInput = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("direct"),
      recipientId: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("group"),
      title: z.string().trim().min(2).max(80),
      memberIds: z.array(z.number().int().positive()).min(1).max(49),
    })
    .strict(),
]);
export const channelInput = z
  .object({
    category: z.enum(["sports", "stocks", "followers", "likes", "world"]),
    boardKey: z.string().trim().min(1).max(80).nullable().default(null),
    period: z.string().regex(/^\d{4}-\d{2}$/),
  })
  .strict();
export const chatMessageInput = z
  .object({
    clientId: z.string().uuid(),
    text: z.string().max(2000).default(""),
  })
  .strict();
export interface ChatPerson {
  userId: number;
  displayName: string;
  arenaProfileId: string | null;
  handle: string | null;
  avatar: string | null;
}
export interface ChatRoom {
  id: string;
  kind: "direct" | "group" | "channel";
  title: string;
  ownerUserId: number;
  category: ArenaCategory | null;
  boardKey: string | null;
  period: string | null;
  state: "invited" | "active" | "left";
  updatedAt: string;
}
export interface ChatRoomCursor {
  time: string;
  id: string;
}
export interface ChatFile {
  id: string;
  filename: string;
  kind: "image" | "video";
  mimeType: string;
  size: number;
}
export interface ChatMessage {
  id: number;
  roomId: string;
  sender: ChatPerson;
  text: string;
  clientId: string;
  files: ChatFile[];
  createdAt: string;
}
export interface ChatChannel {
  category: ArenaCategory;
  boardKey: string | null;
  period: string;
  title: string;
  eligible: boolean;
}
export interface ChatTarget {
  profileId?: string;
  category?: ArenaCategory;
  boardKey?: string;
  period?: string;
}
export const chatCategoryName = (category: ArenaCategory) =>
  arenaCategories.find(item => item.id === category)?.label ?? category;
export function directChatKey(a: number, b: number) {
  if (a === b) throw new Error("เลือกผู้ใช้อื่นเพื่อคุยส่วนตัว");
  return [a, b].sort((x, y) => x - y).join(":");
}
export function channelChatKey(input: z.infer<typeof channelInput>) {
  return JSON.stringify([input.category, input.boardKey, input.period]);
}
export function canReadChat(state: string | undefined) {
  return state === "active";
}
