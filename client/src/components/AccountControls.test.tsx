import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Router } from "wouter";
import AccountControls from "./AccountControls";
import LogoutButton from "./LogoutButton";
describe("account logout controls", () => {
  it("shows logout for an authenticated user without running it during render", () => {
    const logout = vi.fn();
    const html = renderToStaticMarkup(
      <Router ssrPath="/feed">
        <AccountControls
          authenticated
          accountName="A Person"
          onLogout={logout}
        />
      </Router>
    );
    expect(html).toContain("ออกจากระบบ");
    expect(html).toContain("A Person");
    expect(html).toContain("ไม่ลบไฟล์หรือโปรไฟล์");
    expect(logout).not.toHaveBeenCalled();
  });
  it("guests see sign-in, not a pretend logout button", () => {
    const html = renderToStaticMarkup(
      <Router ssrPath="/feed">
        <AccountControls authenticated={false} onLogout={vi.fn()} />
      </Router>
    );
    expect(html).toContain("เข้าสู่ระบบขิงขิง");
    expect(html).toContain('href="/login"');
    expect(html).not.toContain("ออกจากระบบ");
  });
  it("pending account check does not claim signed-in and disables authenticated logout", () => {
    const guest = renderToStaticMarkup(
      <Router ssrPath="/feed">
        <AccountControls authenticated={false} pending onLogout={vi.fn()} />
      </Router>
    );
    expect(guest).toContain("กำลังตรวจสอบบัญชี");
    expect(guest).not.toContain("ออกจากระบบ");
    const html = renderToStaticMarkup(
      <Router ssrPath="/login">
        <LogoutButton onLogout={vi.fn()} disabled />
      </Router>
    );
    expect(html).toContain("disabled");
  });
});
