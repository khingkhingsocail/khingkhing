import { useState } from "react";
import { FileVideo2, LoaderCircle, Sparkles, Upload } from "lucide-react";

function isImage(file: File) {
  return file.type.startsWith("image/") || /\.(jpe?g|png|webp|gif|bmp|avif)$/i.test(file.name);
}

async function frameData(file: File) {
  const url = URL.createObjectURL(file);
  try {
    if (isImage(file)) {
      const image = new Image(); image.src = url;
      await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("image")); });
      const scale = Math.min(1, 768 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas"); canvas.width = Math.round(image.naturalWidth * scale); canvas.height = Math.round(image.naturalHeight * scale);
      canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/jpeg", 0.78);
    }
    const video = document.createElement("video"); video.src = url; video.muted = true;
    await new Promise<void>((resolve, reject) => { video.onloadeddata = () => resolve(); video.onerror = () => reject(new Error("video")); });
    video.currentTime = Math.min(1, Number.isFinite(video.duration) ? video.duration / 2 : 1);
    await new Promise<void>(resolve => { video.onseeked = () => resolve(); setTimeout(resolve, 1200); });
    const scale = Math.min(1, 768 / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas"); canvas.width = Math.round(video.videoWidth * scale); canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.78);
  } finally { URL.revokeObjectURL(url); }
}

type Result = { mediaType: string; detectedObjects: string[]; animals: string[]; actions: string[]; scene: string; colors: string[]; title: string; description: string; hashtags: string[] };

export default function MediaClassifier() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  async function analyze(selected: File | null) {
    setFile(selected); setResult(null); setError(""); if (!selected) return;
    setBusy(true);
    try {
      const mediaDataUrl = await frameData(selected);
      const response = await fetch("/api/post-ai/suggest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filename: selected.name, mimeType: selected.type, kind: isImage(selected) ? "image" : "video", mediaDataUrl }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "วิเคราะห์ไม่สำเร็จ");
      setResult(payload);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "วิเคราะห์ไม่สำเร็จ"); }
    finally { setBusy(false); }
  }
  return <section className="classifier-panel" aria-labelledby="classifier-title">
    <div className="classifier-panel__intro"><span className="classifier-panel__icon"><Sparkles size={22} /></span><div><p className="tool-view__eyebrow">AI IMAGE / VIDEO CLASSIFICATION</p><h2 id="classifier-title">จำแนกรูปภาพและวิดีโอด้วย AI</h2><p>เลือกไฟล์เพื่อให้ AI วิเคราะห์วัตถุ สัตว์ ฉาก สี และการกระทำที่มองเห็นจากภาพหรือเฟรมวิดีโอ</p></div></div>
    <label className="classifier-picker"><Upload size={18} /><span>{file ? file.name : "เลือกภาพหรือวิดีโอเพื่อวิเคราะห์"}</span><input type="file" accept="image/*,video/*" onChange={e => void analyze(e.currentTarget.files?.[0] ?? null)} /></label>
    {busy ? <p className="feedback" role="status"><LoaderCircle size={16} className="spin" /> AI กำลังวิเคราะห์สื่อจริง…</p> : null}
    {error ? <p className="feedback feedback--error" role="alert">{error}</p> : null}
    {result ? <div className="classifier-result" aria-live="polite"><h3>ผลการจำแนก</h3><p><strong>ประเภท:</strong> {result.mediaType}</p>{result.detectedObjects.length ? <p><strong>วัตถุ:</strong> {result.detectedObjects.join(", ")}</p> : null}{result.animals.length ? <p><strong>สัตว์:</strong> {result.animals.join(", ")}</p> : null}{result.actions.length ? <p><strong>การกระทำ:</strong> {result.actions.join(", ")}</p> : null}{result.scene ? <p><strong>ฉาก/สถานที่:</strong> {result.scene}</p> : null}{result.colors.length ? <p><strong>สีเด่น:</strong> {result.colors.join(", ")}</p> : null}<div className="classifier-copy"><strong>ชื่อที่ AI แนะนำ:</strong> {result.title}<br /><strong>คำอธิบาย:</strong> {result.description}<br /><strong>แฮชแท็ก:</strong> {result.hashtags.join(" ")}</div></div> : null}
    <p className="classifier-note"><FileVideo2 size={14} /> วิดีโอจะวิเคราะห์จากเฟรมตัวอย่าง และ AI จะไม่ระบุตัวตนบุคคลจากใบหน้า</p>
  </section>;
}
