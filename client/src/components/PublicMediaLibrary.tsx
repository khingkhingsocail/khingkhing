import { useEffect, useId, useState } from "react";
import {
  ArrowUpRight,
  Check,
  Eye,
  FileVideo2,
  Globe2,
  ImagePlus,
  LoaderCircle,
  RefreshCw,
  Trash2,
  Upload,
  Sparkles,
} from "lucide-react";
import type { PublicMediaSummary } from "@shared/publicMedia";
import {
  deletePublicMedia,
  claimPublicMedia,
  fetchPublicMediaPage,
  forgetOwnedPublicToken,
  getOwnedPublicTokens,
  getPublicMediaAssetUrl,
  PUBLIC_MEDIA_ACCEPT,
  PUBLIC_UPLOAD_SIZE_LABEL,
  PublicUploadSessionExpiredError,
  publicUploadFileError,
  uploadPublicMedia,
} from "@/lib/publicMedia";
import type { PublicUploadProgress } from "@shared/publicUpload";

import PostingIdentity from "./PostingIdentity";
import MediaLightbox, { FullscreenMediaButton } from "./MediaLightbox";
import { useAuth } from "@/_core/hooks/useAuth";
const PAGE_SIZE = 24;
const viewCountFormatter = new Intl.NumberFormat("th-TH");

function formatViewCount(value?: number) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? viewCountFormatter.format(value)
    : "—";
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileBaseName(name: string) {
  return name.replace(/\.[^/.]+$/, "") || name;
}

function isImageFile(file: File) {
  return (
    file.type.startsWith("image/") ||
    /\.(jpe?g|png|webp|gif|bmp|tiff?|avif|hei[cf])$/i.test(file.name)
  );
}

function needsPreviewConversionNote(file: File) {
  return (
    /\.(mov|heic|heif)$/i.test(file.name) ||
    file.type === "video/quicktime" ||
    file.type === "image/heic" ||
    file.type === "image/heif"
  );
}

function useFilePreview(file: File | null) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!file) {
      setUrl("");
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  return url;
}

async function makeAIFrame(file: File): Promise<string | undefined> {
  const source = URL.createObjectURL(file);
  try {
    if (isImageFile(file)) {
      const image = new Image();
      image.src = source;
      await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("image")); });
      const scale = Math.min(1, 768 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/jpeg", 0.78);
    }
    const video = document.createElement("video");
    video.src = source;
    video.muted = true;
    await new Promise<void>((resolve, reject) => { video.onloadeddata = () => resolve(); video.onerror = () => reject(new Error("video")); });
    video.currentTime = Math.min(1, Number.isFinite(video.duration) ? video.duration / 2 : 1);
    await new Promise<void>(resolve => { video.onseeked = () => resolve(); setTimeout(resolve, 1500); });
    const scale = Math.min(1, 768 / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.78);
  } catch { return undefined; }
  finally { URL.revokeObjectURL(source); }
}

