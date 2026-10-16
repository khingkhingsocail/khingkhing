import { useState } from "react";
import { ClipboardCheck, RefreshCw } from "lucide-react";
import {
  decideReview,
  fetchReviewQueue,
  type ReviewQueueItem,
} from "@/lib/verification";
import { reviewLabels } from "../../../../shared/verification";
import EvidencePanel from "./EvidencePanel";
import { openLoginPage } from "@/const";
export default function ReviewDesk() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ReviewQueueItem[]>([]);
  const [selected, setSelected] = useState<ReviewQueueItem | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  async function load() {
    setBusy(true);
    setError("");
    try {
      setItems((await fetchReviewQueue()).items);
      setOpen(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "เปิดคิวไม่ได้");
    } finally {
      setBusy(false);
    }
  }
  async function decide(decision: "approved" | "rejected") {
    if (!selected) return;
    if (reason.trim().length < 10) {
      setError("ระบุเหตุผลอย่างน้อย 10 ตัวอักษร");
      return;
    }
    if (
      !window.confirm(
        `${decision === "approved" ? "รับรอง" : "ไม่รับรอง"}สถิติเวอร์ชันนี้ พร้อมเหตุผล: ${reason.trim()}?`
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await decideReview(
        selected.review.id,
        decision,
        reason.trim(),
        selected.review.snapshot,
        selected.profile.id
      );
      setSelected(null);
      setReason("");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ตัดสินไม่ได้");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="review-desk manus-no-record">
      <button
        type="button"
        className="arena-secondary"
        disabled={busy}
        onClick={() => void load()}
      >
        <ClipboardCheck size={15} />
        คิวทบทวนหลักฐาน (ผู้ดูแล)
      </button>
      {error ? (
        <div className="arena-error" role="alert">
          {error}
          <button type="button" onClick={() => openLoginPage()}>
            เข้าสู่ระบบผู้ดูแล
          </button>
        </div>
      ) : null}
      {open ? (
        <>
          <div className="arena-section-heading">
            <h3>คิวผู้ดูแล · ล่าสุด 100 รายการ</h3>
            <button
              type="button"
              className="arena-secondary"
              onClick={() => void load()}
              disabled={busy}
            >
              <RefreshCw size={13} />
              รีเฟรช
            </button>
          </div>
          <p className="arena-fine-print">
            ต้องทบทวนหลักฐานต้นฉบับ แหล่งอ้างอิง วิธีวัด ชื่อ/handle และช่วงเวลา
            ห้ามอาศัยคำตอบ AI เพียงอย่างเดียวหรือรับรองผลงานตนเอง
            การรับรองนี้เป็นของชุมชนขิงขิง ไม่ใช่ Guinness/สมาคมกีฬา
          </p>
          {!items.length ? <p>ไม่มีรายการรอทบทวน</p> : null}
          <div className="review-queue">
            {items.map(item => (
              <button
                type="button"
                key={item.review.id}
                className="arena-secondary"
                onClick={() => {
                  setSelected(item);
                  setReason("");
                }}
              >
                <span>
                  {item.profile.displayName} · @{item.profile.handle}
                  <b>
                    {item.entry.title}: {item.entry.value} {item.entry.unit} ·{" "}
                    {item.entry.period}
                  </b>
                  <small>{reviewLabels[item.review.status]}</small>
                </span>
              </button>
            ))}
          </div>
          {selected ? (
            <>
              <EvidencePanel
                key={selected.entry.id}
                entryId={selected.entry.id}
                owner={false}
                onClose={() => setSelected(null)}
              />
              <label className="arena-field">
                เหตุผลและหลักฐานที่ตรวจพบ (บันทึกใน audit)
                <textarea
                  maxLength={1000}
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                />
              </label>
              <div className="review-decision">
                <button
                  type="button"
                  className="arena-primary"
                  disabled={
                    busy ||
                    selected.review.stale ||
                    ["running", "failed"].includes(selected.review.status)
                  }
                  onClick={() => void decide("approved")}
                >
                  รับรองโดยผู้ดูแล
                </button>
                <button
                  type="button"
                  className="arena-secondary"
                  disabled={
                    busy ||
                    selected.review.stale ||
                    ["running", "failed"].includes(selected.review.status)
                  }
                  onClick={() => void decide("rejected")}
                >
                  ไม่รับรอง พร้อมเหตุผล
                </button>
              </div>
            </>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
