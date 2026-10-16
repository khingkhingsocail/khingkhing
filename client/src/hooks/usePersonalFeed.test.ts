import { afterEach, describe, expect, it, vi } from "vitest";
import { personalFeedRequest } from "./usePersonalFeed";
import { emptyFeedPreferences } from "../../../shared/feedPersonalization";
afterEach(() => vi.unstubAllGlobals());
describe("personal preference API transport", () => {
  it("uses credentials and explicit private endpoint without user id or topic payload", async () => {
    const f = vi.fn(
      async () =>
        new Response(JSON.stringify({ preferences: emptyFeedPreferences() }), {
          status: 200,
        })
    );
    vi.stubGlobal("fetch", f);
    const signal = {
      mediaId: "a".repeat(32),
      eventId: "12345678-1234-4234-8234-123456789abc",
      action: "like" as const,
    };
    expect(
      await personalFeedRequest("signals", "project-token", signal)
    ).toEqual(emptyFeedPreferences());
    expect(
      (f.mock.calls as unknown as [string, RequestInit][])[0][0]
    ).toContain("signals");
    const init = (f.mock.calls as unknown as [string, RequestInit][])[0][1];
    expect(init.credentials).toBe("include");
    expect(init.cache).toBe("no-store");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer project-token",
      "X-Khing-Feed": "1",
    });
    expect(JSON.parse(init.body as string)).toEqual(signal);
  });
  it("does not mistake missing authentication for a synced empty preference", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response('{"error":"Login"}', { status: 401 }))
    );
    await expect(personalFeedRequest("me", null)).rejects.toThrow(
      "เข้าสู่ระบบ"
    );
  });
  it("rejects unsafe or malformed preference replies", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            '{"preferences":{"version":1,"weights":{"location":10},"dismissed":[]}}',
            { status: 200 }
          )
      )
    );
    await expect(personalFeedRequest("me", null)).rejects.toThrow(
      "ข้อมูลความชอบ"
    );
  });
});
