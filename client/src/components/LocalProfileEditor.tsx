import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { ArrowUpRight, Globe2, ImagePlus, LockKeyhole, MapPin, Pencil, Trash2, Undo2 } from "lucide-react";
import ProfileSaveButton, { LOCAL_PROFILE_FORM_ID } from "./ProfileSaveButton";
import {
  clearLocalProfile,
  createDefaultLocalProfile,
  getLocalProfile,
  normalizeProfileWebsite,
  prepareLocalProfileImage,
  saveLocalProfile,
  validateLocalProfile,
} from "@/lib/localProfile";
import type { LocalProfile, LocalProfileImageField } from "@/lib/localProfile";

interface LocalProfileEditorProps {
  onOpenUpload: () => void;
  onOpenPrivate: () => void;
}

function useObjectUrl(blob: Blob | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const nextUrl = URL.createObjectURL(blob);
    setUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [blob]);
  return url;
}

export default function LocalProfileEditor({ onOpenUpload, onOpenPrivate }: LocalProfileEditorProps) {
  const [profile, setProfile] = useState<LocalProfile>(() => createDefaultLocalProfile());
  const [savedProfile, setSavedProfile] = useState<LocalProfile>(() => createDefaultLocalProfile());
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [processingImage, setProcessingImage] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const saveLock = useRef(false);
  const avatarUrl = useObjectUrl(profile.avatar);
  const coverUrl = useObjectUrl(profile.cover);
  const websiteHref = profile.website ? normalizeProfileWebsite(profile.website) : "";
  const initial = Array.from(profile.displayName.trim())[0] ?? "ข";

  useEffect(() => {
    let active = true;
    getLocalProfile()
      .then((stored) => {
        if (!active) return;
        setProfile(stored);
        setSavedProfile(stored);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "อ่านโปรไฟล์ในเบราว์เซอร์นี้ไม่สำเร็จ");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  function updateField(field: "displayName" | "handle" | "bio" | "location" | "website" | "category", value: string) {
    setProfile((current) => ({ ...current, [field]: value }));
    setError("");
    setNotice("");
  }

  function chooseImage(field: LocalProfileImageField) {
    return (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.currentTarget.files?.[0];
      event.currentTarget.value = "";
      if (!file) return;
      setError("");
      setNotice("");
      setProcessingImage(true);
      void prepareLocalProfileImage(file, field)
        .then((blob) => {
          setProfile((current) => ({ ...current, [field]: blob }));
        })
        .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "เตรียมรูปภาพไม่สำเร็จ"))
        .finally(() => setProcessingImage(false));
    };
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saveLock.current || saving || loading || processingImage) return;
    const normalizedWebsite = normalizeProfileWebsite(profile.website);
    const next: LocalProfile = {
      ...profile,
      displayName: profile.displayName.trim(),
      handle: profile.handle.trim().normalize("NFC").toLowerCase(),
      bio: profile.bio.trim(),
      location: profile.location.trim(),
      website: normalizedWebsite ?? profile.website.trim(),
      category: profile.category.trim(),
      updatedAt: Date.now(),
    };
    const validationError = validateLocalProfile(next);
    if (validationError) {
      setError(validationError);
      return;
    }

    saveLock.current = true;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await saveLocalProfile(next);
      setProfile(next);
      setSavedProfile(next);
      setEditing(false);
      setNotice("บันทึกโปรไฟล์ไว้ในเบราว์เซอร์นี้แล้ว");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "บันทึกโปรไฟล์ไม่สำเร็จ กรุณาลองอีกครั้ง");
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }

  function cancelEditing() {
    setProfile(savedProfile);
    setEditing(false);
    setError("");
    setNotice("");
  }

  async function removeLocalProfile() {
    if (!window.confirm("ล้างรูปและข้อมูลโปรไฟล์ที่บันทึกไว้ในเบราว์เซอร์นี้หรือไม่? การล้าง site data ก็อาจทำให้ข้อมูลนี้หายได้")) return;
    setSaving(true);
    setError("");
    try {
      await clearLocalProfile();
      const fresh = createDefaultLocalProfile();
      setProfile(fresh);
      setSavedProfile(fresh);
      setEditing(false);
      setNotice("ล้างข้อมูลโปรไฟล์ในเบราว์เซอร์นี้แล้ว");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ล้างโปรไฟล์ไม่สำเร็จ กรุณาลองอีกครั้ง");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="tool-view profile-view" aria-labelledby="profile-title" aria-busy={loading || saving || processingImage}>
      <header className="tool-view__header profile-view__header">
        <div>
          <p className="tool-view__eyebrow">YOUR PROFILE · THIS BROWSER</p>
          <h1 id="profile-title">โปรไฟล์ของคุณ</h1>
          <p>แก้รูปโปรไฟล์ รูปปก และข้อมูลแนะนำตัวได้ ข้อมูลชุดนี้เก็บในเบราว์เซอร์นี้เท่านั้น</p>
        </div>
        {!editing ? (
          <button type="button" className="profile-action-button" onClick={() => { setEditing(true); setError(""); setNotice(""); }} disabled={loading}>
            <Pencil size={15} /> แก้ไขโปรไฟล์
          </button>
        ) : <div className="profile-header-actions">
          <ProfileSaveButton saving={saving} disabled={loading || processingImage} />
          <button type="button" className="profile-action-button profile-action-button--quiet" onClick={cancelEditing} disabled={saving || processingImage}><Undo2 size={15} /> ยกเลิก</button>
        </div>}
      </header>

      <div
        className={`profile-cover ${coverUrl ? "profile-cover--photo" : ""}`}
        style={coverUrl ? { backgroundImage: `linear-gradient(180deg,rgba(4,8,11,.1),rgba(4,8,11,.64)),url("${coverUrl}")` } : undefined}
        aria-label={coverUrl ? "รูปพื้นหลังโปรไฟล์ที่บันทึกไว้ในเบราว์เซอร์นี้" : undefined}
      >
        <span>{profile.category || "CREATIVE SPACE"}</span>
        <span className="profile-cover__spark" aria-hidden="true">✳</span>
      </div>

      <div className="profile-identity">
        <div className={`profile-avatar ${avatarUrl ? "profile-avatar--photo" : ""}`}>
          {avatarUrl ? <img src={avatarUrl} alt={`รูปโปรไฟล์ ${profile.displayName}`} /> : <span>{initial}</span>}
        </div>
        <div className="profile-identity__text">
          <p className="tool-view__eyebrow">LOCAL PROFILE</p>
          <h2>{profile.displayName}</h2>
          <p>@{profile.handle}</p>
        </div>
      </div>

      {loading ? <p className="profile-status" role="status">กำลังโหลดโปรไฟล์ในเครื่อง…</p> : null}
      {error ? <p className="profile-status profile-status--error" role="alert">{error}</p> : null}
      {notice ? <p className="profile-status profile-status--success" role="status">{notice}</p> : null}

      {editing ? (
        <form id={LOCAL_PROFILE_FORM_ID} className="profile-editor manus-no-record" onSubmit={handleSave}>
          <fieldset className="profile-editor__fieldset" disabled={saving || loading || processingImage}>
          <div className="profile-editor__images">
            <div className="profile-editor__image-field">
              <span className="profile-editor__label">รูปโปรไฟล์</span>
              <div className="profile-editor__image-row">
                <div className={`profile-avatar profile-editor__avatar ${avatarUrl ? "profile-avatar--photo" : ""}`}>
                  {avatarUrl ? <img src={avatarUrl} alt="ตัวอย่างรูปโปรไฟล์" /> : <span>{initial}</span>}
                </div>
                <div className="profile-editor__image-actions">
                  <label className="profile-action-button profile-action-button--quiet profile-file-label">
                    <ImagePlus size={15} /> เลือกรูป
                    <input className="profile-file-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseImage("avatar")} />
                  </label>
                  {profile.avatar ? <button className="profile-action-button profile-action-button--quiet" type="button" onClick={() => setProfile((current) => ({ ...current, avatar: null }))}><Trash2 size={14} /> เอาออก</button> : null}
                </div>
              </div>
            </div>
            <div className="profile-editor__image-field">
              <span className="profile-editor__label">รูปพื้นหลังโปรไฟล์</span>
              <div className={`profile-cover profile-editor__cover ${coverUrl ? "profile-cover--photo" : ""}`} style={coverUrl ? { backgroundImage: `linear-gradient(180deg,rgba(4,8,11,.1),rgba(4,8,11,.64)),url("${coverUrl}")` } : undefined}>
                <span>ตัวอย่างรูปปก</span>
              </div>
              <div className="profile-editor__image-actions">
                <label className="profile-action-button profile-action-button--quiet profile-file-label">
                  <ImagePlus size={15} /> เลือกรูปพื้นหลัง
                  <input className="profile-file-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseImage("cover")} />
                </label>
                {profile.cover ? <button className="profile-action-button profile-action-button--quiet" type="button" onClick={() => setProfile((current) => ({ ...current, cover: null }))}><Trash2 size={14} /> เอาออก</button> : null}
              </div>
            </div>
          </div>
          <p className="profile-editor__hint">เลือก JPG, PNG หรือ WebP ขนาดไม่เกิน 5 MB; รูปจะถูกย่อในเครื่องก่อนบันทึก และไม่ถูกอัปโหลด</p>

          <div className="profile-editor__fields">
            <label className="profile-editor__field">
              <span>ชื่อที่แสดง <b>*</b></span>
              <input value={profile.displayName} maxLength={60} onChange={(event) => updateField("displayName", event.target.value)} autoComplete="name" required />
            </label>
            <label className="profile-editor__field">
              <span>ชื่อผู้ใช้</span>
              <div className="profile-editor__handle"><span>@</span><input value={profile.handle} maxLength={24} onChange={(event) => updateField("handle", event.target.value.replace(/^@/, ""))} autoComplete="username" /></div>
              <small>เป็นชื่อแสดงในเครื่องนี้ ยังไม่ได้จองชื่อบัญชีบนเซิร์ฟเวอร์</small>
            </label>
            <label className="profile-editor__field profile-editor__field--wide">
              <span>แนะนำตัว <small>{profile.bio.length}/160</small></span>
              <textarea value={profile.bio} maxLength={160} rows={3} onChange={(event) => updateField("bio", event.target.value)} />
            </label>
            <label className="profile-editor__field">
              <span>หมวดหมู่</span>
              <input value={profile.category} maxLength={40} placeholder="เช่น ครีเอเตอร์, นักเล่นเกม" onChange={(event) => updateField("category", event.target.value)} />
            </label>
            <label className="profile-editor__field">
              <span>สถานที่ (ไม่บังคับ)</span>
              <input value={profile.location} maxLength={80} placeholder="เช่น กรุงเทพฯ" onChange={(event) => updateField("location", event.target.value)} autoComplete="address-level2" />
            </label>
            <label className="profile-editor__field profile-editor__field--wide">
              <span>เว็บไซต์หรือพอร์ตโฟลิโอ</span>
              <input type="text" inputMode="url" value={profile.website} maxLength={200} placeholder="https://example.com" onChange={(event) => updateField("website", event.target.value)} autoComplete="url" />
            </label>
          </div>

          <div className="profile-card-note profile-editor__privacy"><LockKeyhole size={18} /><p><strong>เก็บไว้ในเบราว์เซอร์นี้เท่านั้น</strong><br />ข้อมูลโปรไฟล์และรูปไม่ถูกส่งไป server หรือแสดงให้ผู้ใช้อื่น; คนที่เข้าถึงเบราว์เซอร์นี้อาจเห็นข้อมูลได้ และการล้าง site data อาจลบข้อมูลนี้</p></div>
          {processingImage ? <p className="profile-status" role="status">กำลังย่อรูปในอุปกรณ์นี้…</p> : null}
          <div className="profile-actions profile-editor__actions">
            <ProfileSaveButton saving={saving} disabled={loading || processingImage} />
            <button type="button" className="profile-action-button profile-action-button--quiet" onClick={cancelEditing} disabled={saving || processingImage}><Undo2 size={15} /> ยกเลิก</button>
            <button type="button" className="profile-action-button profile-action-button--danger" onClick={() => void removeLocalProfile()} disabled={saving || processingImage}><Trash2 size={15} /> ล้างข้อมูลโปรไฟล์</button>
          </div>
          </fieldset>
        </form>
      ) : (
        <>
          <div className="profile-bio"><p>{profile.bio || "ยังไม่มีข้อความแนะนำตัว"}</p></div>
          <div className="profile-details">
            {profile.category ? <span><ImagePlus size={15} /> {profile.category}</span> : null}
            {profile.location ? <span><MapPin size={15} /> {profile.location}</span> : null}
            {websiteHref ? <a href={websiteHref} target="_blank" rel="noreferrer"><Globe2 size={15} /> {profile.website}</a> : null}
          </div>
          <div className="profile-stats"><span><strong>OPEN</strong> ฟีดสาธารณะ</span><span><strong>LOCAL</strong> โปรไฟล์นี้อยู่ในเครื่อง</span><span><strong>1,000 MB</strong> ขนาดสูงสุด/ไฟล์สาธารณะ</span></div>
          <div className="profile-card-note"><LockKeyhole size={19} /><p>นี่คือโปรไฟล์ส่วนตัวบนเบราว์เซอร์นี้ ยังไม่ใช่บัญชี social และยังไม่ซิงค์ข้ามอุปกรณ์ ข้อมูลจะไม่ถูกเผยแพร่โดยอัตโนมัติ</p></div>
          <div className="profile-actions">
            <button type="button" className="profile-action-button" onClick={() => setEditing(true)}><Pencil size={15} /> แก้ไขโปรไฟล์</button>
            <button type="button" className="profile-action-button profile-action-button--quiet" onClick={onOpenUpload}>โพสต์สาธารณะ <ArrowUpRight size={15} /></button>
            <button type="button" className="profile-action-button profile-action-button--quiet" onClick={onOpenPrivate}><LockKeyhole size={15} /> คลังส่วนตัวเดิม</button>
          </div>
        </>
      )}
    </section>
  );
}
