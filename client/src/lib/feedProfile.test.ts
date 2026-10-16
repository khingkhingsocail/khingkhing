import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import FeedProfilePreview from "../components/FeedProfilePreview";
import {
  feedCreatorFromPublicCreator,
  selectFeedProfilePosts,
  type FeedCreatorProfile,
} from "./feedProfile";

const guest: FeedCreatorProfile = {
  id: "guest-a",
  displayName: "ผู้เข้าชม",
  handle: "",
  bio: "",
  kind: "anonymous",
};
const demo: FeedCreatorProfile = { ...guest, id: "demo", kind: "demo" };
const local: FeedCreatorProfile = { ...guest, id: "local", kind: "local" };
const account: FeedCreatorProfile = {
  ...guest,
  id: "account",
  kind: "account",
  avatarUrl: "/public-avatar",
};
const source = (
  id: string,
  creator: FeedCreatorProfile,
  visibility: "public" | "private" | "demo"
) => ({
  id,
  creator,
  visibility,
  title: id,
  caption: "caption",
  media: `/api/media/${id}/asset`,
  kind: "image" as const,
});

describe("profile preview post selection", () => {
  it("never returns local-only profile posts, even when marked public", () => {
    expect(
      selectFeedProfilePosts(local, [source("local", local, "public")])
    ).toEqual([]);
  });

  it("shows only public posts attributed to the exact account profile", () => {
    expect(
      selectFeedProfilePosts(account, [
        source("public", account, "public"),
        source("private", account, "private"),
        source(
          "other-account",
          { ...account, id: "another-account" },
          "public"
        ),
        source("wrong-kind", { ...account, kind: "anonymous" }, "public"),
      ]).map(post => post.id)
    ).toEqual(["public"]);
  });

  it("excludes private files even if the creator ID matches a public profile", () => {
    expect(
      selectFeedProfilePosts(guest, [
        source("secret", guest, "private"),
        source("public", guest, "public"),
      ]).map(post => post.id)
    ).toEqual(["public"]);
  });

  it("does not group anonymous uploaders by their identical display name", () => {
    const other = { ...guest, id: "guest-b" };
    expect(
      selectFeedProfilePosts(guest, [
        source("a", guest, "public"),
        source("b", other, "public"),
      ]).map(post => post.id)
    ).toEqual(["a"]);
  });

  it("separates sample posts from real public uploads and checks creator kind", () => {
    expect(
      selectFeedProfilePosts(demo, [
        source("sample", demo, "demo"),
        source("wrong-visibility", demo, "public"),
        source("wrong-kind", { ...demo, kind: "local" }, "demo"),
      ]).map(post => post.id)
    ).toEqual(["sample"]);
  });

  it("projects only the allowlisted fields, leaving credentials and local fields behind", () => {
    const sensitive = {
      ...source("a", guest, "public"),
      viewCount: 0,
      deleteToken: "test-only-secret",
      privateEmail: "private@example.test",
    };
    expect(selectFeedProfilePosts(guest, [sensitive])[0]).toEqual({
      id: "a",
      title: "a",
      caption: "caption",
      media: "/api/media/a/asset",
      kind: "image",
      viewCount: 0,
    });
    expect(
      selectFeedProfilePosts(guest, [source("old", guest, "public")])[0]
    ).not.toHaveProperty("viewCount");
  });

  it("deduplicates shared posts while preserving feed order", () => {
    expect(
      selectFeedProfilePosts(guest, [
        source("b", guest, "public"),
        source("a", guest, "public"),
        source("b", guest, "public"),
      ]).map(post => post.id)
    ).toEqual(["b", "a"]);
  });
});

describe("public creator identity", () => {
  it("projects only the API's public name, handle, avatar URL, and ID", () => {
    const apiCreator = {
      id: "0123456789abcdef0123456789abcdef",
      displayName: "ชื่อสาธารณะ",
      handle: "public_handle",
      avatarUrl: "/api/media/creators/0123456789abcdef0123456789abcdef/avatar",
      bio: "private bio must not be used",
      coverUrl: "/private-cover.jpg",
      location: "private location",
    };

    expect(feedCreatorFromPublicCreator(apiCreator)).toEqual({
      id: apiCreator.id,
      displayName: apiCreator.displayName,
      handle: apiCreator.handle,
      avatarUrl: apiCreator.avatarUrl,
      bio: "",
      kind: "account",
    });
  });

  it("renders a public account identity without private fields or sample copy on the server", () => {
    const profile = feedCreatorFromPublicCreator({
      id: "0123456789abcdef0123456789abcdef",
      displayName: "ชื่อสาธารณะ",
      handle: "public_handle",
      avatarUrl: "/api/media/creators/0123456789abcdef0123456789abcdef/avatar",
    });
    const html = renderToStaticMarkup(
      createElement(FeedProfilePreview, {
        profile,
        posts: [],
        onBack: () => undefined,
        onOpenPost: () => undefined,
      })
    );

    expect(html).toContain("ชื่อสาธารณะ");
    expect(html).toContain("@public_handle");
    expect(html).toContain(profile.avatarUrl ?? "");
    expect(html).toContain("ไม่ได้พิสูจน์ตัวตนในโลกจริง");
    expect(html).not.toContain("SAMPLE CREATOR PROFILE");
    expect(html).not.toContain("SAMPLE POSTS");
    expect(html).not.toContain("ผู้ติดตาม");
  });
});
