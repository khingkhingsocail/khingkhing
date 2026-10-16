import { useEffect, useRef, useState } from "react";
import { Paperclip, Send } from "lucide-react";
import type { ChatMessage } from "../../../../shared/chat";
import { sendChatMessage, ChatApiError } from "@/lib/chat";
import EvidenceFilePicker from "../arena/EvidenceFilePicker";
import { evidenceFileKey } from "@/lib/evidenceFiles";
export default function ChatComposer({
  roomId,
  onSent,
  onForbidden,
}: {
  roomId: string;
  onSent: (message: ChatMessage) => void;
  onForbidden: () => void;
}) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const requestRef = useRef<{ key: string; id: string } | null>(null);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  async function send() {
    if (busy || (!text.trim() && !files.length)) return;
    setBusy(true);
    setError("");
    const key = JSON.stringify([text, files.map(evidenceFileKey)]);
    const clientId =
      requestRef.current?.key === key
        ? requestRef.current.id
        : crypto.randomUUID();
    requestRef.current = { key, id: clientId };
    try {
      const result = await sendChatMessage(roomId, clientId, text, files);
      if (active.current) {
        setText("");
        setFiles([]);
        setPicker(false);
        requestRef.current = null;
        onSent(result.message);
      }
    } catch (cause) {
      if (active.current) {
        setError(cause instanceof Error ? cause.message : "ส่งไม่สำเร็จ");
        if (cause instanceof ChatApiError && [401, 403].includes(cause.status))
          onForbidden();
      }
    } finally {
      if (active.current) setBusy(false);
    }
  }
  return (
    <form
      className="chat-composer manus-no-record"
      onSubmit={event => {
        event.preventDefault();
        void send();
      }}
    >
      {picker ? (
        <EvidenceFilePicker
          files={files}
          onChange={next => {
            requestRef.current = null;
            setFiles(next);
          }}
          disabled={busy}
        />
      ) : null}
      <p className="chat-composer__privacy">
        ส่งให้สมาชิกในห้องนี้เท่านั้น · ไม่ขึ้นฟีด/ไม่ส่ง AI ·
        สมาชิกอาจบันทึกสำเนาได้
      </p>
      <div className="chat-compose-row">
        <button
          type="button"
          className="chat-icon"
          aria-label="แนบรูปภาพหรือวิดีโอ"
          aria-expanded={picker}
          disabled={busy}
          onClick={() => setPicker(v => !v)}
        >
          <Paperclip size={19} />
        </button>
        <textarea
          aria-label="ข้อความที่จะส่ง"
          maxLength={2000}
          placeholder="พิมพ์ข้อความ…"
          disabled={busy}
          value={text}
          onChange={event => {
            requestRef.current = null;
            setText(event.target.value);
          }}
          onKeyDown={event => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              void send();
            }
          }}
        />
        <button
          type="submit"
          className="chat-send"
          disabled={busy || (!text.trim() && !files.length)}
        >
          <Send size={17} />
          <span>{busy ? "กำลังส่ง" : "ส่ง"}</span>
        </button>
      </div>
      <small>
        {text.length}/2000 · Enter ส่ง / Shift+Enter ขึ้นบรรทัดใหม่
        {files.length ? ` · แนบ ${files.length} ไฟล์` : ""}
      </small>
      {error ? (
        <p className="chat-error" role="alert">
          {error} · ข้อความและไฟล์ยังอยู่ ลองส่งใหม่ได้
        </p>
      ) : null}
    </form>
  );
}