function PublicMediaCard({
  item,
  canDelete,
  deleting,
  onDelete,
  onViewFeed,
  canClaim,
  claiming,
  onClaim,
}: {
  item: PublicMediaSummary;
  canDelete: boolean;
  deleting: boolean;
  onDelete: () => void;
  onViewFeed: () => void;
  canClaim: boolean;
  claiming: boolean;
  onClaim: () => void;
}) {
  const assetUrl = getPublicMediaAssetUrl(item.id);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const createdAt = new Date(item.createdAt);
  const dateLabel = Number.isNaN(createdAt.getTime())
    ? ""
    : new Intl.DateTimeFormat("th-TH", { dateStyle: "medium" }).format(
        createdAt
      );
  return (
    <article className="public-media-card">
      <div className="public-media-card__preview">
        {item.kind === "image" ? (
          <img src={assetUrl} alt={item.title} loading="lazy" />
        ) : (
          <video
            src={assetUrl}
            controls
            preload="metadata"
            aria-label={item.title}
          />
        )}
        <FullscreenMediaButton
          label={item.kind === "video" ? "วิดีโอ" : "รูปภาพ"}
          onClick={() => setLightboxOpen(true)}
        />
        <span className="public-media-card__badge">
          <Globe2 size={12} /> สาธารณะ
        </span>
      </div>
      <MediaLightbox
        open={lightboxOpen}
        src={assetUrl}
        kind={item.kind}
        title={item.title}
        onClose={() => setLightboxOpen(false)}
      />
      <div className="public-media-card__body">
        {item.creator ? (
          <p className="public-media-card__meta">
            {item.creator.displayName}
            {item.creator.handle ? ` · @${item.creator.handle}` : ""}
          </p>
        ) : null}
        <h3>{item.title}</h3>
        {item.description ? (
          <p>{item.description}</p>
        ) : (
          <p className="muted-copy">ยังไม่มีคำอธิบาย</p>
        )}
        <span className="public-media-card__meta">
          {item.kind === "video" ? "วิดีโอ" : "รูปภาพ"} ·{" "}
          {formatBytes(item.size)}
          {dateLabel ? ` · ${dateLabel}` : ""}
        </span>
        <span
          className="public-media-card__meta"
          style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
        >
          <Eye size={13} aria-hidden="true" /> {formatViewCount(item.viewCount)}{" "}
          วิว
        </span>
        <div className="public-media-card__actions">
          <button type="button" className="text-button" onClick={onViewFeed}>
            ดูในฟีด <ArrowUpRight size={14} />
          </button>
          {item.accountLinked ? (
            <span className="public-media-card__meta">
              {item.isMine ? "โพสต์ของบัญชีคุณ" : "ผูกบัญชีแล้ว"}
            </span>
          ) : null}
          {canClaim ? (
            <button
              type="button"
              className="text-button"
              disabled={claiming}
              onClick={onClaim}
            >
              {claiming ? "กำลังผูก…" : "ผูกโพสต์กับโปรไฟล์บัญชี"}
            </button>
          ) : null}
          {canDelete ? (
            <button
              type="button"
              className="text-button text-button--danger"
              disabled={deleting}
              onClick={onDelete}
            >
              {deleting ? (
                <LoaderCircle size={14} className="spin" />
              ) : (
                <Trash2 size={14} />
              )}
              {deleting ? "กำลังลบ" : "ลบโพสต์"}
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export default function PublicMediaLibrary({
  onViewFeed,
}: {
  onViewFeed: () => void;
}) {
  const auth = useAuth();
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const fileInputId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [items, setItems] = useState<PublicMediaSummary[]>([]);
  const [ownedTokens, setOwnedTokens] = useState<Record<string, string>>({});
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [validationError, setValidationError] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [uploadWarning, setUploadWarning] = useState("");
  const [uploadProgress, setUploadProgress] =
    useState<PublicUploadProgress | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [showFeedLink, setShowFeedLink] = useState(false);
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [taggedFriends, setTaggedFriends] = useState("");
  const [suggestionLoading, setSuggestionLoading] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<{ mediaType: string; detectedObjects: string[]; animals: string[]; actions: string[]; scene: string; colors: string[] } | null>(null);
  const previewUrl = useFilePreview(file);

  useEffect(() => {
    let active = true;
    setOwnedTokens(getOwnedPublicTokens());
    fetchPublicMediaPage(null, PAGE_SIZE)
      .then(page => {
        if (!active) return;
        setItems(page.items);
        setNextCursor(page.nextCursor);
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error ? cause.message : "เปิดฟีดสาธารณะไม่สำเร็จ"
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [auth.user?.id]);

  function selectFile(selected: File | null) {
    if (uploading) return;
    setFile(selected);
    setMessage("");
    setError("");
    setValidationError(selected ? publicUploadFileError(selected) : "");
    setUploadWarning("");
    setUploadProgress(null);
    setPreviewFailed(false);
    setShowFeedLink(false);
    setHashtags([]);
    setAiAnalysis(null);
    if (!selected) return;
    setTitle(fileBaseName(selected.name).slice(0, 100));
    setDescription("");
    void suggestPostCopy(selected);
  }

  async function suggestPostCopy(selected: File) {
    setSuggestionLoading(true);
    setError("");
    try {
      const mediaDataUrl = await makeAIFrame(selected);
      const response = await fetch("/api/post-ai/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: selected.name, mimeType: selected.type, kind: isImageFile(selected) ? "image" : "video", mediaDataUrl }),
      });
      const payload = (await response.json()) as { title?: string; description?: string; hashtags?: string[]; mediaType?: string; detectedObjects?: string[]; animals?: string[]; actions?: string[]; scene?: string; colors?: string[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "AI แนะนำโพสต์ไม่สำเร็จ");
      if (payload.title) setTitle(payload.title);
      if (payload.description) setDescription(payload.description);
      setHashtags(Array.isArray(payload.hashtags) ? payload.hashtags.slice(0, 5) : []);
      setAiAnalysis({ mediaType: payload.mediaType || "", detectedObjects: payload.detectedObjects || [], animals: payload.animals || [], actions: payload.actions || [], scene: payload.scene || "", colors: payload.colors || [] });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "AI แนะนำโพสต์ไม่สำเร็จ");
    } finally {
      setSuggestionLoading(false);
    }
  }

  function composedDescription() {
    const hashtagsText = hashtags.length ? `\n\n${hashtags.join(" ")}` : "";
    const friendsText = auth.isAuthenticated && taggedFriends.trim() ? `\n\nแท็กเพื่อน: ${taggedFriends.trim()}` : "";
    return `${description.trim()}${hashtagsText}${friendsText}`.trim().slice(0, 240);
  }

  async function handleUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (auth.loading || uploading) return;
    if (!file) {
      setValidationError("เลือกไฟล์ภาพหรือวิดีโอก่อนโพสต์");
      return;
    }
    const fileError = publicUploadFileError(file);
    if (fileError) {
      setValidationError(fileError);
      return;
    }
    setUploading(true);
    setValidationError("");
    setError("");
    setMessage("");
    setUploadWarning("");
    setShowFeedLink(false);
    try {
      const result = await uploadPublicMedia(
        file,
        title.trim() || fileBaseName(file.name),
        composedDescription(),
        auth.isAuthenticated,
        setUploadProgress
      );
      setOwnedTokens(getOwnedPublicTokens());
      setItems(current => [
        result.item,
        ...current.filter(item => item.id !== result.item.id),
      ]);
      setFile(null);
      setTitle("");
      setDescription("");
      setUploadProgress(null);
      setPreviewFailed(false);
      const input = document.getElementById(fileInputId);
      if (input instanceof HTMLInputElement) input.value = "";
      setMessage(
        result.item.isMine
          ? `เผยแพร่ในชื่อ ${result.item.creator?.displayName ?? "บัญชีของคุณ"} แล้ว · ผูกเจ้าของโพสต์และรับแจ้งเตือนได้ข้ามอุปกรณ์`
          : "เผยแพร่แล้ว ทุกคนเปิดดูได้ทันที · เข้าสู่ระบบและผูกโพสต์เพื่อรับแจ้งเตือน"
      );
      setUploadWarning(result.localCapabilityWarning ?? "");
      setShowFeedLink(true);
    } catch (cause) {
      if (cause instanceof PublicUploadSessionExpiredError) {
        setFile(null);
        setTitle("");
        setDescription("");
        setUploadProgress(null);
        setValidationError("");
        const input = document.getElementById(fileInputId);
        if (input instanceof HTMLInputElement) input.value = "";
      }
      setError(
        cause instanceof Error ? cause.message : "โพสต์ไม่สำเร็จ ลองอีกครั้ง"
      );
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(item: PublicMediaSummary) {
    const token = ownedTokens[item.id];
    if (
      (!token && !item.isMine) ||
      !window.confirm(
        `ลบ “${item.title}” จากฟีดสาธารณะหรือไม่? แถวและไฟล์ในฐานข้อมูลปัจจุบันจะถูกลบ; สำเนาใน backup/binlog อาจคงอยู่ตามนโยบายฐานข้อมูล`
      )
    )
      return;
    setDeletingId(item.id);
    setError("");
    setMessage("");
    try {
      await deletePublicMedia(item.id, token ?? "");
      forgetOwnedPublicToken(item.id);
      setOwnedTokens(getOwnedPublicTokens());
      setItems(current => current.filter(entry => entry.id !== item.id));
      setMessage(
        "ลบโพสต์และแถวไฟล์ออกจากฐานข้อมูลปัจจุบันแล้ว; สำเนาใน backup/binlog อาจคงอยู่ตามนโยบายผู้ให้บริการ"
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "ลบโพสต์ไม่สำเร็จ ลองอีกครั้ง"
      );
    } finally {
      setDeletingId(null);
    }
  }

  async function handleClaim(item: PublicMediaSummary) {
    const token = ownedTokens[item.id];
    if (!auth.isAuthenticated || !token || claimingId) return;
    setClaimingId(item.id);
    setError("");
    setMessage("");
    try {
      await claimPublicMedia(item.id, token);
      await handleRefresh();
      setMessage("ผูกโพสต์กับบัญชีแล้ว คุณจะได้รับแจ้งเตือนความคิดเห็นใหม่");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ผูกโพสต์ไม่สำเร็จ");
    } finally {
      setClaimingId(null);
    }
  }

  async function handleLoadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setError("");
    try {
      const page = await fetchPublicMediaPage(nextCursor, PAGE_SIZE);
      setItems(current => {
        const knownIds = new Set(current.map(item => item.id));
        return [
          ...current,
          ...page.items.filter(item => !knownIds.has(item.id)),
        ];
      });
      setNextCursor(page.nextCursor);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "โหลดรายการเพิ่มเติมไม่สำเร็จ"
      );
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleRefresh() {
    setLoading(true);
    setError("");
    try {
      const page = await fetchPublicMediaPage(null, PAGE_SIZE);
      setItems(page.items);
      setNextCursor(page.nextCursor);
      setOwnedTokens(getOwnedPublicTokens());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "รีเฟรชฟีดไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="public-library">
      <div className="public-warning" role="note">
        <div className="public-warning__icon">
          <Globe2 size={20} />
        </div>
        <div>
          <strong>โพสต์นี้จะเป็นสาธารณะทันที</strong>
          <p>
            ทุกคนเปิดดูหรือแชร์ได้ · จำกัด {PUBLIC_UPLOAD_SIZE_LABEL} ต่อไฟล์ ·
            ยังไม่มีระบบกลั่นกรองหรือโควตารวม
          </p>
          <p>
            โพสต์บัญชีลบได้เมื่อเข้าสู่ระบบบัญชีเดิมบนอุปกรณ์อื่น
            ส่วนโพสต์ผู้เยี่ยมชมใช้รหัสลบที่เก็บในเบราว์เซอร์นี้และเป็นกุญแจผู้ถือสิทธิ์:
            ใครมีรหัสก็ลบได้; หากล้างข้อมูลเว็บไซต์จะกู้คืนไม่ได้
            การลบออกจากฐานข้อมูลปัจจุบันไม่ได้ลบสำเนาสำรอง/binlog
          </p>
        </div>
      </div>

      <PostingIdentity key={auth.user?.id ?? "guest"} user={auth.user} />
      <div className="public-upload-panel">
        <div className="public-upload-panel__intro">
          <span className="upload-panel__icon">
            <ImagePlus size={21} />
          </span>
          <div>
            <p className="eyebrow">POST TO THE PUBLIC FEED</p>
            <h3>เผยแพร่ภาพหรือวิดีโอ</h3>
            <p>
              รูปภาพหรือวิดีโอที่รองรับ ขนาดไม่เกิน {PUBLIC_UPLOAD_SIZE_LABEL}
              ต่อไฟล์ · วิดีโอไม่เกิน 10 นาที
            </p>
            <p className="public-preview-note">
              รูป: JPEG, PNG, WebP, GIF, BMP, TIFF, AVIF, HEIC/HEIF · วิดีโอ:
              MP4, MOV, M4V, WebM, MKV, AVI
            </p>
            <p className="public-preview-note">
              ระบบแปลงวิดีโอเป็น MP4 สูงสุด 1080p
              และอาจลดคุณภาพเพื่อให้เปิดได้หลายอุปกรณ์; GIF/รูปหลายหน้าใช้ภาพแรก
              ไฟล์เสียหรือเข้ารหัสอาจแปลงไม่ได้
            </p>
          </div>
        </div>
        <form
          className="upload-form"
          onSubmit={event => void handleUpload(event)}
        >
          <input
            id={fileInputId}
            className="visually-hidden"
            type="file"
            accept={PUBLIC_MEDIA_ACCEPT}
            aria-label="เลือกไฟล์ภาพหรือวิดีโอเพื่อเผยแพร่สาธารณะ"
            disabled={uploading}
            onChange={event =>
              selectFile(event.currentTarget.files?.[0] ?? null)
            }
          />
          <button
            className="file-picker"
            type="button"
            onClick={() => document.getElementById(fileInputId)?.click()}
            disabled={uploading}
          >
            <Upload size={17} />
            <span>{file ? file.name : "เลือกไฟล์จากอุปกรณ์"}</span>
            <span className="file-picker__suffix">ภาพ · วิดีโอ</span>
          </button>
          {file ? (
            <div className="public-selected-file" aria-live="polite">
              <div className="public-selected-file__preview">
                {previewUrl && !previewFailed && isImageFile(file) ? (
                  <img
                    src={previewUrl}
                    alt="ตัวอย่างไฟล์ที่จะโพสต์"
                    onError={() => setPreviewFailed(true)}
                  />
                ) : previewUrl && !previewFailed ? (
                  <video
                    src={previewUrl}
                    muted
                    controls
                    aria-label="ตัวอย่างวิดีโอที่จะโพสต์"
                    onError={() => setPreviewFailed(true)}
                  />
                ) : (
                  <FileVideo2 size={22} />
                )}
              </div>
              <div>
                <span>
                  {file.name} · {formatBytes(file.size)}
                </span>
                {previewFailed || needsPreviewConversionNote(file) ? (
                  <p className="public-preview-note">
                    ตัวอย่าง MOV/HEIC อาจเปิดไม่ได้ในบางเบราว์เซอร์
                    แต่ยังอัปโหลดไฟล์ต้นฉบับได้ ไม่ต้องแปลงก่อนโพสต์
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
          {file ? (
            <div className="ai-post-tools">
              <button type="button" className="text-button" onClick={() => void suggestPostCopy(file)} disabled={uploading || suggestionLoading}>
                <Sparkles size={15} /> {suggestionLoading ? "AI กำลังคิด…" : "รีเฟรชชื่อ คำอธิบาย และ #"}
              </button>
              {hashtags.length ? <span className="public-media-card__meta">AI สร้างแฮชแท็กแล้ว 5 คำ: {hashtags.join(" ")}</span> : null}
            </div>
          ) : null}
          {aiAnalysis ? (
            <div className="ai-analysis" aria-live="polite">
              <strong>AI จำแนกสื่อให้แล้ว</strong>
              <span>ประเภท: {aiAnalysis.mediaType || "ไม่แน่ใจ"}</span>
              {aiAnalysis.detectedObjects.length ? <span>สิ่งของ/วัตถุ: {aiAnalysis.detectedObjects.join(", ")}</span> : null}
              {aiAnalysis.animals.length ? <span>สัตว์: {aiAnalysis.animals.join(", ")}</span> : null}
              {aiAnalysis.actions.length ? <span>การกระทำที่เห็น: {aiAnalysis.actions.join(", ")}</span> : null}
              {aiAnalysis.scene ? <span>สถานที่/ฉาก: {aiAnalysis.scene}</span> : null}
              {aiAnalysis.colors.length ? <span>สีเด่น: {aiAnalysis.colors.join(", ")}</span> : null}
            </div>
          ) : null}
          <div className="form-row">
            <label className="field-label">
              ชื่อผลงาน · AI คิดให้
              <input
                value={title}
                onChange={event => setTitle(event.target.value)}
                maxLength={100}
                placeholder="เช่น แสงยามเช้า"
                disabled={uploading}
              />
            </label>
            <label className="field-label">
              คำอธิบาย · AI คิดให้
              <input
                value={description}
                onChange={event => setDescription(event.target.value)}
                maxLength={240}
                placeholder="เพิ่มคำอธิบายสั้น ๆ (ไม่บังคับ)"
                disabled={uploading}
              />
              </label>
          </div>
          <label className="field-label">
            แท็กเพื่อน (ต้องล็อกอิน)
            <input
              value={taggedFriends}
              onChange={event => setTaggedFriends(event.target.value)}
              maxLength={160}
              placeholder={auth.isAuthenticated ? "เช่น @เพื่อน1 @เพื่อน2" : "เข้าสู่ระบบก่อนแท็กเพื่อน"}
              disabled={uploading || !auth.isAuthenticated}
            />
            <span className="field-help">ใช้ @handle คั่นด้วยช่องว่าง ระบบจะแนบแท็กไปกับโพสต์สาธารณะ</span>
          </label>
          {uploadProgress && (uploading || error) ? (
            <div
              className="public-upload-progress"
              role="status"
              aria-live="polite"
            >
              <div
                className="public-upload-progress__track"
                role="progressbar"
                aria-label="ความคืบหน้าการอัปโหลด"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={uploadProgress.percent}
              >
                <span style={{ width: `${uploadProgress.percent}%` }} />
              </div>
              <span>
                {uploadProgress.phase === "processing"
                  ? uploading
                    ? "อัปโหลดครบแล้ว · กำลังประมวลผลโพสต์…"
                    : "อัปโหลดครบแล้ว แต่การประมวลผลยังไม่ยืนยัน · กดโพสต์อีกครั้งเพื่อลองต่อ"
                  : uploading
                    ? `กำลังอัปโหลด ${uploadProgress.percent}%…`
                    : `หยุดชั่วคราวที่ ${uploadProgress.percent}% · กดโพสต์อีกครั้งเพื่ออัปโหลดต่อจากส่วนที่ค้าง`}
              </span>
            </div>
          ) : null}
          <button
            className="button button--lime upload-submit"
            type="submit"
            disabled={
              !file || uploading || auth.loading || Boolean(validationError)
            }
          >
            {uploading ? (
              <>
                <LoaderCircle size={16} className="spin" />
                {uploadProgress?.phase === "processing"
                  ? "กำลังประมวลผล…"
                  : "กำลังอัปโหลด…"}
              </>
            ) : (
              <>
                <Globe2 size={16} />
                โพสต์ให้ทุกคนเห็น
              </>
            )}
          </button>
        </form>
      </div>

      {validationError || error ? (
        <p className="feedback feedback--error" role="alert">
          {validationError || error}
        </p>
      ) : null}
      {uploadWarning ? (
        <p className="feedback feedback--warning" role="status">
          {uploadWarning}
        </p>
      ) : null}
      {message ? (
        <div
          className="feedback feedback--success public-feedback"
          role="status"
        >
          <span>
            <Check size={15} />
            {message}
          </span>
          {showFeedLink ? (
            <button
              type="button"
              className="feedback__action"
              onClick={onViewFeed}
            >
              ดูในฟีด <ArrowUpRight size={15} />
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="public-library-heading">
        <div>
          <p className="eyebrow">RECENT PUBLIC POSTS</p>
          <h3>โพสต์สาธารณะล่าสุด</h3>
        </div>
        <button
          type="button"
          className="public-refresh"
          onClick={() => void handleRefresh()}
          disabled={loading}
          aria-label="รีเฟรชโพสต์สาธารณะ"
        >
          <RefreshCw size={15} />
          รีเฟรช
        </button>
      </div>
      {loading ? <p className="empty-library">กำลังโหลดฟีดสาธารณะ…</p> : null}
      {!loading && items.length === 0 ? (
        <div className="empty-library">
          <span className="empty-library__mark">
            <ImagePlus size={21} />
          </span>
          <strong>ยังไม่มีโพสต์สาธารณะ</strong>
          <span>อัปโหลดผลงานแรกเพื่อเริ่มฟีดขิงขิง</span>
        </div>
      ) : null}
      {items.length ? (
        <div className="public-media-grid">
          {items.map(item => (
            <PublicMediaCard
              key={item.id}
              item={item}
              canDelete={Boolean(ownedTokens[item.id]) || Boolean(item.isMine)}
              canClaim={
                auth.isAuthenticated &&
                Boolean(ownedTokens[item.id]) &&
                !item.accountLinked
              }
              claiming={claimingId === item.id}
              onClaim={() => void handleClaim(item)}
              deleting={deletingId === item.id}
              onDelete={() => void handleDelete(item)}
              onViewFeed={onViewFeed}
            />
          ))}
        </div>
      ) : null}
      {nextCursor ? (
        <button
          type="button"
          className="public-load-more"
          disabled={loadingMore}
          onClick={() => void handleLoadMore()}
        >
          {loadingMore ? "กำลังโหลด…" : "โหลดโพสต์เพิ่มเติม"}
        </button>
      ) : null}
      <p className="storage-footnote">
        <Globe2 size={13} /> โพสต์ใหม่เก็บใน Managed Database; การลบเอาแถวและ
        bytes ออกจากฐานข้อมูลปัจจุบัน แต่สำเนาใน backup/binlog
        อาจคงอยู่ตามระยะเก็บสำรองของผู้ให้บริการ
      </p>
    </div>
  );
}
