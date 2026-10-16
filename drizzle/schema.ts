import { customType, decimal, index, int, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

const longblob = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "longblob";
  },
});
const mediumtext = customType<{ data: string; driverData: string }>({ dataType() { return "mediumtext"; } });

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const publicMediaCreators = mysqlTable("public_media_creators", {
  id: varchar("id", { length: 32 }).primaryKey(),
  userId: int("user_id").notNull().unique().references(() => users.id),
  displayName: varchar("display_name", { length: 60 }).notNull(),
  handle: varchar("handle", { length: 24 }).notNull(),
  avatar: longblob("avatar"),
  avatarMime: varchar("avatar_mime", { length: 32 }),
  revision: varchar("revision", { length: 32 }).notNull(),
});

export const publicMedia = mysqlTable("public_media", {
  id: varchar("id", { length: 32 }).primaryKey(),
  title: varchar("title", { length: 100 }).notNull(),
  description: text("description").notNull(),
  kind: mysqlEnum("kind", ["image", "video"]).notNull(),
  mimeType: varchar("mime_type", { length: 32 }).notNull(),
  size: int("size").notNull(),
  data: longblob("data").notNull(),
  storageMode: mysqlEnum("storage_mode", ["blob", "chunks"]).default("blob").notNull(),
  deleteTokenHash: varchar("delete_token_hash", { length: 64 }).notNull(),
  ownerUserId: int("owner_user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  createdAtIdIdx: index("public_media_created_at_id_idx").on(table.createdAt, table.id),
  ownerCreatedIdx: index("public_media_owner_created_id_idx").on(table.ownerUserId, table.createdAt, table.id),
}));

