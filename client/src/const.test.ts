import { afterEach, describe, expect, it, vi } from "vitest";
import { startLogin } from "./const";
import { decodeOAuthState, OAUTH_STATE_COOKIE } from "../../shared/const";

function browser(config: Record<string, string> | undefined) {
  const location = { origin: "https://khing.example", href: "" };
  const document = { cookie: "" };
  vi.stubGlobal("window", { __MANUS_CONFIG__: config, location });
  vi.stubGlobal("document", document);
  vi.stubGlobal("crypto", {
    randomUUID: () => "bc1c9354-7c35-42ab-bf8a-8f334c6a805d",
  });
  return { location, document };
}
afterEach(() => vi.unstubAllGlobals());

describe("login button OAuth transport", () => {
  it("navigates to the actual configured authorization portal with a browser-bound nonce", () => {
    const fixture = browser({
      oauthPortalUrl: "https://auth.example",
      projectId: "test-project",
    });
    startLogin();
    const url = new URL(fixture.location.href);
    expect(url.origin).toBe("https://auth.example");
    expect(url.pathname).toBe("/app-auth");
    expect(url.searchParams.get("appId")).toBe("test-project");
    expect(url.searchParams.get("redirectUri")).toBe(
      "https://khing.example/api/oauth/callback"
    );
    expect(url.searchParams.get("responseType")).toBe("code");
    expect(decodeOAuthState(url.searchParams.get("state")!)).toEqual({
      redirectUri: "https://khing.example/api/oauth/callback",
      nonce: "bc1c9354-7c35-42ab-bf8a-8f334c6a805d",
    });
    expect(fixture.document.cookie).toBe(
      `${OAUTH_STATE_COOKIE}=bc1c9354-7c35-42ab-bf8a-8f334c6a805d; Path=/; Max-Age=600; SameSite=None; Secure`
    );
  });
  it("fails clearly without public OAuth configuration and never claims login succeeded", () => {
    const fixture = browser(undefined);
    expect(startLogin).toThrow("ยังไม่ได้ตั้งค่าการเข้าสู่ระบบขิงขิง");
    expect(fixture.document.cookie).toBe("");
    expect(fixture.location.href).toBe("");
  });
});
