import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AccountProfileApiError,
  accountProfileHeaders,
  fetchAccountProfileImage,
  getAccountProfile,
  saveAccountProfile,
} from "./accountProfile";
import {
  normalizeAccountProfileWebsite,
  validateAccountProfileFields,
} from "../../../shared/profile";

const payload = {
  displayName: "Member",
  handle: "member_01",
  bio: "",
  location: "",
  website: "",
  category: "",
};
const saved = {
  ...payload,
  revision: "a".repeat(32),
  avatar: null,
  cover: null,
  updatedAt: "2026-01-01T00:00:00.000Z",
};
afterEach(() => vi.unstubAllGlobals());

describe("account profile browser API", () => {
  it("sends anti-CSRF and mirrored Preview bearer headers without a client account ID", async () => {
    vi.stubGlobal("sessionStorage", {
      getItem: () => "header.payload.signature",
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ profile: null }), { status: 200 })
      );
    vi.stubGlobal("fetch", fetchMock);
    expect(await getAccountProfile()).toBeNull();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/profile/me");
    expect(new Headers(init.headers).get("X-Khing-Profile")).toBe("1");
    expect(new Headers(init.headers).get("Authorization")).toBe(
      "Bearer header.payload.signature"
    );
    expect(init.cache).toBe("no-store");
    expect(init.credentials).toBe("include");
    expect(accountProfileHeaders()).not.toHaveProperty("X-User-Id");
  });

  it("shares the existing local-profile limits and refuses userinfo websites", () => {
    expect(normalizeAccountProfileWebsite("portfolio.example.com")).toBe(
      "https://portfolio.example.com/"
    );
    expect(
      validateAccountProfileFields({ ...payload, bio: "x".repeat(161) })
    ).toContain("160");
    expect(
      validateAccountProfileFields({
        ...payload,
        website: "https://name:secret@example.com",
      })
    ).toContain("ลิงก์เว็บไซต์");
  });

  it("sends only selected image files and uses canonical metadata returned by PUT", async () => {
    const avatar = new File([new Uint8Array([1, 2, 3])], "avatar.png", {
      type: "image/png",
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ profile: saved }), { status: 200 })
      );
    vi.stubGlobal("fetch", fetchMock);
    const result = await saveAccountProfile(
      {
        ...payload,
        expectedRevision: null,
        removeAvatar: false,
        removeCover: false,
      },
      { avatar, cover: null }
    );
    expect(result.revision).toBe("a".repeat(32));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [putUrl, putInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(putUrl).toBe("/api/profile/me");
    expect(putInit.method).toBe("PUT");
    expect(putInit.body).toBeInstanceOf(FormData);
    expect(new Headers(putInit.headers).has("Content-Type")).toBe(false);
    const form = putInit.body as FormData;
    expect(form.get("profile")).toBe(
      JSON.stringify({
        ...payload,
        expectedRevision: null,
        removeAvatar: false,
        removeCover: false,
      })
    );
    expect(form.get("avatar")).toMatchObject({
      name: "avatar.png",
      type: "image/png",
      size: 3,
    });
    expect(form.get("cover")).toBeNull();
  });

  it("keeps the stale revision error from becoming a successful save", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ error: "stale" }), { status: 409 })
        )
    );
    await expect(
      saveAccountProfile(
        {
          ...payload,
          expectedRevision: "b".repeat(32),
          removeAvatar: false,
          removeCover: false,
        },
        {}
      )
    ).rejects.toMatchObject({
      status: 409,
      message: "stale",
    } satisfies Partial<AccountProfileApiError>);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("uses the authenticated private endpoint for image blobs", async () => {
    vi.stubGlobal("sessionStorage", {
      getItem: () => "header.payload.signature",
    });
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(blob, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchAccountProfileImage("cover")).toBeInstanceOf(Blob);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/profile/me/cover");
    expect(new Headers(init.headers).get("Authorization")).toBe(
      "Bearer header.payload.signature"
    );
    expect(new Headers(init.headers).get("X-Khing-Profile")).toBe("1");
    expect(init.cache).toBe("no-store");
  });
});
