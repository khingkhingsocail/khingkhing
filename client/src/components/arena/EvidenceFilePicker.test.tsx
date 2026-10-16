import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import EvidenceFilePicker from "./EvidenceFilePicker";
import ArenaEntryForm from "./ArenaEntryForm";
import { arenaBoards } from "../../../../shared/arena";
describe("Evidence file picker", () => {
  it("renders a clear dropzone, keyboard button and private attachment notice", () => {
    const html = renderToStaticMarkup(
      <EvidenceFilePicker files={[]} onChange={() => {}} />
    );
    expect(html).toContain("ลากรูปภาพหรือวิดีโอมาวางที่นี่");
    expect(html).toContain("เลือกรูปภาพ / วิดีโอ");
    expect(html).toContain('type="button"');
    expect(html).toContain("multiple");
    expect(html).toContain(
      "image/jpeg,image/png,image/webp,video/mp4,video/webm"
    );
    expect(html).toContain("ไม่เผยแพร่ในฟีด");
    expect(html).toContain("manus-no-record");
  });
  it("shows selected file names/sizes/removal without claiming uploaded", () => {
    const files = [
      new File(["picture"], "proof.png", { type: "image/png" }),
      new File(["video"], "proof.mp4", { type: "video/mp4" }),
    ];
    const html = renderToStaticMarkup(
      <EvidenceFilePicker files={files} onChange={() => {}} />
    );
    expect(html).toContain("proof.png");
    expect(html).toContain("proof.mp4");
    expect(html).toContain("ยังไม่ถูกอัปโหลด");
    expect(html).toContain("นำ proof.png ออกจากรายการที่เลือก");
  });
  it("disables buttons and native input while busy", () => {
    const html = renderToStaticMarkup(
      <EvidenceFilePicker files={[]} onChange={() => {}} disabled />
    );
    expect(html).toContain("is-disabled");
    expect(html).toContain("disabled");
  });
  it("adds attachments directly to stats form with separate unchecked private consent", () => {
    const html = renderToStaticMarkup(
      <ArenaEntryForm
        boards={arenaBoards}
        defaultBoard="sports:run100"
        defaultPeriod="2026-10"
        onSaved={() => {}}
        onClose={() => {}}
      />
    );
    expect(html).toContain("แนบรูปภาพ / วิดีโอเป็นหลักฐาน");
    expect(html).toContain("ยินยอมจัดเก็บไฟล์เหล่านี้เป็นหลักฐานส่วนตัว");
    expect(html).toContain("ยังไม่ส่ง AI อัตโนมัติ");
    expect(html).not.toContain('checked=""');
  });
});
