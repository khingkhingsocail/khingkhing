import { useRef, useState } from "react";
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  LockKeyhole,
  MessageCircle,
  Trophy,
  TrendingUp,
  Users,
  Heart,
  Activity,
  LogIn,
  LoaderCircle,
} from "lucide-react";
import { Link } from "wouter";
import { startLogin } from "@/const";
import LogoutButton from "./LogoutButton";
import "./branded-login.css";

const categories = [
  { label: "กีฬา", Icon: Activity },
  { label: "การลงทุนหุ้น", Icon: TrendingUp },
  { label: "ผู้ติดตาม", Icon: Users },
  { label: "ยอดไลค์", Icon: Heart },
  { label: "สถิติโลก", Icon: Trophy },
];
export default function BrandedLogin({
  checking = false,
  authenticated = false,
  accountName = null,
  authError = false,
  onRetry,
  onLogout,
}: {
  checking?: boolean;
  authenticated?: boolean;
  accountName?: string | null;
  authError?: boolean;
  onRetry?: () => void;
  onLogout?: () => Promise<unknown>;
}) {
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  const loginInFlight = useRef(false);
  const loginLabel = checking
    ? "กำลังตรวจสอบบัญชี…"
    : starting
      ? "กำลังเปิดการเข้าสู่ระบบ…"
      : "เข้าสู่ระบบ";
  function signIn() {
    if (loginInFlight.current || starting || checking) return;
    loginInFlight.current = true;
    setError("");
    setStarting(true);
    try {
      startLogin();
    } catch {
      loginInFlight.current = false;
      setStarting(false);
      setError(
        "ยังเปิดการเข้าสู่ระบบไม่ได้ กรุณาลองใหม่ หรือลองเปิดหน้านี้ในแท็บใหม่"
      );
    }
  }
  return (
    <main
      className="khing-login manus-no-record"
      aria-labelledby="khing-login-title"
    >
      <div className="khing-login__ambient" aria-hidden="true" />
      <header className="khing-login__nav">
        <Link
          className="khing-login__brand"
          href="/login"
          aria-label="ขิงขิง หน้าล็อกอิน"
        >
          <span className="brand-mark" aria-hidden="true">
            <span />
          </span>
          <span>
            ขิงขิง<small>KHING KHING</small>
          </span>
        </Link>
        <div className="khing-login__nav-actions">
          <Link className="khing-login__browse" href="/feed">
            ดูฟีดก่อน <ArrowUpRight size={16} />
          </Link>
          {authenticated ? (
            <Link className="khing-login__nav-enter" href="/feed">
              เข้าแอป <ChevronRight size={16} />
            </Link>
          ) : (
            <button
              type="button"
              className="khing-login__nav-enter"
              disabled={checking || starting}
              onClick={signIn}
              aria-busy={checking || starting}
            >
              <LogIn size={16} aria-hidden="true" /> {loginLabel}
            </button>
          )}
        </div>
      </header>
      <div className="khing-login__body">
        <section className="khing-login__story" aria-label="เวทีของคุณ">
          <div className="khing-login__eyebrow">
            <Trophy size={16} />
            <span>KHING KHING ARENA</span>
            <i />
          </div>
          <p className="khing-login__english">YOUR STATS. YOUR STAGE.</p>
          <h1 id="khing-login-title">
            ขิงให้สุด
            <span>
              ขึ้นที่หนึ่งใน
              <br />
              ทางของคุณ
            </span>
          </h1>
          <p className="khing-login__intro">
            ทุกคนมีเรื่องให้ขิง เลือกสนามที่ใช่
            <br />
            โชว์ผลงานของคุณ แล้วก้าวขึ้นอันดับไปด้วยกัน
          </p>
          <div className="khing-login__categories" aria-label="หมวดการแข่งขัน">
            {categories.map(({ label, Icon }) => (
              <span key={label}>
                <Icon size={14} />
                {label}
              </span>
            ))}
          </div>
          <div className="khing-login__stage" aria-hidden="true">
            <div className="khing-login__stage-line" />
            <span className="khing-login__stage-mark">
              <Trophy size={28} />
            </span>
            <span>
              YOUR NEXT CHAPTER
              <br />
              <b>STARTS HERE.</b>
            </span>
          </div>
        </section>
        <section
          className="khing-login__card"
          aria-labelledby="khing-login-card-title"
        >
          <p className="khing-login__card-index">01 / ENTER THE ARENA</p>
          <div className="khing-login__emblem" aria-hidden="true">
            <span>ข</span>
          </div>
          <h2 id="khing-login-card-title">
            {authenticated ? "คุณอยู่ในขิงขิงแล้ว" : "เข้าสู่ระบบขิงขิง"}
          </h2>
          <p className="khing-login__card-copy">
            {authenticated
              ? `พร้อมไปต่อ${accountName ? ` คุณ${accountName}` : ""} เลือกสนามของคุณได้เลย`
              : "เข้าบัญชีของคุณ เพื่อโพสต์ พูดคุย และบันทึกโปรไฟล์ข้ามอุปกรณ์"}
          </p>
          {authenticated ? (
            <Link className="khing-login__submit" href="/feed">
              เข้าสู่แอปขิงขิง <ChevronRight size={20} />
            </Link>
          ) : (
            <button
              type="button"
              className="khing-login__submit"
              disabled={checking || starting}
              onClick={signIn}
              aria-busy={checking || starting}
              aria-describedby="khing-login-provider"
            >
              <span className="khing-login__submit-label">
                {checking || starting ? (
                  <LoaderCircle
                    size={21}
                    className="khing-login__spinner"
                    aria-hidden="true"
                  />
                ) : (
                  <LogIn size={21} aria-hidden="true" />
                )}
                <span>
                  {loginLabel}
                  <small>LOGIN · KHING KHING</small>
                </span>
              </span>
              <ArrowUpRight size={19} />
            </button>
          )}
          {authenticated && onLogout ? (
            <LogoutButton onLogout={onLogout} disabled={checking} />
          ) : null}
          {!authenticated ? (
            <p id="khing-login-provider" className="khing-login__provider">
              ยืนยันบัญชีผ่าน Manus · ไม่ต้องกรอกรหัสผ่านในเว็บขิงขิง
            </p>
          ) : null}
          {authError ? (
            <p className="khing-login__error" role="alert">
              ตรวจสอบบัญชีไม่สำเร็จ ยังไม่มีการยืนยันว่าเข้าสู่ระบบแล้ว{" "}
              {onRetry ? (
                <button type="button" onClick={onRetry}>
                  ตรวจสอบอีกครั้ง
                </button>
              ) : null}
            </p>
          ) : null}
          {error ? (
            <p className="khing-login__error" role="alert">
              {error}
            </p>
          ) : null}
          <ul className="khing-login__benefits">
            <li>
              <Trophy size={17} />
              <span>โชว์ผลงานในสนามแข่งขันของคุณ</span>
              <Check size={13} />
            </li>
            <li>
              <MessageCircle size={17} />
              <span>คุยส่วนตัวและกลุ่มกับเพื่อน</span>
              <Check size={13} />
            </li>
            <li>
              <LockKeyhole size={17} />
              <span>โปรไฟล์บัญชีซิงค์ข้ามอุปกรณ์</span>
              <Check size={13} />
            </li>
          </ul>
          <div className="khing-login__divider">
            <span />
            หรือเริ่มจากการสำรวจ
            <span />
          </div>
          <Link className="khing-login__guest" href="/feed">
            ดูฟีดแบบผู้เยี่ยมชม <ChevronRight size={16} />
          </Link>
          <small className="khing-login__privacy">
            ฟีดและโพสต์สาธารณะเปิดให้เข้าชมได้
            <br />
            แชทต้องใช้บัญชีจริง โปรไฟล์ Arena เลือกสร้างแยกได้
          </small>
        </section>
      </div>
      <footer className="khing-login__footer">
        <span>ขิงขิง · สถิติของคุณ เวทีของคุณ</span>
        <span>BE YOUR OWN NUMBER ONE.</span>
      </footer>
    </main>
  );
}
