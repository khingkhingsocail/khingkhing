import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Router } from "wouter";
import type { ReactNode } from "react";
const state = vi.hoisted(() => ({
  authenticated: false,
  loading: false,
  error: null as Error | null,
}));
vi.mock("../_core/hooks/useAuth", () => ({
  useAuth: () => ({
    user: state.authenticated ? { id: 1, name: "Test User" } : null,
    isAuthenticated: state.authenticated,
    loading: state.loading,
    error: state.error,
    refresh: vi.fn(),
    logout: vi.fn(),
  }),
}));
vi.mock("../pages/Home", () => ({
  default: () => <div>AUTHENTICATED_HOME</div>,
}));
vi.mock("../const", () => ({ startLogin: vi.fn() }));
import BrandedLogin from "./BrandedLogin";
import Login, { Entry } from "../pages/Login";
import { startLogin } from "../const";
function render(node: ReactNode) {
  return renderToStaticMarkup(<Router ssrPath="/login">{node}</Router>);
}
beforeEach(() => {
  state.authenticated = false;
  state.loading = false;
  state.error = null;
  vi.clearAllMocks();
});
describe("Khing Khing branded login", () => {
  it("contains exact brand phrases and does not show Playfolio or fake metrics", () => {
    const html = render(<BrandedLogin />);
    for (const text of [
      "KHING KHING ARENA",
      "YOUR STATS. YOUR STAGE.",
      "ขิงให้สุด",
      "ขึ้นที่หนึ่งใน",
      "ทางของคุณ",
      "เข้าสู่ระบบขิงขิง",
    ])
      expect(html).toContain(text);
    expect(html).not.toContain("Playfolio");
    expect(html).toContain('href="/feed"');
    expect(html).toContain("ผู้เยี่ยมชม");
    expect(html).toContain("ยืนยันบัญชีผ่าน Manus");
    expect(startLogin).not.toHaveBeenCalled();
  });
  it("places the primary login button before benefits and offers a navigation login button", () => {
    const html = render(<BrandedLogin />);
    expect(html).toContain("LOGIN · KHING KHING");
    expect(html).toContain('class="khing-login__nav-enter"');
    expect(html).toContain('aria-describedby="khing-login-provider"');
    expect(html.indexOf('class="khing-login__submit"')).toBeLessThan(
      html.indexOf('class="khing-login__benefits"')
    );
    expect(html).not.toContain('type="password"');
    expect(startLogin).not.toHaveBeenCalled();
  });
  it("pending auth disables submit without creating an OAuth nonce", () => {
    const html = render(<BrandedLogin checking />);
    expect(html).toContain("กำลังตรวจสอบบัญชี");
    expect(html).toContain("disabled");
    expect(html.match(/aria-busy="true"/g)).toHaveLength(2);
    expect(startLogin).not.toHaveBeenCalled();
  });
  it("shows authenticated account only when supplied validated state; no extra OAuth", () => {
    const html = render(<BrandedLogin authenticated accountName="Test" />);
    expect(html).toContain("คุณอยู่ในขิงขิงแล้ว");
    expect(html).toContain("Test");
    expect(html).toContain("เข้าสู่แอปขิงขิง");
    expect(startLogin).not.toHaveBeenCalled();
  });
  it("root entry does not open Home until validated authenticated state exists", () => {
    expect(render(<Entry />)).not.toContain("AUTHENTICATED_HOME");
    state.authenticated = true;
    expect(render(<Entry />)).toContain("AUTHENTICATED_HOME");
  });
  it("explicit login route stays branded even for a logged-in user", () => {
    state.authenticated = true;
    const html = render(<Login />);
    expect(html).toContain("คุณอยู่ในขิงขิงแล้ว");
    expect(html).toContain("ออกจากระบบ");
    expect(html).not.toContain("AUTHENTICATED_HOME");
  });
  it("auth errors remain logged out, offer retry and preserve guest access", () => {
    state.error = new Error("unavailable");
    const html = render(<Entry />);
    expect(html).toContain("ตรวจสอบบัญชีไม่สำเร็จ");
    expect(html).toContain("ตรวจสอบอีกครั้ง");
    expect(html).toContain('href="/feed"');
    expect(html).not.toContain("AUTHENTICATED_HOME");
    expect(html).not.toContain("ออกจากระบบ");
  });
});
