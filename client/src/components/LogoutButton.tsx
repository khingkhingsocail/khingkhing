import { useRef, useState } from "react";
import { LogOut } from "lucide-react";
import { useLocation } from "wouter";
import "./account-controls.css";

export default function LogoutButton({
  onLogout,
  disabled = false,
}: {
  onLogout: () => Promise<unknown>;
  disabled?: boolean;
}) {
  const [, navigate] = useLocation();
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function leave() {
    if (inFlight.current || disabled) return;
    inFlight.current = true;
    setPending(true);
    setError("");
    try {
      await onLogout();
      // Do not reload the iframe or initiate OAuth; render the branded page.
      navigate("/login", { replace: true });
    } catch {
      setError("ออกจากระบบไม่สำเร็จ กรุณาลองอีกครั้ง");
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }
  return (
    <div className="khing-logout manus-no-record">
      <button
        type="button"
        className="khing-logout__button"
        disabled={disabled || pending}
        aria-busy={pending}
        onClick={() => void leave()}
      >
        <LogOut size={16} aria-hidden="true" />
        <span>{pending ? "กำลังออกจากระบบ…" : "ออกจากระบบ"}</span>
      </button>
      {error ? (
        <p className="khing-logout__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
