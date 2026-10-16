import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { users, userProfiles, publicMediaCreators } from "../drizzle/schema";
import { commentAuthorName } from "../shared/comments";
import type { PublicMediaCreator } from "../shared/publicMedia";
import { getDb } from "./db";

type DB = NonNullable<Awaited<ReturnType<typeof getDb>>>;
export const CREATOR_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export function creatorProjection(row: {
  id: string;
  displayName: string;
  handle: string;
  avatarMime?: string | null;
  revision: string;
}): PublicMediaCreator {
  return {
    id: row.id,
    displayName: commentAuthorName(row.displayName),
    handle: /^[a-z0-9_.]{3,24}$/i.test(row.handle) ? row.handle : "",
    avatarUrl:
      row.avatarMime && CREATOR_IMAGE_TYPES.has(row.avatarMime)
        ? `/api/media/creators/${row.id}/avatar?v=${row.revision}`
        : null,
  };
}

/** Call inside the publishing transaction; account-first locking matches profile saves. */
export async function ensureMediaCreator(
  tx: Pick<DB, "select" | "insert" | "update">,
  userId: number
) {
  const [account] = await tx
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
    .for("update");
  if (!account) throw new Error("Account unavailable");
  const [profile] = await tx
    .select({
      displayName: userProfiles.displayName,
      handle: userProfiles.handle,
      avatar: userProfiles.avatar,
      avatarMime: userProfiles.avatarMime,
    })
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);
  const [current] = await tx
    .select({ id: publicMediaCreators.id })
    .from(publicMediaCreators)
    .where(eq(publicMediaCreators.userId, userId))
    .limit(1);
  const identity = {
    displayName: commentAuthorName(profile?.displayName ?? account.name),
    handle: profile?.handle ?? "",
    avatar: profile?.avatar ?? null,
    avatarMime: profile?.avatarMime ?? null,
    revision: randomBytes(16).toString("hex"),
  };
  const id = current?.id ?? randomBytes(16).toString("hex");
  if (current)
    await tx
      .update(publicMediaCreators)
      .set(identity)
      .where(eq(publicMediaCreators.userId, userId));
  else await tx.insert(publicMediaCreators).values({ id, userId, ...identity });
  return creatorProjection({ id, ...identity });
}

/** Does not create a public identity for an account that has never published. */
export async function syncPublishedCreator(
  tx: Pick<DB, "update">,
  userId: number,
  fields: { displayName: string; handle: string; revision: string },
  avatar: { data: Buffer; mimeType: string } | null,
  removeAvatar: boolean
) {
  await tx
    .update(publicMediaCreators)
    .set({
      displayName: commentAuthorName(fields.displayName),
      handle: fields.handle,
      revision: fields.revision,
      ...(avatar
        ? { avatar: avatar.data, avatarMime: avatar.mimeType }
        : removeAvatar
          ? { avatar: null, avatarMime: null }
          : {}),
    })
    .where(eq(publicMediaCreators.userId, userId));
}
