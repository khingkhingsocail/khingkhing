import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import {
  ArrowUpRight,
  Globe2,
  ImagePlus,
  LockKeyhole,
  MapPin,
  Pencil,
  RefreshCw,
  Save,
  Trash2,
  Undo2,
} from "lucide-react";
import {
  PROFILE_IMAGE_MAX_BYTES,
  normalizeAccountProfileFields,
  normalizeAccountProfileWebsite,
  validateAccountProfileFields,
} from "@shared/profile";
import type { AccountProfile, AccountProfileFields } from "@shared/profile";
import {
  fetchAccountProfileImage,
  getAccountProfile,
  saveAccountProfile,
} from "@/lib/accountProfile";
import type { AccountProfileImageField } from "@/lib/accountProfile";
import { getLocalProfile, prepareLocalProfileImage } from "@/lib/localProfile";
import type { LocalProfileImageField } from "@/lib/localProfile";
import "./account-profile.css";

export const ACCOUNT_PROFILE_FORM_ID = "account-profile-editor-form";

interface AccountProfileEditorProps {
  userId: number;
  onOpenUpload: () => void;
  onOpenPrivate: () => void;
}

type ImageBlobs = Record<AccountProfileImageField, Blob | null>;
type SelectedFiles = Record<AccountProfileImageField, File | null>;
type RemovedImages = Record<AccountProfileImageField, boolean>;

const emptyFields = (): AccountProfileFields => ({
  displayName: "",
  handle: "",
  bio: "",
  location: "",
  website: "",
  category: "",
});
const noImages = (): ImageBlobs => ({ avatar: null, cover: null });
const noFiles = (): SelectedFiles => ({ avatar: null, cover: null });
const noRemovals = (): RemovedImages => ({ avatar: false, cover: false });
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function fieldsFromProfile(
  profile: AccountProfile | null
): AccountProfileFields {
  if (!profile) return emptyFields();
  return {
    displayName: profile.displayName,
    handle: profile.handle,
    bio: profile.bio,
    location: profile.location,
    website: profile.website,
    category: profile.category,
  };
}

function useObjectUrl(blob: Blob | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);
  return url;
}

function fileFromBlob(blob: Blob, field: AccountProfileImageField): File {
  const fallbackType = "image/webp";
  const type = IMAGE_TYPES.has(blob.type) ? blob.type : fallbackType;
  const extension =
    type === "image/jpeg" ? "jpg" : type === "image/png" ? "png" : "webp";
  return new File([blob], `${field}.${extension}`, { type });
}

function imageLabel(field: AccountProfileImageField) {
  return field === "avatar" ? "รูปโปรไฟล์" : "รูปปก";
}

function SaveButton({
  saving,
  disabled,
}: {
  saving: boolean;
  disabled: boolean;
}) {
  return (
    <button
      type="submit"
      form={ACCOUNT_PROFILE_FORM_ID}
      className="profile-action-button account-profile-save"
      disabled={disabled || saving}
      aria-busy={saving}
    >
      {saving ? (
        <RefreshCw
          size={15}
          className="account-profile-spin"
          aria-hidden="true"
        />
      ) : (
        <Save size={15} aria-hidden="true" />
      )}
      {saving ? "กำลังบันทึก…" : "บันทึกโปรไฟล์"}
    </button>
  );
}

