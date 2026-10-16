import { useEffect, useRef } from "react";
import { Maximize2, X } from "lucide-react";

export default function MediaLightbox({
  open,
  src,
  kind,
  title,
  onClose,
}: {
  open: boolean;
  src: string;
  kind: "image" | "video";
  title: string;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="media-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={`ดู${kind === "video" ? "วิดีโอ" : "รูปภาพ"} ${title} แบบเต็มจอ`}
      onClick={onClose}
    >
      <button
        ref={closeRef}
        type="button"
        className="media-lightbox__close"
        onClick={onClose}
        aria-label="ปิดการดูเต็มจอ"
      >
        <X size={24} />
      </button>
      <div className="media-lightbox__content" onClick={(event) => event.stopPropagation()}>
        {kind === "video" ? (
          <video src={src} controls autoPlay playsInline aria-label={title} />
        ) : (
          <img src={src} alt={title} />
        )}
        <p className="media-lightbox__caption">{title}</p>
      </div>
    </div>
  );
}

export function FullscreenMediaButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="media-fullscreen-button"
      onClick={onClick}
      aria-label={`เปิด${label}แบบเต็มจอ`}
      title="ดูเต็มจอ"
    >
      <Maximize2 size={17} />
    </button>
  );
}