export const feedPreferences = mysqlTable("feed_preferences", {
  userId: int("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  payload: text("payload").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const feedPreferenceEvents = mysqlTable("feed_preference_events", {
  userId: int("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  eventId: varchar("event_id", { length: 36 }).notNull(),
  mediaId: varchar("media_id", { length: 32 }).notNull().references(() => publicMedia.id, { onDelete: "cascade" }),
  action: mysqlEnum("action", ["like", "unlike", "save", "unsave", "watch", "skip", "not-interested"]).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, table => ({
  retry: uniqueIndex("feed_pref_user_event_unique").on(table.userId, table.eventId),
  createdAt: index("feed_pref_event_created_idx").on(table.createdAt),
  userCreatedAt: index("feed_pref_event_user_created_idx").on(table.userId, table.createdAt),
}));

export type PublicMediaRow = typeof publicMedia.$inferSelect;

export const publicUploadAllocator = mysqlTable("public_upload_allocator", {
  id: int("id").primaryKey(),
});

export const publicMediaChunks = mysqlTable("public_media_chunks", {
  mediaId: varchar("media_id", { length: 32 }).notNull().references(() => publicMedia.id, { onDelete: "cascade" }),
  sequence: int("sequence", { unsigned: true }).notNull(),
  data: longblob("data").notNull(),
}, t => ({ mediaSequence: uniqueIndex("public_media_chunk_sequence_unique").on(t.mediaId, t.sequence) }));

export const publicUploadSessions = mysqlTable("public_upload_sessions", {
  id: varchar("id", { length: 32 }).primaryKey(),
  tokenHash: varchar("token_hash", { length: 64 }).notNull(),
  ownerUserId: int("owner_user_id").references(() => users.id),
  title: varchar("title", { length: 100 }).notNull(),
  description: varchar("description", { length: 240 }).notNull(),
  filename: varchar("filename", { length: 160 }).notNull(),
  size: int("size", { unsigned: true }).notNull(),
  state: mysqlEnum("state", ["uploading", "processing", "complete"]).default("uploading").notNull(),
  processingKey: varchar("processing_key", { length: 32 }),
  expiresAt: timestamp("expires_at").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, t => ({ expiry: index("public_upload_expiry_idx").on(t.expiresAt) }));

export const publicUploadChunks = mysqlTable("public_upload_chunks", {
  uploadId: varchar("upload_id", { length: 32 }).notNull().references(() => publicUploadSessions.id, { onDelete: "cascade" }),
  sequence: int("sequence", { unsigned: true }).notNull(),
  sha256: varchar("sha256", { length: 64 }).notNull(),
  data: longblob("data").notNull(),
}, t => ({ uploadSequence: uniqueIndex("public_upload_chunk_sequence_unique").on(t.uploadId, t.sequence) }));

export const publicMediaViewTotals = mysqlTable("public_media_view_totals", {
  mediaId: varchar("media_id", { length: 32 }).primaryKey().references(() => publicMedia.id, { onDelete: "cascade" }),
  total: int("total", { unsigned: true }).default(0).notNull(),
});
export const publicMediaViewEvents = mysqlTable("public_media_view_events", {
  mediaId: varchar("media_id", { length: 32 }).notNull().references(() => publicMedia.id, { onDelete: "cascade" }),
  eventId: varchar("event_id", { length: 36 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, table => ({ retry: uniqueIndex("public_media_view_event_unique").on(table.mediaId, table.eventId), expiry: index("public_media_view_event_time_idx").on(table.createdAt) }));

export const arenaProfiles = mysqlTable("arena_profiles", {
  id: varchar("id", { length: 32 }).primaryKey(),
  displayName: varchar("display_name", { length: 60 }).notNull(),
  handle: varchar("handle", { length: 24 }).notNull().unique(),
  bio: varchar("bio", { length: 160 }).notNull(),
  avatar: mediumtext("avatar"),
  editTokenHash: varchar("edit_token_hash", { length: 64 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const arenaEntries = mysqlTable("arena_entries", {
  id: varchar("id", { length: 32 }).primaryKey(),
  profileId: varchar("profile_id", { length: 32 }).notNull().references(() => arenaProfiles.id),
  boardKey: varchar("board_key", { length: 80 }).notNull(),
  title: varchar("title", { length: 60 }).notNull(),
  category: mysqlEnum("category", ["sports", "stocks", "followers", "likes", "world"]).notNull(),
  unit: varchar("unit", { length: 20 }).notNull(),
  direction: mysqlEnum("direction", ["higher", "lower"]).notNull(),
  value: decimal("value", { precision: 22, scale: 6 }).notNull(),
  period: varchar("period", { length: 7 }).notNull(),
  observedAt: varchar("observed_at", { length: 10 }).notNull(),
  evidenceUrl: varchar("evidence_url", { length: 500 }).notNull(),
  verification: mysqlEnum("verification", ["self-reported", "verified"]).default("self-reported").notNull(),
  revision: varchar("revision", { length: 32 }).default("legacy").notNull(),
  evidenceRevision: varchar("evidence_revision", { length: 32 }).default("initial").notNull(),
  reviewStatus: varchar("review_status", { length: 20 }).default("none").notNull(),
  reviewSnapshot: varchar("review_snapshot", { length: 64 }),
  verificationSnapshot: varchar("verification_snapshot", { length: 64 }),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  boardPeriodIdx: index("arena_board_period_idx").on(table.boardKey, table.period),
  profileBoardPeriod: uniqueIndex("arena_profile_board_period_unique").on(table.profileId, table.boardKey, table.period),
}));

export const arenaEvidence = mysqlTable("arena_evidence", {
  id: varchar("id", { length: 32 }).primaryKey(),
  entryId: varchar("entry_id", { length: 32 }).notNull().references(() => arenaEntries.id),
  claimRevision: varchar("claim_revision", { length: 32 }).notNull(),
  filename: varchar("filename", { length: 100 }).notNull(),
  kind: mysqlEnum("kind", ["image", "video"]).notNull(),
  mimeType: varchar("mime_type", { length: 32 }).notNull(),
  size: int("size").notNull(),
  data: longblob("data").notNull(),
  sha256: varchar("sha256", { length: 64 }).notNull(),
  duration: decimal("duration", { precision: 10, scale: 3 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({ entryRevisionIdx: index("arena_evidence_entry_revision_idx").on(table.entryId, table.claimRevision) }));

export const arenaReviews = mysqlTable("arena_reviews", {
  id: varchar("id", { length: 32 }).primaryKey(),
  entryId: varchar("entry_id", { length: 32 }).notNull().references(() => arenaEntries.id),
  profileId: varchar("profile_id", { length: 32 }).notNull(),
  snapshot: varchar("snapshot", { length: 64 }).notNull(),
  status: varchar("status", { length: 20 }).notNull(),
  report: mediumtext("report"),
  sources: mediumtext("sources"),
  coverage: text("coverage"),
  model: varchar("model", { length: 100 }).notNull(),
  attempts: int("attempts").default(1).notNull(),
  error: varchar("error", { length: 500 }),
  decision: mysqlEnum("decision", ["pending", "approved", "rejected"]).default("pending").notNull(),
  decisionReason: text("decision_reason"),
  reviewerId: int("reviewer_id"),
  decidedAt: timestamp("decided_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
}, (table) => ({
  entrySnapshotUnique: uniqueIndex("arena_review_entry_snapshot_unique").on(table.entryId, table.snapshot),
  profileCreatedIdx: index("arena_review_profile_created_idx").on(table.profileId, table.createdAt),
}));

export const chatAccounts = mysqlTable("chat_accounts", {
  userId: int("user_id").primaryKey().references(() => users.id),
  displayName: varchar("display_name", { length: 60 }).notNull(),
  arenaProfileId: varchar("arena_profile_id", { length: 32 }).unique().references(() => arenaProfiles.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export const chatRooms = mysqlTable("chat_rooms", {
  id: varchar("id", { length: 32 }).primaryKey(),
  kind: mysqlEnum("kind", ["direct", "group", "channel"]).notNull(),
  title: varchar("title", { length: 100 }).notNull(),
  ownerUserId: int("owner_user_id").notNull().references(() => chatAccounts.userId),
  directKey: varchar("direct_key", { length: 64 }).unique(),
  channelKey: varchar("channel_key", { length: 200 }).unique(),
  category: mysqlEnum("category", ["sports", "stocks", "followers", "likes", "world"]),
  boardKey: varchar("board_key", { length: 80 }),
  period: varchar("period", { length: 7 }),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export const chatMembers = mysqlTable("chat_members", {
  id: int("id").autoincrement().primaryKey(),
  roomId: varchar("room_id", { length: 32 }).notNull().references(() => chatRooms.id),
  userId: int("user_id").notNull().references(() => chatAccounts.userId),
  state: mysqlEnum("state", ["invited", "active", "left"]).notNull(),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
}, t => ({ roomUser: uniqueIndex("chat_member_room_user_unique").on(t.roomId, t.userId), userState: index("chat_member_user_state_idx").on(t.userId,t.state) }));
export const chatMessages = mysqlTable("chat_messages", {
  id: int("id").autoincrement().primaryKey(),
  roomId: varchar("room_id", { length: 32 }).notNull().references(() => chatRooms.id),
  senderId: int("sender_id").notNull().references(() => chatAccounts.userId),
  clientId: varchar("client_id", { length: 36 }).notNull(),
  payloadHash: varchar("payload_hash", { length: 64 }).notNull(),
  text: text("text").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, t => ({ roomIdIdx: index("chat_message_room_sequence_idx").on(t.roomId,t.id), retryUnique: uniqueIndex("chat_message_retry_unique").on(t.roomId,t.senderId,t.clientId) }));
export const chatFiles = mysqlTable("chat_files", {
  id: varchar("id", { length: 32 }).primaryKey(),
  messageId: int("message_id").notNull().references(() => chatMessages.id),
  senderId: int("sender_id").notNull().references(() => chatAccounts.userId),
  filename: varchar("filename", { length: 100 }).notNull(),
  kind: mysqlEnum("kind", ["image", "video"]).notNull(),
  mimeType: varchar("mime_type", { length: 32 }).notNull(),
  size: int("size").notNull(),
  data: longblob("data").notNull(),
}, t => ({ messageIdx: index("chat_file_message_idx").on(t.messageId), senderIdx: index("chat_file_sender_idx").on(t.senderId) }));

export const publicComments = mysqlTable("public_comments", {
  id: int("id").autoincrement().primaryKey(),
  mediaId: varchar("media_id", { length: 32 }).notNull().references(() => publicMedia.id, { onDelete: "cascade" }),
  authorId: int("author_id").notNull().references(() => users.id),
  authorName: varchar("author_name", { length: 60 }).notNull(),
  clientId: varchar("client_id", { length: 36 }).notNull(),
  parentId: int("parent_id"),
  replyToId: int("reply_to_id"),
  replyToName: varchar("reply_to_name", { length: 60 }),
  text: text("text").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  deletedAt: timestamp("deleted_at"),
}, t => ({
  mediaSequence: index("public_comment_media_sequence_idx").on(t.mediaId, t.id),
  threadSequence: index("public_comment_thread_sequence_idx").on(t.mediaId, t.parentId, t.id),
  authorTime: index("public_comment_author_time_idx").on(t.authorId, t.createdAt),
  retryUnique: uniqueIndex("public_comment_retry_unique").on(t.mediaId, t.authorId, t.clientId),
}));

export const userProfiles = mysqlTable("user_profiles", {
  userId: int("user_id").primaryKey().references(() => users.id),
  displayName: varchar("display_name", { length: 60 }).notNull(),
  handle: varchar("handle", { length: 24 }).notNull(),
  bio: varchar("bio", { length: 160 }).notNull(),
  location: varchar("location", { length: 80 }).notNull(),
  website: varchar("website", { length: 200 }).notNull(),
  category: varchar("category", { length: 40 }).notNull(),
  avatar: longblob("avatar"),
  avatarMime: varchar("avatar_mime", { length: 32 }),
  cover: longblob("cover"),
  coverMime: varchar("cover_mime", { length: 32 }),
  revision: varchar("revision", { length: 32 }).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});
export const userNotifications = mysqlTable("user_notifications", {
  id: int("id").autoincrement().primaryKey(),
  recipientId: int("recipient_id").notNull().references(() => users.id),
  actorId: int("actor_id").notNull().references(() => users.id),
  commentId: int("comment_id").notNull().references(() => publicComments.id, { onDelete: "cascade" }),
  mediaId: varchar("media_id", { length: 32 }).notNull().references(() => publicMedia.id, { onDelete: "cascade" }),
  kind: mysqlEnum("kind", ["comment", "reply"]).notNull(),
  rootId: int("root_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  readAt: timestamp("read_at"),
}, t => ({ recipientSequence: index("notification_recipient_sequence_idx").on(t.recipientId, t.id), unread: index("notification_recipient_read_idx").on(t.recipientId, t.readAt), eventRecipient: uniqueIndex("notification_comment_recipient_unique").on(t.commentId, t.recipientId) }));

// Curated public figures are references, never authenticated participants.
export const arenaPublicReferences = mysqlTable("arena_public_references", {
  id: varchar("id", { length: 32 }).primaryKey(),
  personId: varchar("person_id", { length: 80 }).notNull(),
  groupKey: varchar("group_key", { length: 150 }).notNull(),
  category: mysqlEnum("category", ["sports", "stocks", "followers", "likes", "world"]).notNull(),
  boardKey: varchar("board_key", { length: 80 }).notNull(),
  payload: mediumtext("payload").notNull(),
  importedAt: timestamp("imported_at").defaultNow().notNull(),
}, table => ({ categoryIndex: index("arena_public_reference_category_idx").on(table.category), personGroup: uniqueIndex("arena_public_reference_person_group_unique").on(table.personId, table.groupKey) }));

export const investmentPublicReferences = mysqlTable("investment_public_references", {
  id: varchar("id", {length:80}).primaryKey(),
  kind: mysqlEnum("kind", ["investor","fund","company"]).notNull(),
  payload: mediumtext("payload").notNull(),
  importedAt: timestamp("imported_at").defaultNow().notNull(),
}, table => ({kindIndex:index("investment_reference_kind_idx").on(table.kind)}));

// Public opening counts; no account/IP/device identifiers are persisted.
export const rankingViewTotals = mysqlTable("ranking_view_totals", {
  id: varchar("id", { length: 64 }).primaryKey(),
  kind: varchar("kind", { length: 24 }).notNull(),
  targetKey: varchar("target_key", { length: 600 }).notNull(),
  total: int("total", { unsigned: true }).default(0).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export const rankingViewEvents = mysqlTable("ranking_view_events", {
  targetId: varchar("target_id", { length: 64 }).notNull(),
  eventId: varchar("event_id", { length: 36 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, table => ({ retry: uniqueIndex("ranking_view_target_event_unique").on(table.targetId, table.eventId), expiry: index("ranking_view_event_created_idx").on(table.createdAt) }));

// Historical institutional return references, never personal returns or community ranking scores.
export const investorReturnReferences = mysqlTable("investor_return_references", {
  id: varchar("id", { length: 80 }).primaryKey(),
  payload: mediumtext("payload").notNull(),
  importedAt: timestamp("imported_at").defaultNow().notNull(),
});
