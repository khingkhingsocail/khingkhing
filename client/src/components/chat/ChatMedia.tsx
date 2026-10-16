import { useEffect, useState } from "react";
import { Image, Film, X } from "lucide-react";
import type { ChatFile } from "../../../../shared/chat";
import { fetchChatFile } from "@/lib/chat";
export default function ChatMedia({ file }: { file: ChatFile }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    let objectUrl = "";
    setUrl("");
    setError("");
    void fetchChatFile(file.id, controller.signal)
      .then(value => {
        objectUrl = value;
        if (controller.signal.aborted) URL.revokeObjectURL(value);
        else setUrl(value);
      })
      .catch(cause => {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : "เปิดไฟล์ไม่ได้");
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file.id, open]);
  return (
    <div className="chat-media">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-expanded={open}
      >
        {open ? (
          <X size={15} />
        ) : file.kind === "image" ? (
          <Image size={16} />
        ) : (
          <Film size={16} />
        )}
        <span>
          {file.filename}
          <small>
            {(file.size / 1024 / 1024).toFixed(2)} MiB ·{" "}
            {open ? "ปิด" : "เปิดดู"}
          </small>
        </span>
      </button>
      {open ? (
        error ? (
          <p role="alert">{error}</p>
        ) : url ? (
          file.kind === "image" ? (
            <img src={url} alt={file.filename} />
          ) : (
            <video src={url} controls playsInline preload="metadata" />
          )
        ) : (
          <p role="status">กำลังโหลดไฟล์ส่วนตัว…</p>
        )
      ) : null}
    </div>
  );
}
