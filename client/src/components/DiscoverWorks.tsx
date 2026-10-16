import { Compass, Trophy } from "lucide-react";
import type { ChatTarget } from "../../../shared/chat";
import WorkGallery from "./WorkGallery";
import KhingArena from "./arena/KhingArena";
import "./discover-works.css";

export type DiscoverSection = "works" | "khingkhing";

const sections = [
  {
    id: "works",
    label: "ผลงาน",
    description: "แกลเลอรีรูปและวิดีโอตัวอย่าง",
    Icon: Compass,
  },
  {
    id: "khingkhing",
    label: "ขิงขิง",
    description: "โปรไฟล์แข่งขัน · สถิติ · จัดอันดับ",
    Icon: Trophy,
  },
] as const;

export default function DiscoverWorks({
  section,
  onSectionChange,
  likedIds,
  savedIds,
  onOpenPost,
  onOpenChat,
}: {
  section: DiscoverSection;
  onSectionChange: (section: DiscoverSection) => void;
  likedIds: ReadonlySet<string>;
  savedIds: ReadonlySet<string>;
  onOpenPost: (id: string) => void;
  onOpenChat: (target: ChatTarget) => void;
}) {
  return (
    <section
      className="tool-view tool-view--gallery discover-works"
      aria-labelledby="gallery-title"
    >
      <header className="tool-view__header">
        <p className="tool-view__eyebrow">ขิงขิง · DISCOVER</p>
        <h1 id="gallery-title">ค้นพบผลงาน</h1>
        <p>
          ค้นพบรูปและวิดีโอ หรือเลือก “ขิงขิง”
          เพื่อโชว์สถิติและจัดอันดับโปรไฟล์ในหมวดที่คุณถนัด
        </p>
      </header>
      <div
        className="discover-sections"
        role="group"
        aria-label="หมวดค้นพบผลงาน"
      >
        {sections.map(({ id, label, description, Icon }) => (
          <button
            key={id}
            id={`discover-section-${id}`}
            type="button"
            className={`discover-section ${section === id ? "is-active" : ""}`}
            aria-pressed={section === id}
            aria-controls="discover-content"
            onClick={() => onSectionChange(id)}
          >
            <Icon size={23} aria-hidden="true" />
            <span>
              <strong>{label}</strong>
              <small>{description}</small>
            </span>
          </button>
        ))}
      </div>
      <div
        id="discover-content"
        role="region"
        aria-labelledby={`discover-section-${section}`}
      >
        {section === "khingkhing" ? (
          <KhingArena
            likedIds={likedIds}
            savedIds={savedIds}
            onOpenPost={onOpenPost}
            onOpenChat={onOpenChat}
          />
        ) : (
          <WorkGallery />
        )}
      </div>
    </section>
  );
}
