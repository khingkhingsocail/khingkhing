import express, { type Express, type Request, type Response } from "express";
import multer from "multer";
import { randomBytes } from "node:crypto";
import { and, desc, eq, inArray, like, lt, gt, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  chatAccounts,
  chatRooms,
  chatMembers,
  chatMessages,
  chatFiles,
  arenaProfiles,
  arenaEntries,
} from "../../drizzle/schema";
import {
  chatAccountInput,
  createChatInput,
  channelInput,
  chatMessageInput,
  chatCategoryName,
  directChatKey,
  channelChatKey,
  type ChatRoom,
  type ChatMessage,
} from "../../shared/chat";
import { arenaBoards, validMonth, arenaCategories } from "../../shared/arena";
import { getDb } from "../db";
import { sdk, type AuthenticatedUser } from "../_core/sdk";
import { arenaTokenMatches } from "../arena";
import { inspectEvidence } from "../verification/media";
import {
  ChatError,
  requireChatMember,
  personFields,
  chatPerson,
  eligibleForChannel,
  chatPayloadHash,
  normalizeChatFilename,
  type ChatDB,
  type ChatReader,
  retryChatTransaction,
} from "./core";
const id = () => randomBytes(16).toString("hex");
const fileFields = {
  id: chatFiles.id,
  messageId: chatFiles.messageId,
  filename: chatFiles.filename,
  kind: chatFiles.kind,
  mimeType: chatFiles.mimeType,
  size: chatFiles.size,
};
type Actor = {
  db: ChatDB;
  user: AuthenticatedUser;
  account: typeof chatAccounts.$inferSelect | null;
};
function actor(res: Response, requireAccount = true): Actor {
  const a = res.locals.chat as Actor;
  if (requireAccount && !a.account)
    throw new ChatError(428, "ตั้งชื่อแชทก่อนใช้งาน");
  return a;
}
function route(fn: (req: Request, res: Response) => Promise<unknown>) {
  return (req: Request, res: Response) => {
    void fn(req, res).catch(cause => {
      if (!res.headersSent)
        res.status(cause instanceof ChatError ? cause.status : 503).json({
          error:
            cause instanceof ChatError
              ? cause.message
              : "ระบบแชทไม่พร้อม กรุณาลองใหม่",
        });
    });
  };
}
function parse<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success)
    throw new ChatError(
      400,
      result.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง"
    );
  return result.data;
}
function roomOutput(
  room: typeof chatRooms.$inferSelect,
  state: typeof chatMembers.$inferSelect.state
): ChatRoom {
  return {
    id: room.id,
    kind: room.kind,
    title: room.title,
    ownerUserId: room.ownerUserId,
    category: room.category,
    boardKey: room.boardKey,
    period: room.period,
    state,
    updatedAt: room.updatedAt.toISOString(),
  };
}
async function projectMessages(
  db: ChatReader,
  rows: (typeof chatMessages.$inferSelect)[]
): Promise<ChatMessage[]> {
  if (!rows.length) return [];
  const files = await db
    .select(fileFields)
    .from(chatFiles)
    .where(
      inArray(
        chatFiles.messageId,
        rows.map(row => row.id)
      )
    );
  const people = await db
    .select(personFields)
    .from(chatAccounts)
    .leftJoin(arenaProfiles, eq(chatAccounts.arenaProfileId, arenaProfiles.id))
    .where(
      inArray(chatAccounts.userId, [...new Set(rows.map(row => row.senderId))])
    );
  return rows.map(row => ({
    id: row.id,
    roomId: row.roomId,
    sender: people.find(p => p.userId === row.senderId)!,
    text: row.text,
    clientId: row.clientId,
    files: files
      .filter(f => f.messageId === row.id)
      .map(({ messageId, ...file }) => file),
    createdAt: row.createdAt.toISOString(),
  }));
}
export function registerChatRoutes(app: Express) {
  const router = express.Router();
  const limits = new Map<
    number,
    { until: number; reads: number; writes: number }
  >();
  let decoding = 0;
  router.use((_req, res, next) => {
    res.set({
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    });
    next();
  });
  router.use((req, res, next) => {
    void (async () => {
      let user: AuthenticatedUser;
      try {
        user = await sdk.authenticateRequest(req);
      } catch {
        throw new ChatError(401, "เข้าสู่ระบบก่อนใช้แชทส่วนตัว");
      }
      if (user.isCron || user.id < 1)
        throw new ChatError(401, "ต้องใช้บัญชีผู้ใช้จริง");
      const write = !["GET", "HEAD"].includes(req.method);
      if (write && req.get("x-khing-chat") !== "1")
        throw new ChatError(403, "คำขอแชทต้องมาจากแอปขิงขิง");
      const now = Date.now();
      for (const [key, v] of limits) if (v.until < now) limits.delete(key);
      const rate = limits.get(user.id) ?? {
        until: now + 60000,
        reads: 0,
        writes: 0,
      };
      if (
        limits.size > 10000 ||
        (write && rate.writes >= 30) ||
        (!write && rate.reads >= 120)
      )
        throw new ChatError(429, "ส่งคำขอบ่อยเกินไป รอสักครู่");
      if (write) rate.writes++;
      else rate.reads++;
      limits.set(user.id, rate);
      const db = await getDb();
      if (!db) throw new ChatError(503, "ฐานข้อมูลยังไม่พร้อม");
      const [account] = await db
        .select()
        .from(chatAccounts)
        .where(eq(chatAccounts.userId, user.id))
        .limit(1);
      res.locals.chat = { db, user, account: account ?? null };
      next();
    })().catch(cause =>
      res.status(cause instanceof ChatError ? cause.status : 503).json({
        error:
          cause instanceof ChatError
            ? cause.message
            : "ยืนยันบัญชีแชทไม่สำเร็จ",
      })
    );
  });
  router.use(express.json({ limit: "16kb" }));
  router.get(
    "/me",
    route(async (_req, res) => {
      const a = actor(res, false);
      return res.json({
        userId: a.user.id,
        account: a.account ? await chatPerson(a.db, a.user.id) : null,
      });
    })
  );
  router.post(
    "/me",
    route(async (req, res) => {
      const { db, user } = actor(res, false);
      const input = parse(chatAccountInput, req.body);
      try {
        await db.transaction(async tx => {
          if (input.arenaProfileId) {
            const [profile] = await tx
              .select()
              .from(arenaProfiles)
              .where(eq(arenaProfiles.id, input.arenaProfileId))
              .for("update")
              .limit(1);
            if (
              !profile ||
              !arenaTokenMatches(
                req.get("x-arena-token") ?? "",
                profile.editTokenHash
              )
            )
              throw new ChatError(403, "ไม่มีรหัสเจ้าของโปรไฟล์ Arena นี้");
            const [bound] = await tx
              .select()
              .from(chatAccounts)
              .where(eq(chatAccounts.arenaProfileId, input.arenaProfileId))
              .limit(1);
            if (bound && bound.userId !== user.id)
              throw new ChatError(409, "โปรไฟล์นี้ผูกกับบัญชีแชทอื่นแล้ว");
          }
          await tx
            .insert(chatAccounts)
            .values({ userId: user.id, ...input })
            .onDuplicateKeyUpdate({ set: input });
        });
      } catch (cause) {
        if (cause instanceof ChatError) throw cause;
        throw new ChatError(
          409,
          "ชื่อแชทหรือการผูกโปรไฟล์ขัดแย้ง กรุณาลองใหม่"
        );
      }
      return res.json({ account: await chatPerson(db, user.id) });
    })
  );
  router.get(
    "/people",
    route(async (req, res) => {
      const { db, user } = actor(res);
      const q = String(req.query.q ?? "").slice(0, 60);
      const profileId =
        typeof req.query.profileId === "string" ? req.query.profileId : null;
      const people = await db
        .select(personFields)
        .from(chatAccounts)
        .leftJoin(
          arenaProfiles,
          eq(chatAccounts.arenaProfileId, arenaProfiles.id)
        )
        .where(
          and(
            ne(chatAccounts.userId, user.id),
            profileId ? eq(chatAccounts.arenaProfileId, profileId) : undefined,
            q
              ? or(
                  like(
                    chatAccounts.displayName,
                    `%${q.replace(/[\\%_]/g, "\\$&")}%`
                  ),
                  like(
                    arenaProfiles.handle,
                    `%${q.replace(/[\\%_]/g, "\\$&")}%`
                  )
                )
              : undefined
          )
        )
        .orderBy(chatAccounts.displayName)
        .limit(50);
      return res.json({ people });
    })
  );
  router.get(
    "/rooms",
    route(async (req, res) => {
      const { db, user } = actor(res);
      const beforeTime =
        typeof req.query.beforeTime === "string" ? req.query.beforeTime : null;
      const beforeId =
        typeof req.query.beforeId === "string" ? req.query.beforeId : null;
      if (
        Boolean(beforeTime) !== Boolean(beforeId) ||
        (beforeId && !/^[a-f0-9]{32}$/.test(beforeId)) ||
        (beforeTime && !z.string().datetime().safeParse(beforeTime).success)
      )
        throw new ChatError(400, "cursor ห้องไม่ถูกต้อง");
      const date = beforeTime ? new Date(beforeTime) : null;
      const rows = await db
        .select({ room: chatRooms, member: chatMembers })
        .from(chatMembers)
        .innerJoin(chatRooms, eq(chatRooms.id, chatMembers.roomId))
        .where(
          and(
            eq(chatMembers.userId, user.id),
            ne(chatMembers.state, "left"),
            date && beforeId
              ? or(
                  lt(chatRooms.updatedAt, date),
                  and(eq(chatRooms.updatedAt, date), lt(chatRooms.id, beforeId))
                )
              : undefined
          )
        )
        .orderBy(desc(chatRooms.updatedAt), desc(chatRooms.id))
        .limit(51);
      const page = rows.slice(0, 50);
      const last = page.at(-1)?.room;
      return res.json({
        rooms: page.map(row => roomOutput(row.room, row.member.state)),
        nextCursor:
          rows.length > 50 && last
            ? { time: last.updatedAt.toISOString(), id: last.id }
            : null,
      });
    })
  );
  router.post(
    "/rooms",
    route(async (req, res) => {
      const { db, user } = actor(res);
      const input = parse(createChatInput, req.body);
      const recipients =
        input.kind === "direct"
          ? [input.recipientId]
          : [...new Set(input.memberIds)];
      if (recipients.includes(user.id))
        throw new ChatError(400, "เลือกผู้ใช้อื่น ไม่ต้องเลือกตัวเอง");
      const key =
        input.kind === "direct"
          ? directChatKey(user.id, input.recipientId)
          : null;
      let roomId = id();
      await retryChatTransaction(db, async tx => {
        // Lock creator to prevent duplicate creation/rate quota races.
        await tx
          .select()
          .from(chatAccounts)
          .where(eq(chatAccounts.userId, user.id))
          .for("update")
          .limit(1);
        const people = await tx
          .select({ id: chatAccounts.userId })
          .from(chatAccounts)
          .where(inArray(chatAccounts.userId, recipients));
        if (people.length !== recipients.length)
          throw new ChatError(400, "ผู้รับบางคนยังไม่เปิดใช้แชท");
        if (key) {
          const [existing] = await tx
            .select()
            .from(chatRooms)
            .where(eq(chatRooms.directKey, key))
            .for("update")
            .limit(1);
          if (existing) {
            const members = await tx
              .select()
              .from(chatMembers)
              .where(eq(chatMembers.roomId, existing.id));
            if (members.some(m => m.state === "left"))
              throw new ChatError(403, "อีกฝ่ายปฏิเสธหรือออกจากบทสนทนานี้แล้ว");
            roomId = existing.id;
            return;
          }
        }
        const owned = await tx
          .select({ id: chatRooms.id })
          .from(chatRooms)
          .where(
            and(
              eq(chatRooms.ownerUserId, user.id),
              ne(chatRooms.kind, "channel")
            )
          );
        if (owned.length >= 100)
          throw new ChatError(429, "สร้างห้องได้สูงสุด100ห้องต่อบัญชี");
        await tx.insert(chatRooms).values({
          id: roomId,
          kind: input.kind,
          title:
            input.kind === "group"
              ? input.title
              : `${(await chatPerson(tx, user.id)).displayName} ↔ ${(await chatPerson(tx, recipients[0])).displayName}`.slice(
                  0,
                  100
                ),
          ownerUserId: user.id,
          directKey: key,
        });
        await tx.insert(chatMembers).values([
          { roomId, userId: user.id, state: "active" as const },
          ...recipients.map(userId => ({
            roomId,
            userId,
            state: "invited" as const,
          })),
        ]);
      });
      return res.status(201).json({ roomId });
    })
  );
  router.get(
    "/channels",
    route(async (req, res) => {
      const { db, account } = actor(res);
      const period = String(req.query.period ?? "");
      if (!validMonth(period)) throw new ChatError(400, "เลือกเดือน YYYY-MM");
      const custom = await db
        .selectDistinct({
          key: arenaEntries.boardKey,
          title: arenaEntries.title,
          category: arenaEntries.category,
        })
        .from(arenaEntries)
        .where(eq(arenaEntries.category, "world"));
      const entries = account?.arenaProfileId
        ? await db
            .select({
              category: arenaEntries.category,
              boardKey: arenaEntries.boardKey,
            })
            .from(arenaEntries)
            .where(
              and(
                eq(arenaEntries.profileId, account.arenaProfileId),
                eq(arenaEntries.period, period)
              )
            )
        : [];
      return res.json({
        channels: [
          ...arenaCategories.map(item => ({
            category: item.id,
            boardKey: null,
            period,
            title: `${item.label} · ${period}`,
            eligible: entries.some(e => e.category === item.id),
          })),
          ...[...arenaBoards, ...custom].map(b => ({
            category: b.category,
            boardKey: b.key,
            period,
            title: `${b.title} · ${period}`,
            eligible: entries.some(e => e.boardKey === b.key),
          })),
        ],
      });
    })
  );
  router.post(
    "/channels/join",
    route(async (req, res) => {
      const { db, user, account } = actor(res);
      const input = parse(channelInput, req.body);
      if (
        !validMonth(input.period) ||
        !(await eligibleForChannel(db, account!.arenaProfileId, input))
      )
        throw new ChatError(
          403,
          "ผูกโปรไฟล์ Arena ที่ลงสถิติในหมวด/รายการและเดือนนี้ก่อนเข้าร่วม"
        );
      let channelTitle: string = chatCategoryName(input.category);
      if (input.boardKey) {
        channelTitle =
          arenaBoards.find(board => board.key === input.boardKey)?.title ??
          input.boardKey;
        if (input.boardKey.startsWith("world:")) {
          const [record] = await db
            .select({ title: arenaEntries.title })
            .from(arenaEntries)
            .where(eq(arenaEntries.boardKey, input.boardKey))
            .limit(1);
          channelTitle = record?.title ?? channelTitle;
        }
      }
      const key = channelChatKey(input);
      let roomId = id();
      await retryChatTransaction(db, async tx => {
        const [currentAccount] = await tx
          .select()
          .from(chatAccounts)
          .where(eq(chatAccounts.userId, user.id))
          .for("update")
          .limit(1);
        if (
          !currentAccount ||
          !(await eligibleForChannel(tx, currentAccount.arenaProfileId, input))
        )
          throw new ChatError(
            403,
            "สิทธิ์โปรไฟล์หรือสถิติเปลี่ยน กรุณาตรวจสอบก่อนเข้าร่วม"
          );
        const [existing] = await tx
          .select()
          .from(chatRooms)
          .where(eq(chatRooms.channelKey, key))
          .for("update")
          .limit(1);
        if (existing) roomId = existing.id;
        else {
          await tx.insert(chatRooms).values({
            id: roomId,
            kind: "channel",
            title: `${channelTitle} · ${input.period}`,
            ownerUserId: user.id,
            channelKey: key,
            ...input,
          });
        }
        await tx
          .insert(chatMembers)
          .values({ roomId, userId: user.id, state: "active" })
          .onDuplicateKeyUpdate({
            set: { state: "active", joinedAt: new Date() },
          });
      });
      return res.json({ roomId });
    })
  );
  router.get(
    "/rooms/:id",
    route(async (req, res) => {
      const { db, user } = actor(res);
      const { room, member } = await requireChatMember(
        db,
        req.params.id,
        user.id,
        true
      );
      const members =
        member.state === "active"
          ? await db
              .select({
                ...personFields,
                avatar: sql<null>`NULL`,
                state: chatMembers.state,
              })
              .from(chatMembers)
              .innerJoin(
                chatAccounts,
                eq(chatAccounts.userId, chatMembers.userId)
              )
              .leftJoin(
                arenaProfiles,
                eq(chatAccounts.arenaProfileId, arenaProfiles.id)
              )
              .where(
                and(
                  eq(chatMembers.roomId, room.id),
                  ne(chatMembers.state, "left")
                )
              )
              .limit(50)
          : [];
      return res.json({ room: roomOutput(room, member.state), members });
    })
  );
  router.post(
    "/rooms/:id/respond",
    route(async (req, res) => {
      const { db, user } = actor(res);
      const input = parse(z.object({ accept: z.boolean() }).strict(), req.body);
      await db.transaction(async tx => {
        await tx
          .select()
          .from(chatRooms)
          .where(eq(chatRooms.id, req.params.id))
          .for("update")
          .limit(1);
        const { member, room } = await requireChatMember(
          tx,
          req.params.id,
          user.id,
          true
        );
        if (member.state !== "invited")
          throw new ChatError(409, "คำเชิญนี้ถูกตอบแล้ว");
        if (room.kind === "channel")
          throw new ChatError(400, "ใช้ปุ่มเข้าห้องแข่งขัน");
        await tx
          .update(chatMembers)
          .set({
            state: input.accept ? "active" : "left",
            joinedAt: new Date(),
          })
          .where(eq(chatMembers.id, member.id));
      });
      return res.json({ ok: true });
    })
  );
  router.post(
    "/rooms/:id/leave",
    route(async (req, res) => {
      const { db, user } = actor(res);
      await db.transaction(async tx => {
        await tx
          .select()
          .from(chatRooms)
          .where(eq(chatRooms.id, req.params.id))
          .for("update")
          .limit(1);
        const { room, member } = await requireChatMember(
          tx,
          req.params.id,
          user.id
        );
        if (room.kind === "group" && room.ownerUserId === user.id)
          throw new ChatError(400, "เจ้าของกลุ่มยังต้องดูแลกลุ่มในเวอร์ชันนี้");
        await tx
          .update(chatMembers)
          .set({ state: "left" })
          .where(eq(chatMembers.id, member.id));
      });
      return res.json({ ok: true });
    })
  );
  router.post(
    "/rooms/:id/invite",
    route(async (req, res) => {
      const { db, user } = actor(res);
      const input = parse(
        z
          .object({
            userIds: z.array(z.number().int().positive()).min(1).max(49),
          })
          .strict(),
        req.body
      );
      await db.transaction(async tx => {
        await tx
          .select()
          .from(chatRooms)
          .where(eq(chatRooms.id, req.params.id))
          .for("update")
          .limit(1);
        const { room } = await requireChatMember(tx, req.params.id, user.id);
        if (room.kind !== "group" || room.ownerUserId !== user.id)
          throw new ChatError(403, "เจ้าของกลุ่มเท่านั้นที่เชิญได้");
        const members = await tx
          .select()
          .from(chatMembers)
          .where(eq(chatMembers.roomId, room.id));
        const ids = [...new Set(input.userIds)].filter(
          id => !members.some(m => m.userId === id && m.state !== "left")
        );
        if (members.filter(m => m.state !== "left").length + ids.length > 50)
          throw new ChatError(400, "กลุ่มมีได้สูงสุด50คน รวมคำเชิญ");
        if (!ids.length) return;
        const people = await tx
          .select({ id: chatAccounts.userId })
          .from(chatAccounts)
          .where(inArray(chatAccounts.userId, ids));
        if (people.length !== ids.length)
          throw new ChatError(400, "ผู้รับยังไม่เปิดใช้แชท");
        for (const userId of ids)
          await tx
            .insert(chatMembers)
            .values({ roomId: room.id, userId, state: "invited" })
            .onDuplicateKeyUpdate({ set: { state: "invited" } });
      });
      return res.json({ ok: true });
    })
  );
  router.get(
    "/rooms/:id/messages",
    route(async (req, res) => {
      const { db, user } = actor(res);
      await requireChatMember(db, req.params.id, user.id);
      const before = Number(req.query.before ?? 0),
        after = Number(req.query.after ?? 0);
      if (
        !Number.isSafeInteger(before) ||
        !Number.isSafeInteger(after) ||
        before < 0 ||
        after < 0 ||
        (before && after)
      )
        throw new ChatError(400, "cursor ไม่ถูกต้อง");
      const rows = await db
        .select()
        .from(chatMessages)
        .where(
          and(
            eq(chatMessages.roomId, req.params.id),
            before ? lt(chatMessages.id, before) : undefined,
            after ? gt(chatMessages.id, after) : undefined
          )
        )
        .orderBy(after ? chatMessages.id : desc(chatMessages.id))
        .limit(51);
      const page = rows.slice(0, 50);
      if (!after) page.reverse();
      const messages = await projectMessages(db, page);
      await requireChatMember(db, req.params.id, user.id);
      return res.json({
        messages,
        hasMore: rows.length > 50,
      });
    })
  );
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 20 * 1024 * 1024,
      files: 3,
      fields: 2,
      fieldSize: 9000,
    },
    fileFilter: (_req, file, cb) => {
      if (
        ![
          "image/jpeg",
          "image/png",
          "image/webp",
          "video/mp4",
          "video/webm",
        ].includes(file.mimetype)
      )
        return cb(new ChatError(400, "รองรับJPG/PNG/WebP MP4/WebMเท่านั้น"));
      cb(null, true);
    },
  }).array("files", 3);
  router.post(
    "/rooms/:id/messages",
    route(async (req, res) => {
      const { db, user } = actor(res);
      await requireChatMember(db, req.params.id, user.id);
      if (decoding >= 2)
        throw new ChatError(429, "กำลังรับไฟล์หลายรายการ กรุณารอสักครู่");
      decoding++;
      try {
        await new Promise<void>((resolve, reject) =>
          upload(req, res, error =>
            error
              ? reject(
                  new ChatError(400, "ไฟล์ต้องไม่เกิน20MiB และไม่เกิน3ไฟล์")
                )
              : resolve()
          )
        );
        const input = parse(chatMessageInput, req.body);
        const files = (req.files ?? []) as Express.Multer.File[];
        if (!input.text.trim() && !files.length)
          throw new ChatError(400, "พิมพ์ข้อความหรือแนบไฟล์ก่อนส่ง");
        if (files.reduce((sum, f) => sum + f.size, 0) > 50 * 1024 * 1024)
          throw new ChatError(400, "ไฟล์รวมต้องไม่เกิน50MiB");
        const payloadHash = chatPayloadHash(
          input.text,
          files.map(f => ({
            data: f.buffer,
            size: f.size,
            mimeType: f.mimetype,
            filename: normalizeChatFilename(f.originalname),
          }))
        );
        const [existing] = await db
          .select()
          .from(chatMessages)
          .where(
            and(
              eq(chatMessages.roomId, req.params.id),
              eq(chatMessages.senderId, user.id),
              eq(chatMessages.clientId, input.clientId)
            )
          )
          .limit(1);
        if (existing) {
          if (existing.payloadHash !== payloadHash)
            throw new ChatError(409, "รหัสส่งซ้ำมีเนื้อหาต่างกัน");
          return res.json({
            message: (await projectMessages(db, [existing]))[0],
          });
        }
        const checked: Awaited<ReturnType<typeof inspectEvidence>>[] = [];
        try {
          for (const f of files)
            checked.push(await inspectEvidence(f.buffer, f.mimetype));
        } catch (cause) {
          throw new ChatError(
            400,
            cause instanceof Error ? cause.message : "ไฟล์แชทไม่ถูกต้อง"
          );
        }
        let saved: typeof chatMessages.$inferSelect;
        await db.transaction(async tx => {
          // Account storage lock precedes room/membership locks in this path; other room actions never lock accounts.
          await tx
            .select()
            .from(chatAccounts)
            .where(eq(chatAccounts.userId, user.id))
            .for("update")
            .limit(1);
          await tx
            .select()
            .from(chatRooms)
            .where(eq(chatRooms.id, req.params.id))
            .for("update")
            .limit(1);
          await requireChatMember(tx, req.params.id, user.id);
          const [retry] = await tx
            .select()
            .from(chatMessages)
            .where(
              and(
                eq(chatMessages.roomId, req.params.id),
                eq(chatMessages.senderId, user.id),
                eq(chatMessages.clientId, input.clientId)
              )
            )
            .limit(1);
          if (retry) {
            if (retry.payloadHash !== payloadHash)
              throw new ChatError(409, "รหัสส่งซ้ำมีเนื้อหาต่างกัน");
            saved = retry;
            return;
          }
          const [size] = await tx
            .select({ bytes: sql<number>`COALESCE(SUM(${chatFiles.size}),0)` })
            .from(chatFiles)
            .where(eq(chatFiles.senderId, user.id));
          if (
            Number(size?.bytes ?? 0) + files.reduce((s, f) => s + f.size, 0) >
            200 * 1024 * 1024
          )
            throw new ChatError(400, "ไฟล์แชทของบัญชีนี้รวมได้สูงสุด200MiB");
          await tx.insert(chatMessages).values({
            roomId: req.params.id,
            senderId: user.id,
            clientId: input.clientId,
            text: input.text,
            payloadHash,
          });
          const [row] = await tx
            .select()
            .from(chatMessages)
            .where(
              and(
                eq(chatMessages.roomId, req.params.id),
                eq(chatMessages.senderId, user.id),
                eq(chatMessages.clientId, input.clientId)
              )
            )
            .limit(1);
          if (!row) throw new ChatError(503, "บันทึกข้อความไม่สำเร็จ");
          saved = row;
          if (files.length)
            await tx.insert(chatFiles).values(
              files.map((f, i) => ({
                id: id(),
                messageId: row.id,
                senderId: user.id,
                filename: normalizeChatFilename(f.originalname),
                kind: checked[i].kind,
                mimeType: f.mimetype,
                size: f.size,
                data: f.buffer,
              }))
            );
          await tx
            .update(chatRooms)
            .set({ updatedAt: new Date() })
            .where(eq(chatRooms.id, req.params.id));
        });
        return res
          .status(201)
          .json({ message: (await projectMessages(db, [saved!]))[0] });
      } finally {
        decoding--;
      }
    })
  );
  router.get(
    "/files/:id",
    route(async (req, res) => {
      const { db, user } = actor(res);
      if (!/^[a-f0-9]{32}$/.test(req.params.id))
        throw new ChatError(404, "ไม่พบไฟล์");
      const [file] = await db
        .select({ ...fileFields, roomId: chatMessages.roomId })
        .from(chatFiles)
        .innerJoin(chatMessages, eq(chatMessages.id, chatFiles.messageId))
        .where(eq(chatFiles.id, req.params.id))
        .limit(1);
      if (!file) throw new ChatError(404, "ไม่พบไฟล์");
      await requireChatMember(db, file.roomId, user.id);
      const [binary] = await db
        .select({ data: chatFiles.data })
        .from(chatFiles)
        .where(eq(chatFiles.id, file.id))
        .limit(1);
      if (!binary) throw new ChatError(404, "ไม่พบไฟล์");
      await requireChatMember(db, file.roomId, user.id);
      res.set({
        "Content-Type": file.mimeType,
        "Content-Length": String(file.size),
        "Content-Disposition": `inline; filename="chat-media"`,
      });
      return res.send(binary.data);
    })
  );
  router.use((_req, res) => res.status(404).json({ error: "ไม่พบAPIแชท" }));
  router.use((cause: unknown, _req: Request, res: Response, _next: unknown) =>
    res.status(400).json({ error: "ข้อมูลแชทไม่ถูกต้องหรือใหญ่เกินไป" })
  );
  app.use("/api/chat", router);
}
