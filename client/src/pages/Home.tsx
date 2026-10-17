import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  ArrowUpRight,
  BarChart3,
  Compass,
  Gamepad2,
  House,
  ImagePlus,
  UserRound,
  MessageCircle,
  ScanSearch,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Link } from "wouter";
import LocalProfileEditor from "@/components/LocalProfileEditor";
import LocalMediaLibrary from "@/components/LocalMediaLibrary";
import NeonCatchGame from "@/components/NeonCatchGame";
import PublicMediaLibrary from "@/components/PublicMediaLibrary";
import MediaClassifier from "@/components/MediaClassifier";
import ShortVideoFeed from "@/components/ShortVideoFeed";
import DiscoverWorks, {
  type DiscoverSection,
} from "@/components/DiscoverWorks";
import ChatPage from "@/components/chat/ChatPage";
import type { ChatTarget } from "../../../shared/chat";
import { useAuth } from "@/_core/hooks/useAuth";
import AccountControls from "@/components/AccountControls";
import AccountProfileEditor from "@/components/AccountProfileEditor";
import {
  NotificationCenter,
  type NotificationTarget,
} from "@/components/notifications/NotificationCenter";

type ViewId =
  | "feed"
  | "gallery"
  | "upload"
  | "private-library"
  | "game"
  | "profile"
  | "chat"
  | "classifier";

const navigation: {
  id: Exclude<ViewId, "private-library">;
  label: string;
  Icon: LucideIcon;
}[] = [
  { id: "feed", label: "ฟีดคลิป", Icon: House },
  { id: "gallery", label: "ค้นพบผลงาน", Icon: Compass },
  { id: "upload", label: "โพสต์สาธารณะ", Icon: ImagePlus },
  { id: "classifier", label: "AI จำแนกสื่อ", Icon: ScanSearch },
  { id: "chat", label: "ข้อความ", Icon: MessageCircle },
  { id: "game", label: "เล่นเกม", Icon: Gamepad2 },
  { id: "profile", label: "โปรไฟล์", Icon: UserRound },
];

