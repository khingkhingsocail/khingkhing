import { useEffect, useId, useRef, useState } from "react";
import { ImagePlus, Film, UploadCloud, X, LockKeyhole } from "lucide-react";
import {
  addEvidenceFiles,
  EVIDENCE_ACCEPT,
  evidenceFileKey,
} from "@/lib/evidenceFiles";
import "./evidence.css";
export default function EvidenceFilePicker({
  files,
  onChange,
  disabled = false,
  existingCount = 0,
  existingBytes = 0,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
  existingCount?: number;
  existingBytes?: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [previews, setPreviews] = useState<{ key: string; url: string }[]>([]);
  useEffect(() => {
    const next = files.map(file => ({
      key: evidenceFileKey(file),
      url: URL.createObjectURL(file),
    }));
    setPreviews(next);
    return () => next.forEach(item => URL.revokeObjectURL(item.url));
  }, [files]);
  function add(added: File[]) {
    if (disabled) return;
    try {
      const result = addEvidenceFiles(
        files,
        added,
        existingCount,
        existingBytes
      );
      onChange(result);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "เลือกไฟล์ไม่ได้");
    }
  }
  return (
    <section
      className="evidence-picker manus-no-record"
      aria-label="กล่องแนบรูปภาพและวิดีโอเพื่อเป็นหลักฐาน"
    >
      <div className="evidence-picker__heading">
        <strong>แนบรูปภาพ / วิดีโอเป็นหลักฐาน</strong>
        <span>
          <LockKeyhole size={12} />
          ไม่เผยแพร่ในฟีด
        </span>
      </div>
      <div
        className={`evidence-dropzone${dragging && !disabled ? " is-dragging" : ""}${disabled ? " is-disabled" : ""}`}
        onDragOver={event => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={event => {
          if (
            !(event.relatedTarget instanceof Node) ||
            !event.currentTarget.contains(event.relatedTarget)
          )
            setDragging(false);
        }}
        onDrop={event => {
          event.preventDefault();
          setDragging(false);
          add(Array.from(event.dataTransfer.files));
        }}
      >
        <div className="evidence-dropzone__icons" aria-hidden="true">
          <ImagePlus size={25} />
          <Film size={25} />
        </div>
        <strong>ลากรูปภาพหรือวิดีโอมาวางที่นี่</strong>
        <p>หรือแตะปุ่มเพื่อเลือกจากเครื่องของคุณ</p>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          multiple
          accept={EVIDENCE_ACCEPT}
          disabled={disabled}
          tabIndex={-1}
          className="evidence-picker__input"
          aria-label="เลือกไฟล์หลักฐานรูปภาพหรือวิดีโอ"
          onChange={event => {
            add(Array.from(event.target.files ?? []));
            event.target.value = "";
          }}
        />
        <button
          type="button"
          className="arena-secondary"
          disabled={disabled}
          aria-controls={inputId}
          onClick={() => inputRef.current?.click()}
        >
          <UploadCloud size={16} />
          เลือกรูปภาพ / วิดีโอ
        </button>
        <small>
          JPG · PNG · WebP · MP4 · WebM
          <br />
          ไม่เกิน 20 MiB/ไฟล์ · รวมไม่เกิน 3 ไฟล์ / 50 MiB · วิดีโอไม่เกิน 3
          นาที
        </small>
      </div>
      {error ? (
        <p className="arena-error" role="alert">
          {error}
        </p>
      ) : null}
      <p className="evidence-picker__count" role="status">
        เลือกไว้ {files.length} ไฟล์
        {existingCount ? ` · แนบแล้ว ${existingCount} ไฟล์` : ""} ·
        ไฟล์ที่เลือกยังไม่ถูกอัปโหลด
      </p>
      {files.length ? (
        <div className="evidence-selected">
          {files.map(file => {
            const key = evidenceFileKey(file);
            const url = previews.find(p => p.key === key)?.url;
            return (
              <article key={key} className="evidence-selected__card">
                <div className="evidence-selected__preview">
                  {url ? (
                    file.type.startsWith("video/") ? (
                      <video
                        controls
                        preload="metadata"
                        playsInline
                        src={url}
                        aria-label={`ตัวอย่าง ${file.name}`}
                      />
                    ) : (
                      <img src={url} alt={`ตัวอย่างหลักฐาน ${file.name}`} />
                    )
                  ) : (
                    <ImagePlus size={22} />
                  )}
                </div>
                <div className="evidence-selected__info">
                  <b>{file.name}</b>
                  <span>
                    {file.type.startsWith("video/") ? "วิดีโอ" : "รูปภาพ"} ·{" "}
                    {(file.size / 1024 / 1024).toFixed(2)} MiB
                  </span>
                </div>
                <button
                  type="button"
                  className="arena-icon-button"
                  disabled={disabled}
                  aria-label={`นำ ${file.name} ออกจากรายการที่เลือก`}
                  onClick={() => {
                    onChange(files.filter(f => evidenceFileKey(f) !== key));
                    setError("");
                  }}
                >
                  <X size={16} />
                </button>
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
