import { useCallback, useEffect, useRef, useState } from "react";
import {
  FileImage,
  Film,
  ShieldCheck,
  Upload,
  X,
  ExternalLink,
  Trash2,
  ScanSearch,
} from "lucide-react";
import {
  reviewLabels,
  type EvidenceBundle,
  type EvidenceReview,
} from "../../../../shared/verification";
import {
  deleteEvidence,
  evidenceObjectUrl,
  fetchEvidenceBundle,
  reviewEvidence,
  uploadEvidence,
} from "@/lib/verification";
import EvidenceFilePicker from "./EvidenceFilePicker";
import { evidenceFileKey, uploadEvidenceQueue } from "@/lib/evidenceFiles";

export function EvidenceReport({ review }: { review: EvidenceReview }) {
  const report = review.report;
  return (
    <article className="evidence-report">
      <header>
        <strong>{reviewLabels[review.status]}</strong>
        <small>
          {new Date(review.createdAt).toLocaleString("th-TH")} · {review.model}
        </small>
      </header>
      {review.stale ? (
        <p className="arena-error">
          ข้อมูลหรือหลักฐานเปลี่ยนแล้ว ผลนี้ใช้กับเวอร์ชันเก่าเท่านั้น
        </p>
      ) : null}
      {review.error ? <p className="arena-error">{review.error}</p> : null}
      {report ? (
        <>
          <p>{report.summary}</p>
          <div className="evidence-extraction">
            <span>
              ค่าที่ AI อ่าน:{" "}
              <b>
                {report.extractedValue ?? "อ่านไม่ได้"}{" "}
                {report.extractedUnit ?? ""}
              </b>
            </span>
            <span>วันที่ที่อ่าน: {report.extractedDate ?? "อ่านไม่ได้"}</span>
            <span>
              ชื่อ/handle:{" "}
              {report.identityMatch === "supported"
                ? "ข้อความชื่อสอดคล้อง"
                : report.identityMatch === "mismatch"
                  ? "ไม่สอดคล้อง"
                  : "ยังไม่ชัดเจน"}{" "}
              (ไม่ใช่การยืนยันตัวตน)
            </span>
          </div>
          {report.observations.length ? (
            <>
              <h5>สิ่งที่พบในหลักฐาน</h5>
              <ul>
                {report.observations.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </>
          ) : null}
          {report.discrepancies.length ? (
            <>
              <h5>ข้อมูลที่ไม่สอดคล้อง</h5>
              <ul>
                {report.discrepancies.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </>
          ) : null}
          <h5>ข้อจำกัดของผลตรวจ</h5>
          <ul>
            {[...report.limitations, ...review.coverage].map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
          {review.sources.length ? (
            <>
              <h5>หน้าอ้างอิงที่ระบบอ่านจริง</h5>
              <div className="evidence-sources">
                {review.sources.map((source, i) => (
                  <details key={i}>
                    <summary>
                      <span>
                        {report.sourceIndices.includes(i)
                          ? "AI อ้างสนับสนุน · "
                          : ""}
                        {source.title}
                      </span>
                      <small>
                        {source.tier === "institution"
                          ? "องค์กร/สถาบัน"
                          : source.tier === "platform"
                            ? "แพลตฟอร์มต้นทาง"
                            : "เว็บอื่น"}
                      </small>
                    </summary>
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      เปิดแหล่งอ้างอิง <ExternalLink size={12} />
                    </a>
                    <p>
                      อ่านเมื่อ{" "}
                      {new Date(source.retrievedAt).toLocaleString("th-TH")} ·
                      SHA-256 {source.sha256.slice(0, 16)}…
                    </p>
                    <blockquote>{source.excerpt.slice(0, 2000)}</blockquote>
                  </details>
                ))}
              </div>
            </>
          ) : (
            <p className="arena-fine-print">
              ไม่มีหน้าอ้างอิงสาธารณะที่อ่านสำเร็จ
            </p>
          )}
        </>
      ) : null}
      <footer>
        {review.stale
          ? "ผลตัดสินเวอร์ชันเก่า ไม่ใช้รับรองสถิติปัจจุบัน"
          : review.decision === "approved"
            ? "ผู้ดูแลรับรองสถิติเวอร์ชันนี้แล้ว"
            : review.decision === "rejected"
              ? "ผู้ดูแลไม่รับรองสถิติเวอร์ชันนี้"
              : "ผล AI เท่านั้น · ยังไม่รับรองโดยผู้ดูแล"}
        {review.decisionReason ? <p>{review.decisionReason}</p> : null}
      </footer>
    </article>
  );
}
export default function EvidencePanel({
  entryId,
  profileId,
  owner,
  onChanged,
  onClose,
}: {
  entryId: string;
  profileId?: string;
  owner: boolean;
  onChanged?: () => void;
  onClose: () => void;
}) {
  const [bundle, setBundle] = useState<EvidenceBundle | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [consent, setConsent] = useState(false);
  const [publicLookup, setPublicLookup] = useState(true);
  const [sources, setSources] = useState("");
  const [preview, setPreview] = useState<{
    url: string;
    kind: "image" | "video";
    name: string;
  } | null>(null);
  const urlsRef = useRef<string[]>([]);
  const previewRequestRef = useRef(0);
  const activeRef = useRef(true);
  const refresh = useCallback(async () => {
    const result = await fetchEvidenceBundle(entryId, profileId);
    if (activeRef.current) setBundle(result);
  }, [entryId, profileId]);
  useEffect(() => {
    activeRef.current = true;
    void refresh().catch(cause => {
      if (activeRef.current)
        setError(cause instanceof Error ? cause.message : "โหลดหลักฐานไม่ได้");
    });
    return () => {
      activeRef.current = false;
      previewRequestRef.current++;
      urlsRef.current.forEach(URL.revokeObjectURL);
      urlsRef.current = [];
    };
  }, [refresh]);
  const latest = bundle?.reviews[0];
  async function upload() {
    if (!owner || !profileId || !bundle) return;
    if (!consent) {
      setError("ยืนยันการจัดเก็บและส่ง AI ก่อน");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await uploadEvidenceQueue(
        files,
        file => uploadEvidence(entryId, profileId, file, bundle.entryRevision),
        file => {
          setFiles(current =>
            current.filter(
              item => evidenceFileKey(item) !== evidenceFileKey(file)
            )
          );
        }
      );
      setMessage("อัปโหลดหลักฐานแล้ว ไฟล์ไม่ถูกเผยแพร่ในฟีด");
      await refresh();
      onChanged?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "อัปโหลดไม่สำเร็จ");
      await refresh().catch(() => {});
    } finally {
      if (activeRef.current) setBusy(false);
    }
  }
  async function analyze() {
    if (!owner || !profileId || !consent) return;
    setBusy(true);
    setError("");
    setMessage(
      "AI กำลังอ่านภาพ/เฟรมและค้นข้อมูลสาธารณะ อาจใช้เวลาประมาณ 3 นาที"
    );
    try {
      const urls = sources
        .split("\n")
        .map(s => s.trim())
        .filter(Boolean);
      if (urls.length > 3)
        throw new Error("แนบแหล่งอ้างอิงเพิ่มได้ไม่เกิน 3 ลิงก์");
      await reviewEvidence(entryId, profileId, urls, publicLookup);
      setMessage("ตรวจเสร็จแล้ว กรุณาอ่านข้อจำกัดและแหล่งอ้างอิง");
      await refresh();
      onChanged?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ตรวจไม่สำเร็จ");
      await refresh().catch(() => {});
    } finally {
      if (activeRef.current) setBusy(false);
    }
  }
  async function openEvidence(
    id: string,
    kind: "image" | "video",
    name: string
  ) {
    const requestId = ++previewRequestRef.current;
    setError("");
    try {
      const url = await evidenceObjectUrl(id, profileId);
      if (!activeRef.current || requestId !== previewRequestRef.current) {
        URL.revokeObjectURL(url);
        return;
      }
      urlsRef.current.forEach(URL.revokeObjectURL);
      urlsRef.current = [url];
      setPreview({ url, kind, name });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "เปิดไม่ได้");
    }
  }
  function closePreview() {
    previewRequestRef.current++;
    urlsRef.current.forEach(URL.revokeObjectURL);
    urlsRef.current = [];
    setPreview(null);
  }
  async function removeEvidence(id: string) {
    if (
      !profileId ||
      !window.confirm(
        "ลบหลักฐานนี้และทำให้ผลตรวจเก่าไม่ใช้รับรองสถิติอีกต่อไป?"
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await deleteEvidence(id, profileId);
      await refresh();
      onChanged?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ลบไม่ได้");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="evidence-panel manus-no-record"
      aria-labelledby={`evidence-heading-${entryId}`}
    >
      <header className="arena-section-heading">
        <div>
          <p>AI EVIDENCE REVIEW</p>
          <h3 id={`evidence-heading-${entryId}`}>
            <ShieldCheck size={19} /> ตรวจสอบหลักฐานสถิติ
          </h3>
        </div>
        <button
          type="button"
          className="arena-icon-button"
          aria-label="ปิดแผงหลักฐาน"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </header>
      <p className="arena-note">
        หลักฐานเปิดได้เฉพาะผู้ถือรหัสเจ้าของและผู้ดูแล · AI
        ไม่รับประกันความแท้/ความแม่นยำ 100% · ไม่ใช่การรับรองสถิติโลก
      </p>
      {!bundle && !error ? <p role="status">กำลังโหลดหลักฐาน…</p> : null}
      {bundle ? (
        <>
          <div className="evidence-files">
            {bundle.evidence.map(file => (
              <div key={file.id}>
                {file.kind === "video" ? (
                  <Film size={18} />
                ) : (
                  <FileImage size={18} />
                )}
                <span>
                  <b>
                    {file.filename}
                    {file.stale
                      ? " · เวอร์ชันเก่า (ไม่ส่ง AI เวอร์ชันนี้)"
                      : ""}
                  </b>
                  <small>
                    {(file.size / 1024 / 1024).toFixed(2)} MiB
                    {file.duration
                      ? ` · ${file.duration.toFixed(1)} วินาที`
                      : ""}{" "}
                    · SHA-256 {file.sha256.slice(0, 10)}…
                  </small>
                </span>
                <button
                  type="button"
                  className="arena-secondary"
                  onClick={() =>
                    void openEvidence(file.id, file.kind, file.filename)
                  }
                >
                  เปิด
                </button>
                {owner ? (
                  <button
                    type="button"
                    className="arena-icon-button"
                    disabled={busy}
                    aria-label={`ลบ ${file.filename}`}
                    onClick={() => void removeEvidence(file.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
          {!bundle.evidence.length ? (
            <p className="arena-fine-print">ยังไม่มีไฟล์หลักฐานในเวอร์ชันนี้</p>
          ) : null}
        </>
      ) : null}
      {preview ? (
        <div className="evidence-preview">
          <button
            type="button"
            className="arena-secondary"
            onClick={closePreview}
          >
            ปิดตัวอย่าง
          </button>
          <p>{preview.name}</p>
          {preview.kind === "video" ? (
            <video controls playsInline src={preview.url} />
          ) : (
            <img src={preview.url} alt="หลักฐานที่ส่งตรวจ" />
          )}
        </div>
      ) : null}
      {owner ? (
        <div className="evidence-upload">
          <EvidenceFilePicker
            files={files}
            onChange={next => {
              setFiles(next);
              setConsent(false);
            }}
            disabled={busy || !bundle}
            existingCount={
              bundle?.evidence.filter(file => !file.stale).length ?? 0
            }
            existingBytes={
              bundle?.evidence
                .filter(file => !file.stale)
                .reduce((sum, file) => sum + file.size, 0) ?? 0
            }
          />
          <p className="arena-fine-print">
            ปิดเลขบัญชี บัตร ที่อยู่ และข้อมูลส่วนตัวที่ไม่จำเป็นก่อนส่ง
            ถ่ายให้เห็นค่า/หน่วย/วันที่/ชื่อชัดเจน
            กีฬาใช้คลิปต่อเนื่องและวิธีวัดครบ
            การสุ่มเฟรมไม่สามารถพิสูจน์นับครบหรือเวลาแม่นยำได้
          </p>
          <label className="arena-consent">
            <input
              type="checkbox"
              checked={consent}
              disabled={busy}
              onChange={e => setConsent(e.target.checked)}
            />
            ยินยอมจัดเก็บไฟล์แบบไม่แสดงในฟีด และส่งหลักฐาน ชื่อ/handle
            และสถิติไปยังบริการ AI; การค้นเว็บจะใช้ชื่อ/handle ที่ระบุ
          </label>
          <button
            type="button"
            className="arena-secondary"
            disabled={busy || !consent || !files.length}
            onClick={() => void upload()}
          >
            <Upload size={14} />
            อัปโหลด {files.length ? `${files.length} ไฟล์` : ""}
          </button>
          <label className="arena-field evidence-source-input">
            ลิงก์อ้างอิงเพิ่มเติมที่สาธารณะยอมรับ (ไม่บังคับ, 1 ลิงก์/บรรทัด ≤3)
            <textarea
              disabled={busy}
              value={sources}
              onChange={e => setSources(e.target.value)}
              placeholder="https://worldathletics.org/… หรือหน้าโปรไฟล์ social ต้นทาง"
            />
          </label>
          <label className="arena-consent">
            <input
              type="checkbox"
              checked={publicLookup}
              disabled={busy}
              onChange={e => setPublicLookup(e.target.checked)}
            />
            ให้ AI ค้นเว็บหาแหล่งข้อมูลสาธารณะเพิ่ม และอ่านหน้าที่อ้างจริง
          </label>
          <button
            type="button"
            className="arena-primary"
            disabled={
              busy ||
              !consent ||
              files.length > 0 ||
              latest?.status === "running"
            }
            onClick={() => void analyze()}
          >
            <ScanSearch size={16} />
            {busy ? "กำลังประมวลผล…" : "ส่งให้ AI ตรวจสอบ"}
          </button>
          {files.length ? (
            <p className="arena-fine-print">
              อัปโหลดไฟล์ที่เลือกให้ครบก่อนส่ง AI ตรวจสอบ
            </p>
          ) : null}
          <p className="arena-fine-print">
            จำกัด AI 5 ครั้งต่อโปรไฟล์/วัน · ผล AI กับตราผู้ดูแลแยกกัน ·
            แก้สถิติ/ชื่อ/หลักฐานต้องตรวจใหม่
          </p>
        </div>
      ) : null}
      {message ? (
        <p role="status" className="arena-success">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="arena-error" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        className="arena-secondary"
        disabled={busy}
        onClick={() => void refresh().catch(cause => setError(cause.message))}
      >
        รีเฟรชผลตรวจ
      </button>
      {bundle?.reviews.map(review => (
        <EvidenceReport key={review.id} review={review} />
      ))}
    </section>
  );
}