function toggleId(setter: Dispatch<SetStateAction<Set<string>>>, id: string) {
  setter(current => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
}

export default function Home() {
  const auth = useAuth();
  const accountControls = (
    <AccountControls
      authenticated={auth.isAuthenticated}
      pending={auth.loading}
      accountName={auth.user?.name}
      onLogout={auth.logout}
    />
  );
  const [activeView, setActiveView] = useState<ViewId>("feed");
  const [statsOpen, setStatsOpen] = useState(false);
  const [discoverSection, setDiscoverSection] =
    useState<DiscoverSection>("works");
  const [likedIds, setLikedIds] = useState<Set<string>>(() => new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(() => new Set());
  const [followed, setFollowed] = useState(false);
  const [notificationTarget, setNotificationTarget] =
    useState<NotificationTarget | null>(null);
  const [chatTarget, setChatTarget] = useState<ChatTarget | null>(null);
  const activeLabel =
    navigation.find(item => item.id === activeView)?.label ?? "คลังส่วนตัวเดิม";

  function renderPage() {
    if (activeView === "feed") {
      return (
        <ShortVideoFeed
          key={auth.user?.id ?? "guest"}
          viewerId={auth.user?.id ?? null}
          authLoading={auth.loading}
          notificationTarget={notificationTarget}
          onNotificationHandled={() => setNotificationTarget(null)}
          likedIds={likedIds}
          savedIds={savedIds}
          followed={followed}
          statsOpen={statsOpen}
          onStatsChange={setStatsOpen}
          onLike={id => toggleId(setLikedIds, id)}
          onSave={id => toggleId(setSavedIds, id)}
          onFollow={() => setFollowed(value => !value)}
          onOpenOwnProfile={() => setActiveView("profile")}
          onOpenChat={target => {
            setChatTarget(target);
            setActiveView("chat");
          }}
        />
      );
    }
    if (activeView === "chat")
      return (
        <ChatPage
          target={chatTarget}
          onTargetHandled={() => setChatTarget(null)}
        />
      );
    if (activeView === "gallery") {
      return (
        <DiscoverWorks
          section={discoverSection}
          onSectionChange={setDiscoverSection}
          likedIds={likedIds}
          savedIds={savedIds}
          onOpenPost={id => {
            window.location.hash = `feed-public-${id}`;
            setStatsOpen(false);
            setActiveView("feed");
          }}
          onOpenChat={target => {
            setChatTarget(target);
            setActiveView("chat");
          }}
        />
      );
    }
    if (activeView === "upload") {
      return (
        <section
          className="tool-view tool-view--wide"
          aria-labelledby="public-upload-title"
        >
          <header className="tool-view__header">
            <p className="tool-view__eyebrow">PUBLIC · EVERYONE CAN VIEW</p>
            <h1 id="public-upload-title">โพสต์สาธารณะ</h1>
            <p>
              ผู้เข้าชมทุกคนอัปโหลดได้โดยไม่ต้องมีบัญชี
              และทุกไฟล์ที่โพสต์จะเปิดให้สาธารณะทันที
            </p>
          </header>
          <PublicMediaLibrary onViewFeed={() => setActiveView("feed")} />
        </section>
      );
    }
    if (activeView === "classifier") {
      return (
        <section className="tool-view tool-view--wide" aria-labelledby="classifier-page-title">
          <header className="tool-view__header">
            <p className="tool-view__eyebrow">AI · IMAGE / VIDEO CLASSIFICATION</p>
            <h1 id="classifier-page-title">AI จำแนกรูปภาพและวิดีโอ</h1>
            <p>อัปโหลดสื่อเพื่อดูวัตถุ สัตว์ ฉาก สี และการกระทำที่ AI ตรวจพบ พร้อมชื่อและคำอธิบายที่แนะนำ</p>
          </header>
          <MediaClassifier />
        </section>
      );
    }
    if (activeView === "private-library") {
      return (
        <section
          className="tool-view tool-view--wide"
          aria-labelledby="private-library-title"
        >
          <header className="tool-view__header">
            <p className="tool-view__eyebrow">
              PRIVATE · EXISTING BROWSER FILES
            </p>
            <h1 id="private-library-title">คลังส่วนตัวเดิม</h1>
            <p>
              ไฟล์ที่บันทึกไว้ก่อนเปิดฟีดสาธารณะยังคงอยู่ในเบราว์เซอร์นี้และไม่ถูกเผยแพร่
            </p>
          </header>
          <LocalMediaLibrary onViewFeed={() => setActiveView("feed")} />
        </section>
      );
    }
    if (activeView === "game") {
      return (
        <section
          className="tool-view tool-view--wide"
          aria-labelledby="game-title"
        >
          <header className="tool-view__header">
            <p className="tool-view__eyebrow">TAKE A PLAY BREAK</p>
            <h1 id="game-title">พักดูคลิป มาเล่นเกม</h1>
            <p>เกมจับแสง 20 วินาที เล่นได้ด้วยคีย์บอร์ดหรือแตะหน้าจอ</p>
          </header>
          <NeonCatchGame />
        </section>
      );
    }
    return (
      <>
        <div className="profile-account-panel">{accountControls}</div>
        {auth.loading ? (
          <p className="profile-status" role="status">
            กำลังตรวจสอบบัญชี…
          </p>
        ) : auth.isAuthenticated && auth.user ? (
          <AccountProfileEditor
            key={auth.user.id}
            userId={auth.user.id}
            onOpenUpload={() => setActiveView("upload")}
            onOpenPrivate={() => setActiveView("private-library")}
          />
        ) : (
          <>
            <p className="profile-status">
              เข้าสู่ระบบเพื่อบันทึกโปรไฟล์ในฐานข้อมูลและซิงค์ข้ามอุปกรณ์
              ข้อมูลส่วนตัวเดิมยังอยู่ในเบราว์เซอร์
            </p>
            <LocalProfileEditor
              onOpenUpload={() => setActiveView("upload")}
              onOpenPrivate={() => setActiveView("private-library")}
            />
          </>
        )}
      </>
    );
  }

  return (
    <div className="short-app-shell">
      <aside className="short-sidebar" aria-label="แถบนำทางขิงขิง">
        <a
          className="short-sidebar__brand"
          href="#feed"
          onClick={event => {
            event.preventDefault();
            setStatsOpen(false);
            setActiveView("feed");
          }}
          aria-label="ขิงขิง หน้าแรก"
        >
          <span className="brand-mark" aria-hidden="true">
            <span />
          </span>
          <span className="brand-name">ขิงขิง</span>
        </a>
        <button
          type="button"
          className="short-search"
          onClick={() => {
            setStatsOpen(true);
            setActiveView("feed");
          }}
        >
          <BarChart3 size={18} />
          <span>ขิงขิง · จัดอันดับโปรไฟล์</span>
        </button>
        <p className="short-sidebar__label">เมนู</p>
        <nav className="short-nav" aria-label="เมนูหลัก">
          {navigation.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              className={`short-nav__item ${activeView === id ? "is-active" : ""} ${id === "upload" ? "short-nav__item--create" : ""}`}
              aria-current={activeView === id ? "page" : undefined}
              onClick={() => setActiveView(id)}
            >
              <Icon size={20} strokeWidth={activeView === id ? 2.4 : 1.8} />
              <span>{label}</span>
              {id === "upload" ? (
                <span className="short-nav__plus">+</span>
              ) : null}
            </button>
          ))}
        </nav>
        <div className="short-sidebar__bottom">
          {accountControls}
          <span className="short-sidebar__live">
            <i /> ขิงขิง · 2026
          </span>
          <p>
            โพสต์ใหม่เป็นสาธารณะ
            <br />
            ไฟล์ส่วนตัวเดิมอยู่ในเครื่อง
          </p>
        </div>
      </aside>

      <div className="app-notification-control">
        <NotificationCenter
          key={auth.user?.id ?? "guest"}
          authenticated={auth.isAuthenticated}
          pending={auth.loading}
          accountKey={auth.user?.id}
          onOpen={target => {
            setStatsOpen(false);
            setNotificationTarget(target);
            setActiveView("feed");
          }}
        />
      </div>
      <main className={`short-main short-main--${activeView}`}>
        {renderPage()}
      </main>

      <aside className="short-context" aria-label="เกี่ยวกับขิงขิง">
        <div className="short-context__top">
          <span className="tool-view__eyebrow">YOUR CREATIVE SPACE</span>
          <span className="context-signal">
            <i /> ONLINE
          </span>
        </div>
        <div className="context-card">
          <span className="context-avatar">
            ข<span>✳</span>
          </span>
          <div className="context-card__name">
            <strong>ขิงขิง</strong>
            <span>Creative archive</span>
          </div>
          <p>
            โพสต์ใหม่จะเปิดให้ทุกคนดู ส่วนไฟล์ในคลังเดิมยังคงส่วนตัวบนอุปกรณ์นี้
          </p>
          <button type="button" onClick={() => setActiveView("upload")}>
            โพสต์สาธารณะ <ArrowUpRight size={15} />
          </button>
        </div>
        <div className="context-card context-card--soft">
          <p className="tool-view__eyebrow">TAKE A BREAK</p>
          <strong>คลิปต่อไปพักไว้ก่อน</strong>
          <span>เกมจับแสงรอคุณอยู่</span>
          <button
            type="button"
            className="context-play"
            onClick={() => setActiveView("game")}
          >
            <Gamepad2 size={16} /> ไปเล่นเกม
          </button>
        </div>
        <Link href="/login" className="short-login-link">
          บัญชีขิงขิง <ArrowUpRight size={14} />
        </Link>
        <div className="short-context__footer">
          <span>หน้า: {activeLabel}</span>
          <span>ไฟล์ใหม่เปิดสาธารณะหลังโพสต์</span>
        </div>
      </aside>

      <nav className="short-bottom-nav" aria-label="เมนูหลักบนมือถือ">
        {navigation.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            className={`short-bottom-nav__item ${activeView === id ? "is-active" : ""} ${id === "upload" ? "short-bottom-nav__item--create" : ""}`}
            aria-current={activeView === id ? "page" : undefined}
            onClick={() => setActiveView(id)}
          >
            <span className="short-bottom-nav__icon">
              <Icon
                size={id === "upload" ? 24 : 21}
                strokeWidth={activeView === id ? 2.4 : 1.8}
              />
            </span>
            <span>
              {id === "upload"
                ? "โพสต์"
                : id === "gallery"
                  ? "ค้นพบ"
                  : id === "game"
                    ? "เกม"
                    : id === "profile"
                      ? "ฉัน"
                      : id === "chat"
                        ? "ข้อความ"
                        : "ฟีด"}
            </span>
          </button>
        ))}
      </nav>
    </div>
  );
}
