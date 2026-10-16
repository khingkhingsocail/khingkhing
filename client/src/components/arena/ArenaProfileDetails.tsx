import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ExternalLink,
  ShieldAlert,
  MessageCircle,
} from "lucide-react";
import type { ArenaEntry, ArenaProfile } from "../../../../shared/arena";
import { arenaCapabilities, fetchArenaProfile } from "@/lib/arena";
import RankIdentity from "./RankIdentity";
import EvidencePanel from "./EvidencePanel";
import { reviewLabels } from "../../../../shared/verification";
import RankingViewBadge from "../RankingViewBadge";

export default function ArenaProfileDetails({
  id,
  rank,
  onBack,
  onEdit,
  onChat,
}: {
  id: string;
  rank?: number;
  onBack: () => void;
  onEdit: () => void;
  onChat?: () => void;
}) {
  const [data, setData] = useState<{
    profile: ArenaProfile;
    entries: ArenaEntry[];
  } | null>(null);
  const [error, setError] = useState("");
  const [evidenceEntry, setEvidenceEntry] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const backRef = useRef(onBack);
  backRef.current = onBack;
  useEffect(() => {
    let active = true;
    fetchArenaProfile(id)
      .then(value => {
        if (active) setData(value);
      })
      .catch(cause => {
        if (active)
          setError(
            cause instanceof Error ? cause.message : "เปิดโปรไฟล์ไม่สำเร็จ"
          );
      });
    return () => {
      active = false;
    };
  }, [id]);
  useEffect(() => {
    headingRef.current?.focus();
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") backRef.current();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  function backupCapability() {
    const token = arenaCapabilities()[id];
    if (!token) return;
    const blob = new Blob(
      [
        JSON.stringify({
          profileId: id,
          editToken: token,
          origin: window.location.origin,
        }),
      ],
      { type: "application/json" }
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `khingkhing-profile-${id.slice(0, 8)}-private-key.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <section
      className="arena-profile-details"
      aria-labelledby="arena-profile-title"
    >
      <button type="button" className="arena-back" onClick={onBack}>
        <ArrowLeft size={16} />
        กลับอันดับ
      </button>
      <h2 id="arena-profile-title" ref={headingRef} tabIndex={-1}>
        โปรไฟล์ขิงขิง
      </h2>
      {error ? (
        <p className="arena-error" role="alert">
          {error}
        </p>
      ) : null}
      {!data && !error ? <p role="status">กำลังโหลดโปรไฟล์…</p> : null}
      {data ? (
        <>
          <div className="arena-profile-card">
            <RankIdentity profile={data.profile} rank={rank} />
            <p>{data.profile.bio || "ยังไม่มีแนะนำตัว"}</p>
            {onChat && !arenaCapabilities()[id] ? (
              <button
                type="button"
                className="arena-secondary"
                onClick={onChat}
              >
                <MessageCircle size={15} />
                ส่งข้อความส่วนตัว
              </button>
            ) : null}
            <span className="arena-verification">
              <ShieldAlert size={13} />
              ผู้เข้าร่วมรายงานเอง · ยังไม่ยืนยันตัวตนหรือสถิติ
            </span>
            {arenaCapabilities()[id] ? (
              <div className="arena-own-actions">
                <button
                  type="button"
                  className="arena-secondary"
                  onClick={onEdit}
                >
                  แก้โปรไฟล์ / ลงสถิติ
                </button>
                <button
                  type="button"
                  className="arena-secondary"
                  onClick={backupCapability}
                >
                  สำรองรหัสแก้ (ส่วนตัว)
                </button>
                <p>
                  ผู้ถือรหัสแก้สามารถแก้โปรไฟล์นี้ได้ ห้ามแชร์ไฟล์รหัส ·
                  การล้างข้อมูลเว็บไซต์จะทำให้สิทธิ์ในเครื่องหาย
                </p>
              </div>
            ) : null}
          </div>
          <h3>สถิติที่นำมาโชว์</h3>
          {data.entries.length ? (
            <div className="arena-records">
              {data.entries.map(entry => (
                <article key={entry.id}>
                  <div>
                    <strong>{entry.title}</strong>
                    <span>
                      {entry.period} · วัดเมื่อ {entry.observedAt}
                    </span>
                  </div>
                  <b>
                    {new Intl.NumberFormat("th-TH", {
                      maximumFractionDigits: 6,
                    }).format(entry.value)}{" "}
                    <small>{entry.unit}</small>
                  </b>
                  <p>
                    {entry.verification === "verified"
                      ? "ผู้ดูแลรับรองแล้ว"
                      : "ผู้ใช้รายงานเอง"}{" "}
                    ·{" "}
                    {entry.direction === "higher"
                      ? "ค่ามากดีกว่า"
                      : "ค่าน้อยดีกว่า"}
                  </p>
                  <p className="evidence-status">
                    {reviewLabels[entry.reviewStatus ?? "none"]}
                  </p>
                  <RankingViewBadge
                    target={{ kind: "community-entry", key: entry.id }}
                  />
                  {arenaCapabilities()[id] ? (
                    <button
                      type="button"
                      className="arena-secondary"
                      onClick={() => setEvidenceEntry(entry.id)}
                    >
                      แนบหลักฐาน / ตรวจด้วย AI
                    </button>
                  ) : null}
                  {entry.evidenceUrl ? (
                    <a
                      href={entry.evidenceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      ดูหลักฐานภายนอก <ExternalLink size={12} />
                    </a>
                  ) : (
                    <small>ยังไม่ได้แนบหลักฐาน</small>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <div className="arena-empty">ยังไม่ได้ลงสถิติแข่งขัน</div>
          )}
          {evidenceEntry ? (
            <EvidencePanel
              key={evidenceEntry}
              entryId={evidenceEntry}
              profileId={id}
              owner={true}
              onClose={() => setEvidenceEntry(null)}
              onChanged={() => {
                void fetchArenaProfile(id)
                  .then(setData)
                  .catch(() => {});
              }}
            />
          ) : null}
          <p className="arena-fine-print">
            อันดับบนกรอบอ้างอิงรายการและเดือนที่เลือกบนหน้าจัดอันดับเท่านั้น
            ไม่ใช่ความสามารถรวมทุกหมวดหรืออันดับโลกอย่างเป็นทางการ ·
            ยอดเปิดดูนับการคลิกจากรายการอันดับ ไม่ใช่จำนวนคนไม่ซ้ำ
          </p>
        </>
      ) : null}
    </section>
  );
}
