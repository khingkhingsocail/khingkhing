import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ProfileSaveButton, { LOCAL_PROFILE_FORM_ID } from "./ProfileSaveButton";
describe("profile save button", () => {
  it("submits the real profile form even when rendered in page header", () => {
    const html = renderToStaticMarkup(
      <ProfileSaveButton saving={false} disabled={false} />
    );
    expect(html).toContain('type="submit"');
    expect(html).toContain(`form="${LOCAL_PROFILE_FORM_ID}"`);
    expect(html).toContain("บันทึกโปรไฟล์");
    expect(html).not.toContain('disabled=""');
  });
  it("prevents repeated saves and announces pending state", () => {
    const html = renderToStaticMarkup(
      <ProfileSaveButton saving disabled={false} />
    );
    expect(html).toContain("กำลังบันทึก…");
    expect(html).toContain('disabled=""');
    expect(html).toContain('aria-busy="true"');
  });
  it("disables saving while profile loads or image processing runs", () => {
    const html = renderToStaticMarkup(
      <ProfileSaveButton saving={false} disabled />
    );
    expect(html).toContain('disabled=""');
    expect(html).toContain("บันทึกโปรไฟล์");
  });
  it("both header and footer controls target the same form", () => {
    const html = renderToStaticMarkup(
      <>
        <ProfileSaveButton saving={false} disabled={false} />
        <ProfileSaveButton saving={false} disabled={false} />
      </>
    );
    expect(html.split(`form="${LOCAL_PROFILE_FORM_ID}"`)).toHaveLength(3);
  });
});