export default function AccountProfileEditor({
  userId,
  onOpenUpload,
  onOpenPrivate,
}: AccountProfileEditorProps) {
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [draft, setDraft] = useState<AccountProfileFields>(emptyFields);
  const [savedFields, setSavedFields] =
    useState<AccountProfileFields>(emptyFields);
  const [images, setImages] = useState<ImageBlobs>(noImages);
  const [savedImages, setSavedImages] = useState<ImageBlobs>(noImages);
  const [files, setFiles] = useState<SelectedFiles>(noFiles);
  const [removed, setRemoved] = useState<RemovedImages>(noRemovals);
  const [loadedUserId, setLoadedUserId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [processingImage, setProcessingImage] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [conflict, setConflict] = useState(false);
  const [imageWarning, setImageWarning] = useState("");

  const epochRef = useRef(0);
  const userIdRef = useRef(userId);
  const requestRef = useRef<AbortController | null>(null);
  const saveLock = useRef(false);
  userIdRef.current = userId;

  const avatarUrl = useObjectUrl(images.avatar);
  const coverUrl = useObjectUrl(images.cover);
  const websiteHref = draft.website
    ? normalizeAccountProfileWebsite(draft.website)
    : "";
  const initial = Array.from(draft.displayName.trim())[0] ?? "ข";
  const busy = loading || saving || processingImage || importing;
  const active = useCallback(
    (epoch: number, ownerId: number) =>
      epochRef.current === epoch && userIdRef.current === ownerId,
    []
  );

  const loadProfile = useCallback(
    async (ownerId: number) => {
      requestRef.current?.abort();
      const controller = new AbortController();
      requestRef.current = controller;
      const epoch = ++epochRef.current;
      saveLock.current = false;
      setLoading(true);
      setSaving(false);
      setProcessingImage(false);
      setImporting(false);
      setLoadedUserId(null);
      setProfile(null);
      setDraft(emptyFields());
      setSavedFields(emptyFields());
      setImages(noImages());
      setSavedImages(noImages());
      setFiles(noFiles());
      setRemoved(noRemovals());
      setEditing(false);
      setError("");
      setNotice("");
      setConflict(false);
      setImageWarning("");
      try {
        const current = await getAccountProfile(controller.signal);
        if (!active(epoch, ownerId)) return;
        const warnings: string[] = [];
        const loadedImages = noImages();
        await Promise.all(
          (["avatar", "cover"] as const).map(async field => {
            if (!current?.[field]) return;
            try {
              loadedImages[field] = await fetchAccountProfileImage(
                field,
                controller.signal
              );
            } catch {
              if (!controller.signal.aborted) warnings.push(imageLabel(field));
            }
          })
        );
        if (!active(epoch, ownerId)) return;
        const currentFields = fieldsFromProfile(current);
        setProfile(current);
        setDraft(currentFields);
        setSavedFields(currentFields);
        setImages(loadedImages);
        setSavedImages(loadedImages);
        setLoadedUserId(ownerId);
        if (warnings.length)
          setImageWarning(
            `รูปที่บันทึกไว้บางส่วนโหลดไม่ได้ (${warnings.join(", ")}); การบันทึกข้อความจะคงรูปเดิมไว้`
          );
      } catch (cause) {
        if (!active(epoch, ownerId) || controller.signal.aborted) return;
        setError(
          cause instanceof Error
            ? cause.message
            : "อ่านโปรไฟล์บัญชีไม่สำเร็จ กรุณาลองอีกครั้ง"
        );
      } finally {
        if (active(epoch, ownerId)) setLoading(false);
      }
    },
    [active]
  );

  useEffect(() => {
    void loadProfile(userId);
    return () => {
      requestRef.current?.abort();
      epochRef.current += 1;
    };
  }, [loadProfile, userId]);

  function updateField(field: keyof AccountProfileFields, value: string) {
    setDraft(current => ({ ...current, [field]: value }));
    setError("");
    setNotice("");
  }

  function chooseImage(field: LocalProfileImageField) {
    return (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.currentTarget.files?.[0];
      event.currentTarget.value = "";
      if (!file) return;
      const ownerId = userId;
      const epoch = epochRef.current;
      setError("");
      setNotice("");
      setProcessingImage(true);
      void prepareLocalProfileImage(file, field)
        .then(blob => {
          if (!active(epoch, ownerId)) return;
          if (
            blob.size > PROFILE_IMAGE_MAX_BYTES ||
            !IMAGE_TYPES.has(blob.type)
          )
            throw new Error("รองรับเฉพาะ JPG, PNG หรือ WebP ขนาดไม่เกิน 5 MB");
          setImages(current => ({ ...current, [field]: blob }));
          setFiles(current => ({
            ...current,
            [field]: fileFromBlob(blob, field),
          }));
          setRemoved(current => ({ ...current, [field]: false }));
        })
        .catch((cause: unknown) => {
          if (active(epoch, ownerId))
            setError(
              cause instanceof Error ? cause.message : "เตรียมรูปภาพไม่สำเร็จ"
            );
        })
        .finally(() => {
          if (active(epoch, ownerId)) setProcessingImage(false);
        });
    };
  }

  function removeImage(field: AccountProfileImageField) {
    setImages(current => ({ ...current, [field]: null }));
    setFiles(current => ({ ...current, [field]: null }));
    setRemoved(current => ({ ...current, [field]: true }));
    setError("");
    setNotice("");
  }

  async function importLocalProfile() {
    const ownerId = userId;
    const epoch = epochRef.current;
    setImporting(true);
    setError("");
    setNotice("");
    try {
      const local = await getLocalProfile();
      if (!active(epoch, ownerId)) return;
      const imported = normalizeAccountProfileFields({
        displayName: local.displayName,
        handle: local.handle,
        bio: local.bio,
        location: local.location,
        website: local.website,
        category: local.category,
      });
      const nextImages: ImageBlobs = {
        avatar: local.avatar,
        cover: local.cover,
      };
      const nextFiles = noFiles();
      for (const field of ["avatar", "cover"] as const) {
        const blob = local[field];
        if (!blob) continue;
        if (
          blob.size > PROFILE_IMAGE_MAX_BYTES ||
          !IMAGE_TYPES.has(blob.type)
        ) {
          nextImages[field] = null;
          setImageWarning(
            `${imageLabel(field)}ในเบราว์เซอร์นี้มีชนิดหรือขนาดที่ไม่รองรับ กรุณาเลือกรูปใหม่`
          );
          continue;
        }
        nextFiles[field] = fileFromBlob(blob, field);
      }
      setDraft(imported);
      setImages(nextImages);
      setFiles(nextFiles);
      setRemoved(noRemovals());
      setNotice(
        "นำข้อมูลมาไว้ในแบบร่างแล้ว ยังไม่ได้บันทึกหรืออัปโหลด กดบันทึกโปรไฟล์เพื่อยืนยัน"
      );
    } catch (cause) {
      if (active(epoch, ownerId))
        setError(
          cause instanceof Error
            ? cause.message
            : "อ่านโปรไฟล์ในเบราว์เซอร์นี้ไม่สำเร็จ"
        );
    } finally {
      if (active(epoch, ownerId)) setImporting(false);
    }
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saveLock.current || busy || loadedUserId !== userId) return;
    const normalized = normalizeAccountProfileFields(draft);
    const validationError = validateAccountProfileFields(normalized);
    if (validationError) {
      setError(validationError);
      return;
    }

    const ownerId = userId;
    const epoch = epochRef.current;
    const controller = new AbortController();
    requestRef.current?.abort();
    requestRef.current = controller;
    saveLock.current = true;
    setSaving(true);
    setError("");
    setNotice("");
    setConflict(false);
    try {
      const current = await saveAccountProfile(
        {
          ...normalized,
          expectedRevision: profile?.revision ?? null,
          removeAvatar: removed.avatar,
          removeCover: removed.cover,
        },
        files,
        controller.signal
      );
      if (!active(epoch, ownerId)) return;
      const nextFields = fieldsFromProfile(current);
      setProfile(current);
      setDraft(nextFields);
      setSavedFields(nextFields);
      // Keep the chosen/previous client blobs as the previews. A successful text
      // save must not depend on another image download.
      setImages(currentImages => ({
        avatar: current.avatar ? currentImages.avatar : null,
        cover: current.cover ? currentImages.cover : null,
      }));
      setSavedImages(currentImages => ({
        avatar: current.avatar ? currentImages.avatar : null,
        cover: current.cover ? currentImages.cover : null,
      }));
      setFiles(noFiles());
      setRemoved(noRemovals());
      setEditing(false);
      setNotice(
        "บันทึกโปรไฟล์บัญชีแล้ว เฉพาะการเข้าสู่ระบบบัญชีเดิมเท่านั้นที่ซิงค์ข้อมูลชุดนี้"
      );
      setConflict(false);
    } catch (cause) {
      if (!active(epoch, ownerId) || controller.signal.aborted) return;
      const status =
        typeof cause === "object" && cause !== null && "status" in cause
          ? Number((cause as { status?: unknown }).status)
          : 0;
      if (status === 409) setConflict(true);
      setError(
        cause instanceof Error
          ? cause.message
          : "บันทึกโปรไฟล์ไม่สำเร็จ กรุณาลองอีกครั้ง"
      );
    } finally {
      saveLock.current = false;
      if (active(epoch, ownerId)) setSaving(false);
    }
  }

  function cancelEditing() {
    setDraft(savedFields);
    setImages(savedImages);
    setFiles(noFiles());
    setRemoved(noRemovals());
    setEditing(false);
    setError("");
    setNotice("");
    setConflict(false);
  }

  const actionsDisabled = busy || loadedUserId !== userId;
  const coverStyle = useMemo(
    () =>
      coverUrl
        ? {
            backgroundImage: `linear-gradient(180deg,rgba(4,8,11,.1),rgba(4,8,11,.64)),url("${coverUrl}")`,
          }
        : undefined,
    [coverUrl]
  );

  return (
    <section
      className="tool-view profile-view account-profile-view manus-no-record"
      aria-labelledby="account-profile-title"
      aria-busy={busy}
    >
      <header className="tool-view__header profile-view__header account-profile-header">
        <div>
          <p className="tool-view__eyebrow">YOUR ACCOUNT · PRIVATE</p>
          <h1 id="account-profile-title">โปรไฟล์บัญชีของคุณ</h1>
          <p>
            ข้อมูลซิงค์ในบัญชีเดิม เมื่อโพสต์สาธารณะชื่อ
            ชื่อผู้ใช้และรูปโปรไฟล์จะปรากฏให้ทุกคนเห็น
          </p>
        </div>
        {editing ? (
          <div className="profile-header-actions">
            <SaveButton
              saving={saving}
              disabled={actionsDisabled || processingImage}
            />
            <button
              type="button"
              className="profile-action-button profile-action-button--quiet"
              onClick={cancelEditing}
              disabled={actionsDisabled}
            >
              <Undo2 size={15} /> ยกเลิก
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="profile-action-button"
            onClick={() => {
              setEditing(true);
              setError("");
              setNotice("");
            }}
            disabled={actionsDisabled}
          >
            <Pencil size={15} /> {profile ? "แก้ไขโปรไฟล์" : "ตั้งค่าโปรไฟล์"}
          </button>
        )}
      </header>

      <div
        className={`profile-cover ${coverUrl ? "profile-cover--photo" : ""}`}
        style={coverStyle}
        aria-label={coverUrl ? "รูปปกโปรไฟล์ส่วนตัว" : undefined}
      >
        <span>{draft.category || "CREATIVE SPACE"}</span>
        <span className="profile-cover__spark" aria-hidden="true">
          ✳
        </span>
      </div>

      <div className="profile-identity">
        <div
          className={`profile-avatar ${avatarUrl ? "profile-avatar--photo" : ""}`}
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={`รูปโปรไฟล์ ${draft.displayName || "บัญชีนี้"}`}
            />
          ) : (
            <span>{initial}</span>
          )}
        </div>
        <div className="profile-identity__text">
          <p className="tool-view__eyebrow">ACCOUNT PROFILE · PRIVATE</p>
          <h2>{draft.displayName || "ยังไม่ได้ตั้งชื่อโปรไฟล์"}</h2>
          <p>{draft.handle ? `@${draft.handle}` : "ยังไม่ได้ตั้งชื่อผู้ใช้"}</p>
        </div>
      </div>

      {loading ? (
        <p className="profile-status" role="status">
          กำลังโหลดโปรไฟล์บัญชี…
        </p>
      ) : null}
      {error ? (
        <p className="profile-status profile-status--error" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="profile-status profile-status--success" role="status">
          {notice}
        </p>
      ) : null}
      {imageWarning ? (
        <p className="profile-status account-profile-warning" role="status">
          {imageWarning}
        </p>
      ) : null}
      {!loading && error && loadedUserId !== userId ? (
        <button
          type="button"
          className="profile-action-button profile-action-button--quiet"
          onClick={() => void loadProfile(userId)}
          disabled={busy}
        >
          <RefreshCw size={15} /> ลองโหลดอีกครั้ง
        </button>
      ) : null}
      {conflict ? (
        <div
          className="account-profile-conflict"
          role="group"
          aria-label="การแก้ไขชนกับข้อมูลปัจจุบัน"
        >
          <p>ร่างที่แก้ไขยังคงอยู่ การโหลดข้อมูลใหม่จะแทนที่ร่างนี้</p>
          <button
            type="button"
            className="profile-action-button profile-action-button--quiet"
            onClick={() => void loadProfile(userId)}
            disabled={busy}
          >
            <RefreshCw size={15} /> โหลดข้อมูลปัจจุบันใหม่
          </button>
        </div>
      ) : null}

      {editing ? (
        <form
          id={ACCOUNT_PROFILE_FORM_ID}
          className="profile-editor account-profile-editor manus-no-record"
          onSubmit={handleSave}
        >
          <fieldset
            className="profile-editor__fieldset"
            disabled={busy || loadedUserId !== userId}
          >
            <div className="profile-editor__images">
              {(["avatar", "cover"] as const).map(field => (
                <div className="profile-editor__image-field" key={field}>
                  <span className="profile-editor__label">
                    {imageLabel(field)}
                  </span>
                  {field === "avatar" ? (
                    <div className="profile-editor__image-row">
                      <div
                        className={`profile-avatar profile-editor__avatar ${avatarUrl ? "profile-avatar--photo" : ""}`}
                      >
                        {avatarUrl ? (
                          <img src={avatarUrl} alt="ตัวอย่างรูปโปรไฟล์บัญชี" />
                        ) : (
                          <span>{initial}</span>
                        )}
                      </div>
                      <div className="profile-editor__image-actions">
                        <label className="profile-action-button profile-action-button--quiet profile-file-label">
                          <ImagePlus size={15} /> เลือกรูป
                          <input
                            className="profile-file-input"
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            onChange={chooseImage("avatar")}
                          />
                        </label>
                        {images.avatar || profile?.avatar ? (
                          <button
                            className="profile-action-button profile-action-button--quiet"
                            type="button"
                            onClick={() => removeImage("avatar")}
                          >
                            <Trash2 size={14} /> เอาออก
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <>
                      <div
                        className={`profile-cover profile-editor__cover ${coverUrl ? "profile-cover--photo" : ""}`}
                        style={coverStyle}
                      >
                        <span>ตัวอย่างรูปปก</span>
                      </div>
                      <div className="profile-editor__image-actions">
                        <label className="profile-action-button profile-action-button--quiet profile-file-label">
                          <ImagePlus size={15} /> เลือกรูปปก
                          <input
                            className="profile-file-input"
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            onChange={chooseImage("cover")}
                          />
                        </label>
                        {images.cover || profile?.cover ? (
                          <button
                            className="profile-action-button profile-action-button--quiet"
                            type="button"
                            onClick={() => removeImage("cover")}
                          >
                            <Trash2 size={14} /> เอาออก
                          </button>
                        ) : null}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
            <p className="profile-editor__hint">
              เลือกรูป JPG, PNG หรือ WebP ขนาดไม่เกิน 5 MB ต่อไฟล์;
              เลือกภาพใหม่หรือกดเอาออกจึงจะเปลี่ยนรูปที่บันทึกไว้
            </p>

            <div className="profile-editor__fields">
              <label className="profile-editor__field">
                <span>
                  ชื่อที่แสดง <b>*</b>
                </span>
                <input
                  value={draft.displayName}
                  maxLength={60}
                  onChange={event =>
                    updateField("displayName", event.target.value)
                  }
                  autoComplete="name"
                  required
                />
              </label>
              <label className="profile-editor__field">
                <span>ชื่อผู้ใช้</span>
                <div className="profile-editor__handle">
                  <span>@</span>
                  <input
                    value={draft.handle}
                    maxLength={24}
                    onChange={event =>
                      updateField(
                        "handle",
                        event.target.value.replace(/^@/, "")
                      )
                    }
                    autoComplete="username"
                  />
                </div>
                <small>
                  เป็นชื่อแสดงในโปรไฟล์นี้เท่านั้น ไม่ได้จองชื่อผู้ใช้แบบสาธารณะ
                </small>
              </label>
              <label className="profile-editor__field profile-editor__field--wide">
                <span>
                  แนะนำตัว <small>{draft.bio.length}/160</small>
                </span>
                <textarea
                  value={draft.bio}
                  maxLength={160}
                  rows={3}
                  onChange={event => updateField("bio", event.target.value)}
                />
              </label>
              <label className="profile-editor__field">
                <span>หมวดหมู่</span>
                <input
                  value={draft.category}
                  maxLength={40}
                  placeholder="เช่น ครีเอเตอร์, นักเล่นเกม"
                  onChange={event =>
                    updateField("category", event.target.value)
                  }
                />
              </label>
              <label className="profile-editor__field">
                <span>สถานที่ (ไม่บังคับ)</span>
                <input
                  value={draft.location}
                  maxLength={80}
                  placeholder="เช่น กรุงเทพฯ"
                  onChange={event =>
                    updateField("location", event.target.value)
                  }
                  autoComplete="address-level2"
                />
              </label>
              <label className="profile-editor__field profile-editor__field--wide">
                <span>เว็บไซต์หรือพอร์ตโฟลิโอ</span>
                <input
                  type="text"
                  inputMode="url"
                  value={draft.website}
                  maxLength={200}
                  placeholder="https://example.com"
                  onChange={event => updateField("website", event.target.value)}
                  autoComplete="url"
                />
              </label>
            </div>

            <div className="profile-card-note profile-editor__privacy account-profile-privacy">
              <LockKeyhole size={18} />
              <p>
                <strong>เปิดเผยเฉพาะตัวตนเมื่อโพสต์สาธารณะ</strong>
                <br />
                ชื่อ ชื่อผู้ใช้และรูปโปรไฟล์ใช้แสดงเจ้าของโพสต์สาธารณะ
                และจะอัปเดตบนโพสต์ที่ผูกไว้เมื่อบันทึกโปรไฟล์ รูปปก สถานที่
                เว็บไซต์และไบโอยังคงส่วนตัว
                ไฟล์กับโปรไฟล์เดิมในเบราว์เซอร์ยังคงอยู่แยกจากชุดนี้
              </p>
            </div>
            {processingImage ? (
              <p className="profile-status" role="status">
                กำลังเตรียมรูปภาพ…
              </p>
            ) : null}
            {importing ? (
              <p className="profile-status" role="status">
                กำลังอ่านแบบร่างจากเบราว์เซอร์นี้…
              </p>
            ) : null}
            <div className="profile-actions profile-editor__actions account-profile-actions">
              <SaveButton
                saving={saving}
                disabled={actionsDisabled || processingImage}
              />
              <button
                type="button"
                className="profile-action-button profile-action-button--quiet"
                onClick={() => void importLocalProfile()}
                disabled={actionsDisabled}
              >
                <ArrowUpRight size={15} /> นำเข้าจากเบราว์เซอร์นี้
              </button>
              <button
                type="button"
                className="profile-action-button profile-action-button--quiet"
                onClick={cancelEditing}
                disabled={actionsDisabled}
              >
                <Undo2 size={15} /> ยกเลิก
              </button>
            </div>
          </fieldset>
        </form>
      ) : (
        <>
          <div className="profile-bio">
            <p>{draft.bio || "ยังไม่มีข้อความแนะนำตัว"}</p>
          </div>
          <div className="profile-details">
            {draft.category ? (
              <span>
                <ImagePlus size={15} /> {draft.category}
              </span>
            ) : null}
            {draft.location ? (
              <span>
                <MapPin size={15} /> {draft.location}
              </span>
            ) : null}
            {websiteHref ? (
              <a href={websiteHref} target="_blank" rel="noreferrer">
                <Globe2 size={15} /> {draft.website}
              </a>
            ) : null}
          </div>
          <div className="profile-stats account-profile-stats">
            <span>
              <strong>PRIVATE</strong> ข้อมูลบัญชี
            </span>
            <span>
              <strong>SYNC</strong> บัญชีเดิม
            </span>
            <span>
              <strong>5 MB</strong> ต่อรูป
            </span>
          </div>
          <div className="profile-card-note account-profile-note">
            <LockKeyhole size={19} />
            <p>
              เมื่อโพสต์สาธารณะจะเปิดเผยชื่อ
              ชื่อผู้ใช้และรูปโปรไฟล์เพื่อระบุเจ้าของโพสต์
              ส่วนรูปปกและข้อมูลอื่นยังคงส่วนตัว
              ไฟล์เดิมและข้อมูลโปรไฟล์ในเครื่องยังคงอยู่แยกกัน
            </p>
          </div>
          <div className="profile-actions">
            <button
              type="button"
              className="profile-action-button"
              onClick={() => {
                setEditing(true);
                setError("");
                setNotice("");
              }}
              disabled={actionsDisabled}
            >
              <Pencil size={15} /> แก้ไขโปรไฟล์
            </button>
            <button
              type="button"
              className="profile-action-button profile-action-button--quiet"
              onClick={onOpenUpload}
              disabled={actionsDisabled}
            >
              โพสต์สาธารณะ <ArrowUpRight size={15} />
            </button>
            <button
              type="button"
              className="profile-action-button profile-action-button--quiet"
              onClick={onOpenPrivate}
              disabled={actionsDisabled}
            >
              <LockKeyhole size={15} /> คลังส่วนตัวเดิม
            </button>
          </div>
        </>
      )}
    </section>
  );
}
