import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import AccountProfileEditor, {
  ACCOUNT_PROFILE_FORM_ID,
} from "./AccountProfileEditor";

const props = { userId: 27, onOpenUpload: vi.fn(), onOpenPrivate: vi.fn() };

describe("account profile editor", () => {
  it("renders an account-scoped private editor shell without importing local data automatically", () => {
    const html = renderToStaticMarkup(<AccountProfileEditor {...props} />);
    expect(html).toContain("โปรไฟล์บัญชีของคุณ");
    expect(html).toContain("YOUR ACCOUNT · PRIVATE");
    expect(html).toContain("กำลังโหลดโปรไฟล์บัญชี");
    expect(html).not.toContain("นำเข้าจากเบราว์เซอร์นี้");
    expect(props.onOpenUpload).not.toHaveBeenCalled();
    expect(props.onOpenPrivate).not.toHaveBeenCalled();
  });

  it("keeps the save form account-specific and contains no profile/account deletion action", () => {
    const html = renderToStaticMarkup(<AccountProfileEditor {...props} />);
    expect(ACCOUNT_PROFILE_FORM_ID).toBe("account-profile-editor-form");
    expect(html).toContain("account-profile-view manus-no-record");
    expect(html).not.toContain("data-account-user-id");
    expect(html).not.toContain("27");
    expect(html).not.toContain("ล้างข้อมูลโปรไฟล์");
    expect(html).not.toContain("ลบบัญชี");
  });
});
