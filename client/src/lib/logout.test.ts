import { afterEach, describe, expect, it, vi } from "vitest";
import { clearBrowserSession, completeAppLogout } from "./logout";
afterEach(() => vi.unstubAllGlobals());
function stores() {
  const session = new Map([
    ["manus-cookie", "credential"],
    ["other", "keep"],
  ]);
  const local = new Map([
    ["manus-runtime-user-info", "private-account-info"],
    ["arena-token", "keep"],
    ["media-delete-token", "keep"],
  ]);
  vi.stubGlobal("sessionStorage", {
    removeItem: (key: string) => session.delete(key),
  });
  vi.stubGlobal("localStorage", {
    removeItem: (key: string) => local.delete(key),
  });
  return { session, local };
}
describe("app logout completion", () => {
  it("waits for server success then cancels queries, clears credential/cache and records signed-out state", async () => {
    const { session, local } = stores();
    const events: string[] = [];
    await completeAppLogout({
      endSession: async () => {
        expect(session.has("manus-cookie")).toBe(true);
        events.push("server");
      },
      cancelQueries: async () => {
        events.push("cancel");
      },
      clearCache: () => {
        expect(session.has("manus-cookie")).toBe(false);
        events.push("cache");
      },
      markLoggedOut: () => events.push("signed-out"),
    });
    expect(events).toEqual(["server", "cancel", "signed-out", "cache"]);
    expect(local.has("manus-runtime-user-info")).toBe(false);
    expect(local.get("arena-token")).toBe("keep");
    expect(local.get("media-delete-token")).toBe("keep");
    expect(session.get("other")).toBe("keep");
  });
  it("retains session and cache on API failure instead of pretending logout succeeded", async () => {
    const { session, local } = stores();
    const cancelQueries = vi.fn(),
      clearCache = vi.fn(),
      markLoggedOut = vi.fn();
    await expect(
      completeAppLogout({
        endSession: async () => {
          throw new Error("network");
        },
        cancelQueries,
        clearCache,
        markLoggedOut,
      })
    ).rejects.toThrow("network");
    expect(session.has("manus-cookie")).toBe(true);
    expect(local.has("manus-runtime-user-info")).toBe(true);
    expect(cancelQueries).not.toHaveBeenCalled();
    expect(clearCache).not.toHaveBeenCalled();
    expect(markLoggedOut).not.toHaveBeenCalled();
  });
  it("handles blocked storage without throwing or clearing unrelated local data", () => {
    vi.stubGlobal("sessionStorage", {
      removeItem() {
        throw new Error("blocked");
      },
    });
    vi.stubGlobal("localStorage", {
      removeItem() {
        throw new Error("blocked");
      },
    });
    expect(() => clearBrowserSession()).not.toThrow();
  });
  it("completes cleanup if query cancellation fails after server already ended the session", async () => {
    const { session } = stores();
    const markLoggedOut = vi.fn(),
      clearCache = vi.fn();
    await completeAppLogout({
      endSession: async () => ({ success: true }),
      cancelQueries: async () => {
        throw new Error("cancel");
      },
      markLoggedOut,
      clearCache,
    });
    expect(session.has("manus-cookie")).toBe(false);
    expect(markLoggedOut).toHaveBeenCalledOnce();
    expect(clearCache).toHaveBeenCalledOnce();
  });
});
