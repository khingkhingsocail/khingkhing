import type { PublicMediaCreator } from "@shared/publicMedia";

export type FeedProfileKind = "demo" | "anonymous" | "local" | "account";

export interface FeedCreatorProfile {
  id: string;
  displayName: string;
  handle: string;
  avatarUrl?: string | null;
  bio: string;
  kind: FeedProfileKind;
}

/** Project only the fields the public creator contract intentionally exposes. */
export function feedCreatorFromPublicCreator(
  creator: PublicMediaCreator
): FeedCreatorProfile {
  return {
    id: creator.id,
    displayName: creator.displayName,
    handle: creator.handle,
    avatarUrl: creator.avatarUrl,
    bio: "",
    kind: "account",
  };
}

export interface FeedProfilePost {
  id: string;
  title: string;
  caption: string;
  media: string;
  kind: "image" | "video";
  viewCount?: number;
}

interface ProfilePostSource extends FeedProfilePost {
  creator: FeedCreatorProfile;
  visibility: "demo" | "private" | "public";
}

/** Preview filtering only; real account access must also be checked on the server. */
export function selectFeedProfilePosts(
  profile: FeedCreatorProfile,
  posts: readonly ProfilePostSource[]
): FeedProfilePost[] {
  if (profile.kind === "local") return [];
  const visibility = profile.kind === "demo" ? "demo" : "public";
  const seen = new Set<string>();
  return posts
    .filter(post => {
      if (
        post.visibility !== visibility ||
        post.creator.id !== profile.id ||
        post.creator.kind !== profile.kind ||
        seen.has(post.id)
      )
        return false;
      seen.add(post.id);
      return true;
    })
    .map(({ id, title, caption, media, kind, viewCount }) => ({
      id,
      title,
      caption,
      media,
      kind,
      ...(typeof viewCount === "number" && Number.isSafeInteger(viewCount) && viewCount >= 0
        ? { viewCount }
        : {}),
    }));
}
