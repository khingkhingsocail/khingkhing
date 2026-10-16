import { useEffect, useState } from "react";
import { ArrowUpRight, Check, ImagePlus, LockKeyhole, Pencil, Send, Trash2, Video, X } from "lucide-react";
import {
  clearLocalMedia,
  deleteLocalMedia,
  getAllLocalMedia,
  updateLocalMedia,
  type LocalMediaRecord,
} from "@/lib/localMedia";
import MediaLightbox, { FullscreenMediaButton } from "./MediaLightbox";
import { uploadPublicMedia } from "@/lib/publicMedia";

function useBlobUrl(blob: Blob | undefined) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!blob) {
      setUrl("");
      return;
    }
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);
  return url;
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function MediaTile({
  item,
  onEdit,
  onDelete,
  onPublish,
  publishing,
}: {
  item: LocalMediaRecord;
  onEdit: (item: LocalMediaRecord) => void;
  onDelete: (item: LocalMediaRecord) => void;
  onPublish: (item: LocalMediaRecord) => void;
  publishing: boolean;
}) {
  const src = useBlobUrl(item.file);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const date = new Date(item.createdAt);
  const dateLabel = Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("th-TH", { dateStyle: "medium" }).format(date);
  return (
    <article className="local-card">
      <div className="local-card__preview">
        {src && item.kind === "image" ? <img src={src} alt={item.name} loading="lazy" /> : null}
        {src && item.kind === "video" ? <video src={src} controls preload="metadata" aria-label={item.name} /> : null}
        {!src ? <div className="local-card__empty">กำลังเปิดไฟล์…</div> : null}
        {src ? <FullscreenMediaButton label={item.kind === "video" ? "วิดีโอ" : "รูปภาพ"} onClick={() => setLightboxOpen(true)} /> : null}
        <span className="local-card__badge">{item.kind === "video" ? <Video size={13} /> : <ImagePlus size={13} />}{item.kind === "video" ? "ส่วนตัว · วิดีโอ" : "ส่วนตัว · รูปภาพ"}</span>
      </div>
      <MediaLightbox open={lightboxOpen} src={src} kind={item.kind} title={item.name} onClose={() => setLightboxOpen(false)} />
      <div className="local-card__body">
        <div className="local-card__text">
          <h3>{item.name}</h3>
          {item.description ? <p>{item.description}</p> : <p className="muted-copy">ยังไม่มีคำอธิบาย</p>}
        </div>
        <p className="local-card__date">{dateLabel}{dateLabel ? " · " : ""}{formatBytes(item.file.size)}</p>
        <div className="local-card__actions">
          <button type="button" className="text-button text-button--publish" disabled={publishing} onClick={() => onPublish(item)}><Send size={14} />{publishing ? "กำลังโพสต์…" : "โพสต์ขึ้นฟีด"}</button>
          <button type="button" className="text-button" onClick={() => onEdit(item)}><Pencil size={14} />แก้ไขข้อมูล</button>
          <button type="button" className="text-button text-button--danger" onClick={() => onDelete(item)}><Trash2 size={14} />ลบไฟล์</button>
        </div>
      </div>
    </article>
  );
}

