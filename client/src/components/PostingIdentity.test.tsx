import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import PostingIdentity from "./PostingIdentity";

describe("posting identity notice", () => {
  it("tells guests they remain anonymous", () => {
    const html = renderToStaticMarkup(<PostingIdentity user={null} />);
    expect(html).toContain("โพสต์ในฐานะผู้เข้าชม");
    expect(html).toContain("ไม่ระบุตัวตน");
  });
  it("shows account identity loading and explains public name and avatar, not other fields", () => {
    const html = renderToStaticMarkup(
      <PostingIdentity user={{ id: 7, name: "Account" }} />
    );
    expect(html).toContain("กำลังโหลดโปรไฟล์");
    expect(html).toContain("ทุกคนเห็นชื่อ ชื่อผู้ใช้ และรูปโปรไฟล์บนโพสต์");
    expect(html).toContain("ไม่เผยรูปปกหรือข้อมูลส่วนตัวอื่น");
    expect(html).toContain("manus-no-record");
    expect(html).not.toContain("userId");
  });
});
