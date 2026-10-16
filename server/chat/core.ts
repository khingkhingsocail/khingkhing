import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import {
  chatAccounts,
  chatMembers,
  chatRooms,
  arenaEntries,
  arenaProfiles,
} from "../../drizzle/schema";
import { getDb } from "../db";
import type { ChatPerson } from "../../shared/chat";
export type ChatDB = NonNullable<Awaited<ReturnType<typeof getDb>>>;
export type ChatReader = Pick<ChatDB, "select">;
export class ChatError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}
export async function requireChatMember(
  db: ChatReader,
  roomId: string,
  userId: number,
  invited = false
) {
  if (!/^[a-f0-9]{32}$/.test(roomId)) throw new ChatError(404, "ไม่พบห้องแชท");
  const [row] = await db
    .select({ room: chatRooms, member: chatMembers })
    .from(chatRooms)
    .innerJoin(
      chatMembers,
      and(eq(chatMembers.roomId, chatRooms.id), eq(chatMembers.userId, userId))
    )
    .where(eq(chatRooms.id, roomId))
    .limit(1);
  if (
    !row ||
    !(
      row.member.state === "active" ||
      (invited && row.member.state === "invited")
    )
  )
    throw new ChatError(
      403,
      "ไม่มีสิทธิ์เข้าถึงห้องนี้ หรือยังไม่ได้ตอบรับคำเชิญ"
    );
  return row;
}
export const personFields = {
  userId: chatAccounts.userId,
  displayName: chatAccounts.displayName,
  arenaProfileId: chatAccounts.arenaProfileId,
  handle: arenaProfiles.handle,
  avatar: arenaProfiles.avatar,
};
export async function chatPerson(
  db: ChatReader,
  userId: number
): Promise<ChatPerson> {
  const [person] = await db
    .select(personFields)
    .from(chatAccounts)
    .leftJoin(arenaProfiles, eq(chatAccounts.arenaProfileId, arenaProfiles.id))
    .where(eq(chatAccounts.userId, userId))
    .limit(1);
  if (!person) throw new ChatError(404, "ผู้ใช้นี้ยังไม่เปิดใช้แชท");
  return person;
}
export async function eligibleForChannel(
  db: ChatReader,
  profileId: string | null,
  input: { category: string; boardKey: string | null; period: string }
) {
  if (!profileId) return false;
  const [entry] = await db
    .select({ id: arenaEntries.id })
    .from(arenaEntries)
    .where(
      and(
        eq(arenaEntries.profileId, profileId),
        eq(
          arenaEntries.category,
          input.category as typeof arenaEntries.$inferSelect.category
        ),
        eq(arenaEntries.period, input.period),
        input.boardKey ? eq(arenaEntries.boardKey, input.boardKey) : undefined
      )
    )
    .limit(1);
  return Boolean(entry);
}
export function chatPayloadHash(
  text: string,
  files: { mimeType: string; size: number; data: Buffer; filename?: string }[]
) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        text,
        files.map(file => [
          file.filename ?? "",
          file.mimeType,
          file.size,
          createHash("sha256").update(file.data).digest("hex"),
        ]),
      ])
    )
    .digest("hex");
}
export function normalizeChatFilename(name: string) {
  if (Array.from(name).every(char => char.codePointAt(0)! <= 255)) {
    const decoded = Buffer.from(name, "latin1").toString("utf8");
    if (!decoded.includes("\uFFFD")) name = decoded;
  }
  return (
    name
      .normalize("NFC")
      .replace(/[\x00-\x1f\x7f]/g, "")
      .slice(0, 100) || "chat-file"
  );
}

export function retryableChatConflict(cause: unknown): boolean {
  let current = cause;
  for (
    let depth = 0;
    depth < 5 && current && typeof current === "object";
    depth++
  ) {
    const error = current as { code?: string; errno?: number; cause?: unknown };
    if (
      ["ER_DUP_ENTRY", "ER_LOCK_DEADLOCK", "ER_LOCK_WAIT_TIMEOUT"].includes(
        error.code ?? ""
      ) ||
      [1062, 1213, 1205].includes(error.errno ?? 0)
    )
      return true;
    current = error.cause;
  }
  return false;
}
type ChatTransaction = Parameters<Parameters<ChatDB["transaction"]>[0]>[0];
export async function retryChatTransaction<T>(
  db: ChatDB,
  work: (tx: ChatTransaction) => Promise<T>
): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await db.transaction(work);
    } catch (cause) {
      if (attempt === 2 || !retryableChatConflict(cause)) throw cause;
      await new Promise(resolve => setTimeout(resolve, 10 * (attempt + 1)));
    }
  }
  throw new ChatError(503, "สร้างห้องไม่สำเร็จ");
}
