import { useEffect, useRef } from "react";
import { ArrowLeft, Eye, Image, Play } from "lucide-react";
import type { FeedCreatorProfile, FeedProfilePost } from "@/lib/feedProfile";
import "./public-creator.css";

const viewCountFormatter = new Intl.NumberFormat("th-TH");

function formatViewCount(value?: number) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? viewCountFormatter.format(value)
    : "—";
}

interface FeedProfilePreviewProps {
  profile: FeedCreatorProfile;
  posts: FeedProfilePost[];
  onBack: () => void;
  onOpenPost: (id: string) => void;
  loading?: boolean;
  loadingMore?: boolean;
  error?: string;
  hasMore?: boolean;
  onRetry?: () => void;
  onLoadMore?: () => void;
}

export default function FeedProfilePreview({
  profile,
  posts,
  onBack,
  onOpenPost,
  loading = false,
  loadingMore = false,
  error = "",
  hasMore = false,
  onRetry,
  onLoadMore,
}: FeedProfilePreviewProps) {
  const isAnonymous = profile.kind === "anonymous";
  const isAccount = profile.kind === "account";
  const initial = Array.from(profile.displayName.trim())[0] ?? "ข";
  const eyebrow = isAccount
    ? "PUBLIC CREATOR ACCOUNT"
    : isAnonymous
      ? "GUEST · LIMITED PROFILE"
      : "SAMPLE CREATOR PROFILE";
  const titleRef = useRef<HTMLHeadingElement>(null);
  const backRef = useRef(onBack);
  backRef.current = onBack;

  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        backRef.current();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [profile.id]);

  return (
    <section
      className="short-feed-page feed-profile-page"
      aria-labelledby="feed-profile-title"
    >
      <header className="feed-profile-toolbar">
        <button type="button" className="feed-profile-back" onClick={onBack}>
          <ArrowLeft size={17} /> กลับไปที่ฟีด
        </button>
        <span>ขิงขิง · PROFILE</span>
      </header>
      <div className="feed-profile-scroll">
        <div className="feed-profile-content">
          <div
            className={`feed-profile-cover ${isAnonymous ? "feed-profile-cover--guest" : ""} ${isAccount ? "feed-profile-cover--account" : ""}`}
          >
            <span>
              {isAccount
                ? "PUBLIC CREATOR"
                : isAnonymous
                  ? "PUBLIC POST"
                  : "CREATIVE SPACE"}
            </span>
            <span className="feed-profile-cover__mark" aria-hidden="true">
              ✳
            </span>
          </div>
          <div className="feed-profile-identity">
            <span
              className={`feed-profile-avatar ${isAnonymous ? "feed-profile-avatar--guest" : ""} ${isAccount ? "feed-profile-avatar--account" : ""}`}
              aria-hidden="true"
            >
              <span>{initial}</span>
              {isAccount && profile.avatarUrl ? (
                <img
                  src={profile.avatarUrl}
                  alt=""
                  loading="lazy"
                  onError={event => {
                    event.currentTarget.style.visibility = "hidden";
                  }}
                />
              ) : null}
            </span>
            <div className="feed-profile-identity__text">
              <p className="feed-profile-eyebrow">{eyebrow}</p>
              <h1 ref={titleRef} tabIndex={-1} id="feed-profile-title">
                {profile.displayName}
              </h1>
              {profile.handle ? (
                <p>@{profile.handle}</p>
              ) : (
                <p>
                  {isAccount
                    ? "บัญชีครีเอเตอร์สาธารณะ"
                    : "ผู้โพสต์ไม่ระบุตัวตน"}
                </p>
              )}
            </div>
          </div>
          {!isAccount && profile.bio ? (
            <p className="feed-profile-bio">{profile.bio}</p>
          ) : null}
          {!isAccount ? (
            <div className="feed-profile-stats" aria-label="สถิติโปรไฟล์">
              <span>
                <strong>{posts.length}</strong> โพสต์
              </span>
              <span>
                <strong>—</strong> ผู้ติดตาม
              </span>
              <span>
                <strong>—</strong> กำลังติดตาม
              </span>
            </div>
          ) : null}
          {isAccount || isAnonymous ? (
            <aside className="feed-profile-notice" role="note">
              {isAccount
                ? "นี่คือบัญชีครีเอเตอร์ในขิงขิง ข้อมูลนี้ยืนยันได้เพียงบัญชีในบริการ ไม่ได้พิสูจน์ตัวตนในโลกจริง"
                : profile.bio ||
                  "ผู้โพสต์อัปโหลดแบบไม่ระบุตัวตน จึงแสดงเฉพาะโพสต์สาธารณะนี้ ไม่มีข้อมูลส่วนตัวหรือบัญชีผู้ใช้ให้ดู"}
            </aside>
          ) : (
            <aside className="feed-profile-notice" role="note">
              นี่คือโปรไฟล์ครีเอเตอร์ตัวอย่างในต้นแบบ ไม่ใช่บัญชีผู้ใช้จริง;
              สถิติและระบบติดตามยังไม่เชื่อม backend
            </aside>
          )}

          <section
            className="feed-profile-posts"
            aria-labelledby="feed-profile-posts-title"
          >
            <header>
              <div>
                <p className="feed-profile-eyebrow">
                  {isAnonymous || isAccount ? "PUBLIC POSTS" : "SAMPLE POSTS"}
                </p>
                <h2 id="feed-profile-posts-title">
                  {isAnonymous || isAccount ? "โพสต์สาธารณะ" : "โพสต์ตัวอย่าง"}
                </h2>
              </div>
              <span>
                {posts.length} รายการ{isAccount ? "ที่โหลดแล้ว" : ""}
              </span>
            </header>
            {loading && posts.length === 0 ? (
              <p className="feed-profile-loading" role="status">
                กำลังโหลดโพสต์สาธารณะ…
              </p>
            ) : null}
            {error ? (
              <div className="feed-profile-error" role="alert">
                <span>{error}</span>
                {onRetry ? (
                  <button type="button" onClick={onRetry}>
                    ลองใหม่
                  </button>
                ) : null}
              </div>
            ) : null}
            {posts.length ? (
              <div className="feed-profile-grid">
                {posts.map(post => (
                  <article className="feed-profile-card" key={post.id}>
                    <button
                      type="button"
                      className="feed-profile-card__open"
                      onClick={() => onOpenPost(post.id)}
                      aria-label={`เปิดโพสต์ ${post.title} ในฟีด`}
                    >
                      <span className="feed-profile-card__media">
                        {post.kind === "image" ? (
                          <img
                            src={post.media}
                            alt={post.title}
                            loading="lazy"
                          />
                        ) : (
                          <video
                            src={post.media}
                            muted
                            playsInline
                            preload="metadata"
                            aria-label={post.title}
                          />
                        )}
                        <span className="feed-profile-card__kind">
                          {post.kind === "video" ? (
                            <Play size={13} fill="currentColor" />
                          ) : (
                            <Image size={13} />
                          )}
                          {post.kind === "video" ? "วิดีโอ" : "ภาพ"}
                        </span>
                      </span>
                      <span className="feed-profile-card__copy">
                        <strong>{post.title}</strong>
                        <span className="feed-profile-card__caption">
                          {post.caption}
                        </span>
                        <span className="feed-profile-card__caption" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                          <Eye size={13} aria-hidden="true" /> {formatViewCount(post.viewCount)} วิว
                        </span>
                      </span>
                    </button>
                  </article>
                ))}
              </div>
            ) : !loading && !error ? (
              <p className="feed-profile-empty">
                ยังไม่มีโพสต์สาธารณะที่แสดงได้
              </p>
            ) : null}
            {hasMore ? (
              <div className="feed-profile-more">
                <button
                  type="button"
                  onClick={onLoadMore}
                  disabled={loadingMore || loading}
                >
                  {loadingMore ? "กำลังโหลด…" : "โหลดโพสต์เพิ่ม"}
                </button>
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </section>
  );
}
