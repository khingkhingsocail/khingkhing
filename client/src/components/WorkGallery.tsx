import { useEffect, useRef, useState } from "react";
import { Film, Play, X } from "lucide-react";

type WorkKind = "image" | "video";
type FilterKind = "all" | WorkKind;

interface WorkSample {
  id: string;
  kind: WorkKind;
  title: string;
  description: string;
  category: string;
  year: string;
  image: string;
  video?: string;
}

const samples: WorkSample[] = [
  {
    id: "night-walk",
    kind: "image",
    title: "ทางเดินหลังฝน",
    description: "ภาพตัวอย่างบรรยากาศเมืองยามค่ำ ใช้แสดงรูปแบบของการ์ดผลงาน",
    category: "ภาพถ่าย · ตัวอย่าง",
    year: "2026",
    image: "/manus-storage/urban-night-vertical_7f92afe2.jpg",
  },
  {
    id: "neon-corner",
    kind: "image",
    title: "แสงที่ปลายซอย",
    description: "ภาพตัวอย่างแสงสะท้อนและสีในเมือง ไม่ใช่ไฟล์ส่วนตัวที่ผู้ใช้เพิ่ม",
    category: "ภาพถ่าย · ตัวอย่าง",
    year: "2026",
    image: "/manus-storage/neon-street_d6f1f55d.jpg",
  },
  {
    id: "rain-window",
    kind: "image",
    title: "หลังม่านฝน",
    description: "อีกหนึ่งภาพตัวอย่างที่มากับเว็บไซต์ เพื่อทดลองดูหน้ารายละเอียด",
    category: "ภาพถ่าย · ตัวอย่าง",
    year: "2026",
    image: "/manus-storage/rainy-night_3e8a1617.jpg",
  },
  {
    id: "motion-study",
    kind: "video",
    title: "Motion study 01",
    description: "คลิปวิดีโอ CC0 ตัวอย่างจาก MDN สำหรับทดลองปุ่มเล่นและรายละเอียดวิดีโอ",
    category: "วิดีโอ · สาธิต",
    year: "CC0",
    image: "/manus-storage/async-images/xyvXnx4742KfNK69tXqO8e/image-1.webp",
    video: "/manus-storage/playfolio-flower_989f6926.mp4",
  },
];

const filters: { id: FilterKind; label: string }[] = [
  { id: "all", label: "ทั้งหมด" },
  { id: "image", label: "ภาพถ่าย" },
  { id: "video", label: "วิดีโอ" },
];

export default function WorkGallery() {
  const [filter, setFilter] = useState<FilterKind>("all");
  const [selected, setSelected] = useState<WorkSample | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const visibleSamples = samples.filter((item) => filter === "all" || item.kind === filter);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (selected && !dialog.open) dialog.showModal();
    if (!selected && dialog.open) dialog.close();
  }, [selected]);

  return (
    <>
      <div className="gallery-toolbar">
        <p className="gallery-toolbar__note">
          <span className="live-dot" aria-hidden="true" />
          ตัวอย่างจาก Unsplash · วิดีโอสาธิต CC0 จาก MDN
        </p>
        <div className="filter-tabs" role="group" aria-label="กรองประเภทผลงาน">
          {filters.map((item) => (
            <button
              key={item.id}
              className={`filter-tab ${filter === item.id ? "is-active" : ""}`}
              type="button"
              aria-pressed={filter === item.id}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="work-grid">
        {visibleSamples.map((item, index) => (
          <article className={`work-card work-card--${index + 1}`} key={item.id}>
            <button
              className={`work-card__visual ${item.kind === "video" ? "work-card__visual--video" : ""}`}
              type="button"
              onClick={() => setSelected(item)}
              aria-label={`เปิดรายละเอียด${item.kind === "video" ? "วิดีโอ" : "รูปภาพ"}: ${item.title}`}
            >
              <img src={item.image} alt="" loading="lazy" />
              {item.kind === "video" ? (
                <span className="video-play" aria-hidden="true">
                  <Play size={19} fill="currentColor" />
                </span>
              ) : null}
              <span className="work-card__index">0{index + 1}</span>
              <span className="work-card__type">
                {item.kind === "video" ? <Film size={13} /> : null}
                {item.kind === "video" ? "VIDEO" : "PHOTO"}
              </span>
              <span className="work-card__open">เปิดดู <span aria-hidden="true">↗</span></span>
            </button>
            <div className="work-card__meta">
              <div>
                <p className="work-card__category">{item.category}</p>
                <h3>{item.title}</h3>
              </div>
              <span className="work-card__year">{item.year}</span>
            </div>
          </article>
        ))}
      </div>

      <dialog
        className="detail-dialog"
        ref={dialogRef}
        aria-labelledby="work-detail-title"
        onClose={() => setSelected(null)}
      >
        {selected ? (
          <div className="detail-dialog__inner">
            <button className="icon-button detail-dialog__close" type="button" onClick={() => dialogRef.current?.close()} aria-label="ปิดรายละเอียด">
              <X size={20} />
            </button>
            <div className="detail-dialog__media">
              {selected.kind === "video" && selected.video ? (
                <video src={selected.video} poster={selected.image} controls autoPlay playsInline />
              ) : (
                <img src={selected.image} alt={selected.title} />
              )}
            </div>
            <div className="detail-dialog__copy">
              <p className="eyebrow">{selected.category} <span>·</span> {selected.year}</p>
              <h2 id="work-detail-title">{selected.title}</h2>
              <p>{selected.description}</p>
              <span className="sample-disclaimer">สื่อสาธิตที่มากับเว็บไซต์ ไม่ใช่ไฟล์ส่วนตัวของคุณ</span>
            </div>
          </div>
        ) : null}
      </dialog>
    </>
  );
}