export default function LocalMediaLibrary({ onViewFeed }: { onViewFeed: () => void }) {
  const [items, setItems] = useState<LocalMediaRecord[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [publishingId, setPublishingId] = useState<string | null>(null);

  async function refreshItems() {
    const stored = await getAllLocalMedia();
    setItems(stored);
  }

  useEffect(() => {
    let active = true;
    getAllLocalMedia()
      .then((stored) => { if (active) setItems(stored); })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "เปิดคลังส่วนตัวไม่สำเร็จ"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  function beginEdit(item: LocalMediaRecord) {
    setEditingId(item.id);
    setEditName(item.name);
    setEditDescription(item.description);
    setError("");
    setMessage("");
  }

  async function saveEdit(item: LocalMediaRecord) {
    try {
      await updateLocalMedia({ ...item, name: editName.trim() || item.name, description: editDescription.trim() });
      await refreshItems();
      setEditingId(null);
      setMessage("อัปเดตชื่อและคำอธิบายของไฟล์ส่วนตัวแล้ว");
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "อัปเดตข้อมูลไม่สำเร็จ");
    }
  }

  async function deleteItem(item: LocalMediaRecord) {
    if (!window.confirm(`ลบ “${item.name}” ออกจากคลังส่วนตัวของเบราว์เซอร์นี้หรือไม่?`)) return;
    try {
      await deleteLocalMedia(item.id);
      await refreshItems();
      setMessage("ลบไฟล์ส่วนตัวออกจากเบราว์เซอร์นี้แล้ว");
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ลบไฟล์ไม่สำเร็จ");
    }
  }

  async function deleteAll() {
    if (!items.length || !window.confirm("ลบไฟล์ส่วนตัวเดิมทั้งหมดจากเบราว์เซอร์นี้หรือไม่? การลบนี้ย้อนกลับไม่ได้")) return;
    try {
      await clearLocalMedia();
      setItems([]);
      setMessage("ล้างคลังส่วนตัวเดิมในเบราว์เซอร์นี้แล้ว");
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ล้างคลังไม่สำเร็จ");
    }
  }

  async function publishItem(item: LocalMediaRecord) {
    if (publishingId) return;
    setPublishingId(item.id);
    setError("");
    setMessage("");
    try {
      const uploadFile = new File([item.file], item.name, {
        type: item.file.type || (item.kind === "video" ? "video/mp4" : "image/jpeg"),
      });
      const result = await uploadPublicMedia(uploadFile, item.name, item.description, false);
      setMessage(`โพสต์ “${result.item.title}” ขึ้นฟีดสาธารณะแล้ว`);
      onViewFeed();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "โพสต์ขึ้นฟีดไม่สำเร็จ");
    } finally {
      setPublishingId(null);
    }
  }

  return (
    <div className="local-library">
      <div className="privacy-panel">
        <div className="privacy-panel__icon"><LockKeyhole size={19} /></div>
        <div className="privacy-panel__copy">
          <strong>ไฟล์เดิม · ส่วนตัวบนเบราว์เซอร์นี้</strong>
          <p>รายการนี้อยู่ใน IndexedDB ของเบราว์เซอร์เดิมเท่านั้น ไม่ถูกย้ายหรือเผยแพร่เมื่อเปิดฟีดสาธารณะ ไฟล์ใหม่จะใช้หน้าโพสต์สาธารณะ</p>
        </div>
        <span className="privacy-panel__count">{items.length.toString().padStart(2, "0")} ไฟล์</span>
      </div>

      {error ? <p className="feedback feedback--error" role="alert">{error}</p> : null}
      {message ? <p className="feedback feedback--success" role="status">{message}</p> : null}

      <div className="private-list-heading">
        <div><p className="eyebrow">EXISTING LOCAL MEDIA · NOT PUBLIC</p><h3>ไฟล์ส่วนตัวเดิมของฉัน</h3></div>
        <div className="private-list-heading__actions">
          <button type="button" className="text-button" onClick={onViewFeed}>ดูในฟีด <ArrowUpRight size={14} /></button>
          {items.length ? <button type="button" className="text-button text-button--danger" onClick={() => void deleteAll()}><Trash2 size={15} />ล้างทั้งหมด</button> : null}
        </div>
      </div>

      {loading ? <p className="empty-library">กำลังเปิดคลังส่วนตัว…</p> : null}
      {!loading && items.length === 0 ? (
        <div className="empty-library">
          <span className="empty-library__mark"><ImagePlus size={21} /></span>
          <strong>ไม่พบไฟล์ส่วนตัวเดิมในเบราว์เซอร์นี้</strong>
          <span>โพสต์ใหม่จะเป็นสาธารณะตามการตั้งค่าปัจจุบัน ส่วนไฟล์เดิมจะไม่ถูกย้ายหรือเผยแพร่</span>
        </div>
      ) : null}

      {items.length ? (
        <div className="local-grid">
          {items.map((item) => (
            <div key={item.id}>
              <MediaTile item={item} onEdit={beginEdit} onDelete={(entry) => void deleteItem(entry)} onPublish={(entry) => void publishItem(entry)} publishing={publishingId === item.id} />
              {editingId === item.id ? (
                <form className="edit-form" onSubmit={(event) => { event.preventDefault(); void saveEdit(item); }}>
                  <label className="field-label">ชื่อผลงาน<input autoFocus value={editName} onChange={(event) => setEditName(event.target.value)} maxLength={100} /></label>
                  <label className="field-label">คำอธิบาย<input value={editDescription} onChange={(event) => setEditDescription(event.target.value)} maxLength={240} /></label>
                  <div className="edit-form__actions">
                    <button className="button button--small button--lime" type="submit"><Check size={15} />บันทึก</button>
                    <button className="icon-button" type="button" onClick={() => setEditingId(null)} aria-label="ยกเลิกการแก้ไข"><X size={17} /></button>
                  </div>
                </form>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      <p className="storage-footnote"><LockKeyhole size={13} /> ข้อมูลนี้อยู่ในเบราว์เซอร์/อุปกรณ์เดิม ไม่ใช่คลังออนไลน์</p>
    </div>
  );
}
