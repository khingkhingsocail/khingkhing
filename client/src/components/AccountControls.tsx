import { Link } from "wouter";
import { ArrowUpRight } from "lucide-react";
import LogoutButton from "./LogoutButton";

export default function AccountControls({
  authenticated,
  pending = false,
  accountName,
  onLogout,
}: {
  authenticated: boolean;
  pending?: boolean;
  accountName?: string | null;
  onLogout: () => Promise<unknown>;
}) {
  return (
    <section className="khing-account manus-no-record" aria-label="บัญชีขิงขิง">
      {authenticated ? (
        <>
          <p className="khing-account__name">
            บัญชีขิงขิง<span>{accountName || "เข้าสู่ระบบแล้ว"}</span>
          </p>
          <LogoutButton onLogout={onLogout} disabled={pending} />
          <small className="khing-account__note">
            ออกจากบัญชีในเว็บนี้ · ไม่ลบไฟล์หรือโปรไฟล์
          </small>
        </>
      ) : pending ? (
        <p className="khing-account__loading" role="status">
          กำลังตรวจสอบบัญชี…
        </p>
      ) : (
        <Link href="/login" className="short-login-link">
          เข้าสู่ระบบขิงขิง <ArrowUpRight size={14} />
        </Link>
      )}
    </section>
  );
}
