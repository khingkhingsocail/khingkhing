import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import RankIdentity from "./RankIdentity";
import ArenaEntryForm from "./ArenaEntryForm";
import { arenaBoards } from "../../../../shared/arena";

const profile = {
  id: "a".repeat(32),
  displayName: "Tester",
  handle: "tester",
  avatar: null,
  bio: "",
  createdAt: "2026-10-01T00:00:00Z",
};
describe("Arena profile rendering", () => {
  it("maps ranking to honest nameplate and clickable profile", () => {
    for (const [rank, tier] of [
      [1, "champion"],
      [2, "challenger"],
      [3, "elite"],
      [4, "contender"],
    ] as const) {
      const html = renderToStaticMarkup(
        <RankIdentity profile={profile} rank={rank} onClick={() => {}} />
      );
      expect(html).toContain(`rank-identity--${tier}`);
      expect(html).toContain(`อันดับ ${rank}`);
      expect(html).toContain(`data-arena-profile="${profile.id}"`);
      expect(html).not.toContain("ยืนยัน");
    }
  });
  it("does not give an unranked profile a fabricated first place", () => {
    const html = renderToStaticMarkup(<RankIdentity profile={profile} />);
    expect(html).toContain("CONTENDER");
    expect(html).not.toContain("#1");
  });
  it("keeps newly created public form independent of private local profile", () => {
    const html = renderToStaticMarkup(
      <ArenaEntryForm
        boards={arenaBoards}
        defaultBoard="sports:run100"
        defaultPeriod="2026-10"
        onClose={() => {}}
        onSaved={() => {}}
      />
    );
    expect(html).toContain("ไม่คัดลอกโปรไฟล์หรือรูปส่วนตัวเดิม");
    expect(html).toContain("ชื่อที่อยากให้ทุกคนเห็น");
    expect(html).toContain('type="checkbox"');
    expect(html).not.toContain('checked=""');
    expect(html).toContain("บันทึกโปรไฟล์และสถิติสาธารณะ");
    expect(html).not.toContain('value="khingkhing"');
  });
});
