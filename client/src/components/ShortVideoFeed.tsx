import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  ChevronDown,
  ChevronUp,
  ThumbsDown,
  Bookmark,
  Eye,
  Heart,
  LockKeyhole,
  MessageCircle,
  Music2,
  Pause,
  Play,
  RefreshCw,
  Share2,
  Trash2,
  Volume2,
  VolumeX,
} from "lucide-react";
import { getAllLocalMedia, type LocalMediaRecord } from "@/lib/localMedia";
import {
  deletePublicMedia,
  fetchCreatorMediaPage,
  fetchPublicMediaItem,
  fetchPublicMediaPage,
  fetchPublicMediaCreator,
  forgetOwnedPublicToken,
  getOwnedPublicTokens,
  getPublicMediaAssetUrl,
} from "@/lib/publicMedia";
import type { PublicMediaSummary } from "@shared/publicMedia";
import FeedProfilePreview from "@/components/FeedProfilePreview";
import "@/components/public-creator.css";
import "@/components/public-post-views.css";
import KhingArena from "@/components/arena/KhingArena";
import CommentsPanel from "@/components/comments/CommentsPanel";
import { MediaViewSession } from "@/lib/mediaViews";
import { usePublicPostView } from "@/hooks/usePublicPostView";
import MediaLightbox, { FullscreenMediaButton } from "@/components/MediaLightbox";
import type { ChatTarget } from "../../../shared/chat";
import {
  feedCreatorFromPublicCreator,
  selectFeedProfilePosts,
  type FeedCreatorProfile,
} from "@/lib/feedProfile";

import { usePersonalFeed } from "@/hooks/usePersonalFeed";
import { useFeedSwipe } from "@/hooks/useFeedSwipe";
import { useFeedBehavior } from "@/hooks/useFeedBehavior";
import { useFeedVisibility } from "@/hooks/useFeedVisibility";
import {
  rankPersonalFeed,
  personalFeedReason,
  emptyFeedPreferences,
  type FeedAction,
} from "@shared/feedPersonalization";
import "@/components/personal-feed.css";

const PAGE_SIZE = 40;
type FeedKind = "image" | "video";
type FeedFilter = "all" | FeedKind;
type Visibility = "demo" | "private" | "public";

export function selectIdentityPosts<T>(
  ranked: T[],
  neutral: T[],
  rankedIdentity: string | null,
  identity: string,
  ready: boolean
): T[] {
  return ready && rankedIdentity === identity ? ranked : neutral;
}

interface FeedPost {
  id: string;
  kind: FeedKind;
  title: string;
  caption: string;
  tags: string[];
  media: string;
  audio: string;
  visibility: Visibility;
  creator: FeedCreatorProfile;
  publicMediaId?: string;
  accountOwned?: boolean;
  viewCount?: number;
  publicSummary?: PublicMediaSummary;
  recommendationReason?: string;
}

const demoCreator: FeedCreatorProfile = {
  id: "demo-khingkhing",
  displayName: "ขิงขิง",
  handle: "khingkhing-demo",
  bio: "ครีเอเตอร์ตัวอย่างในฟีดขิงขิง ยังไม่ใช่บัญชีผู้ใช้จริง",
  kind: "demo",
};

const demoPosts: FeedPost[] = [
  {
    id: "motion-study",
    kind: "video",
    title: "Motion study 01",
    caption: "ภาพเคลื่อนไหวสั้น ๆ จากคลิปตัวอย่าง CC0 ของ MDN",
    tags: ["#motionstudy", "#video"],
    media: "/manus-storage/playfolio-flower_989f6926.mp4",
    audio: "เสียงต้นฉบับ · คลิป CC0",
    visibility: "demo",
    creator: demoCreator,
  },
  {
    id: "night-walk",
    kind: "image",
    title: "ทางเดินหลังฝน",
    caption: "แสงเมืองค่อย ๆ สะท้อนบนถนนหลังฝนหยุด",
    tags: ["#nightwalk", "#ภาพถ่ายตัวอย่าง"],
    media: "/manus-storage/urban-night-vertical_7f92afe2.jpg",
    audio: "ภาพนิ่ง · คลังตัวอย่าง",
    visibility: "demo",
    creator: demoCreator,
  },
  {
    id: "neon-corner",
    kind: "image",
    title: "แสงที่ปลายซอย",
    caption: "สีสันยามค่ำคืนที่ซ่อนอยู่ในมุมเมือง",
    tags: ["#citylight", "#creative"],
    media: "/manus-storage/neon-street_d6f1f55d.jpg",
    audio: "ภาพนิ่ง · คลังตัวอย่าง",
    visibility: "demo",
    creator: demoCreator,
  },
  {
    id: "rain-window",
    kind: "image",
    title: "หลังม่านฝน",
    caption: "หยุดดูรายละเอียดเล็ก ๆ ระหว่างทาง",
    tags: ["#rainyday", "#frameit"],
    media: "/manus-storage/rainy-night_3e8a1617.jpg",
    audio: "ภาพนิ่ง · คลังตัวอย่าง",
    visibility: "demo",
    creator: demoCreator,
  },
];

const filters: { id: FeedFilter; label: string }[] = [
  { id: "all", label: "สำหรับคุณ" },
  { id: "video", label: "วิดีโอ" },
  { id: "image", label: "ภาพ" },
];

function makePrivatePost(record: LocalMediaRecord): FeedPost {
  return {
    id: `local-${record.id}`,
    kind: record.kind,
    title: record.name,
    caption:
      record.description.trim() ||
      (record.kind === "video"
        ? "วิดีโอส่วนตัวที่เก็บไว้ในเบราว์เซอร์นี้"
        : "รูปภาพส่วนตัวที่เก็บไว้ในเบราว์เซอร์นี้"),
    tags: ["#ส่วนตัว", "#อุปกรณ์นี้"],
    media: URL.createObjectURL(record.file),
    audio: "ไฟล์ส่วนตัว · อยู่ในอุปกรณ์นี้เท่านั้น",
    visibility: "private",
    creator: {
      id: "local-browser",
      displayName: "คุณ",
      handle: "",
      bio: "โปรไฟล์ส่วนตัวบนเบราว์เซอร์นี้",
      kind: "local",
    },
  };
}

function makePublicPost(
  item: PublicMediaSummary,
  creatorOverride?: FeedCreatorProfile
): FeedPost {
  const creator =
    creatorOverride ??
    (item.creator
      ? feedCreatorFromPublicCreator(item.creator)
      : {
          id: `guest-${item.id}`,
          displayName: item.accountLinked ? "สมาชิกขิงขิง" : "ผู้เข้าชม",
          handle: "",
          avatarUrl: null,
          bio: item.accountLinked
            ? "บัญชีสมาชิกขิงขิง โปรไฟล์นี้แสดงเฉพาะโพสต์นี้ ไม่รวมโพสต์อื่น"
            : "ผู้โพสต์อัปโหลดแบบไม่ระบุตัวตน จึงแสดงเฉพาะโพสต์สาธารณะนี้",
          kind: "anonymous" as const,
        });
  return {
    id: `public-${item.id}`,
    publicMediaId: item.id,
    publicSummary: item,
    accountOwned: Boolean(item.isMine),
    viewCount: item.viewCount,
    kind: item.kind,
    title: item.title,
    caption:
      item.description ||
      (item.accountLinked
        ? "โพสต์สาธารณะจากสมาชิกขิงขิง"
        : "โพสต์สาธารณะจากผู้เข้าชมขิงขิง"),
    tags: ["#ขิงขิง", "#สาธารณะ"],
    media: getPublicMediaAssetUrl(item.id),
    audio:
      item.kind === "video"
        ? `วิดีโอสาธารณะ · ${creator.kind === "account" ? "จากครีเอเตอร์" : "จากผู้เข้าชม"}`
        : `ภาพสาธารณะ · ${creator.kind === "account" ? "จากครีเอเตอร์" : "จากผู้เข้าชม"}`,
    visibility: "public",
    creator,
  };
}

function FeedPostCard({
  post,
  index,
  liked,
  saved,
  followed,
  canDelete,
  deleting,
  commentsOpen,
  commentCount,
  feedActive,
  viewSession,
  onViewCount,
  onSignal,
  onLike,
  onSave,
  onShowComments,
  onOpenProfile,
  onShare,
  onFollow,
  onDelete,
}: {
  post: FeedPost;
  index: number;
  liked: boolean;
  saved: boolean;
  followed: boolean;
  canDelete: boolean;
  deleting: boolean;
  commentsOpen: boolean;
  commentCount?: number;
  feedActive: boolean;
  viewSession: MediaViewSession;
  onViewCount: (count: number) => void;
  onSignal: (action: FeedAction) => void;
  onLike: () => void;
  onSave: () => void;
  onShowComments: () => void;
  onOpenProfile: () => void;
  onShare: () => void;
  onFollow: () => void;
  onDelete: () => void;
}) {
  const articleRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(true);
  const { inView, observable } = useFeedVisibility(
    articleRef,
    post.id,
    post.kind
  );
  const [imageReady, setImageReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const viewState = usePublicPostView(
    post.visibility === "public" ? post.publicMediaId : undefined,
    feedActive &&
      observable &&
      inView &&
      (post.kind === "image" ? imageReady : playing && !paused),
    viewSession,
    onViewCount
  );
  useFeedBehavior(
    post.id,
    inView,
    observable && (post.kind === "image" ? imageReady : playing && !paused),
    feedActive && post.visibility === "public",
    onSignal
  );
  const isPrivate = post.visibility === "private";
  const isPublic = post.visibility === "public";
  const creator = post.creator;
  const creatorInitial = Array.from(creator.displayName.trim())[0] ?? "ข";

  useEffect(() => {
    const video = videoRef.current;
    return () => video?.pause();
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (paused || !inView || !feedActive) {
      video.pause();
    } else {
      void video.play().catch(() => setPaused(true));
    }
  }, [paused, inView, feedActive]);

  return (
    <article
      ref={articleRef}
      className={`short-post ${isPrivate ? "short-post--private" : ""} ${isPublic ? "short-post--public" : ""}`}
      id={`feed-${post.id}`}
      aria-label={`${isPrivate ? "โพสต์ส่วนตัว" : isPublic ? "โพสต์สาธารณะ" : post.kind === "video" ? "วิดีโอตัวอย่าง" : "ภาพตัวอย่าง"}: ${post.title}`}
    >
      <div className="short-post__canvas">
        <div
          className="short-post__media"
          onClick={() => setLightboxOpen(true)}
          role="button"
          tabIndex={0}
          aria-label={`เปิด${post.kind === "video" ? "วิดีโอ" : "รูปภาพ"} ${post.title} แบบเต็มจอ`}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setLightboxOpen(true);
            }
          }}
        >
          {post.kind === "video" ? (
            <video
              ref={videoRef}
              src={post.media}
              muted={muted}
              loop
              playsInline
              controls
              preload="metadata"
              aria-label={post.title}
              onPlaying={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onWaiting={() => setPlaying(false)}
              onSeeking={() => setPlaying(false)}
              onEnded={() => setPlaying(false)}
              onError={() => setPlaying(false)}
            />
          ) : (
            <img
              src={post.media}
              alt={`${post.title} — ${post.caption}`}
              loading="lazy"
              onLoad={() => setImageReady(true)}
              onError={() => setImageReady(false)}
            />
          )}
        </div>
        <FullscreenMediaButton
          label={post.kind === "video" ? "วิดีโอ" : "รูปภาพ"}
          onClick={() => setLightboxOpen(true)}
        />
        <div className="short-post__shade" aria-hidden="true" />
        <div className="short-post__topline">
          <span className="short-post__number">
            {isPrivate ? "ส่วนตัว" : isPublic ? "ชุมชน" : "ขิงขิง"} <i />{" "}
            {String(index + 1).padStart(2, "0")}
          </span>
          <span
            className={`short-post__kind ${isPrivate ? "short-post__kind--private" : isPublic ? "short-post__kind--public" : ""}`}
          >
            {isPrivate
              ? "เฉพาะเบราว์เซอร์นี้"
              : isPublic
                ? "สาธารณะ"
                : post.kind === "video"
                  ? "วิดีโอตัวอย่าง"
                  : "ภาพตัวอย่าง"}
          </span>
        </div>
        {isPublic ? (
          <div
            className="short-post-views"
            title="จำนวนครั้งที่ดูโพสต์อย่างน้อย 2 วินาที ไม่ใช่จำนวนคนไม่ซ้ำ"
          >
            <Eye size={14} aria-hidden="true" />
            <span>
              {post.viewCount === undefined
                ? "—"
                : post.viewCount.toLocaleString("th-TH")}{" "}
              วิว
            </span>
            {viewState.error ? (
              <button
                type="button"
                disabled={viewState.busy}
                onClick={() => void viewState.retry()}
                aria-label="ลองบันทึกยอดวิวอีกครั้ง"
              >
                {viewState.busy ? "กำลังบันทึก…" : "ลองใหม่"}
              </button>
            ) : null}
          </div>
        ) : null}
        {post.kind === "video" ? (
          <button
            className="short-post__play-toggle"
            type="button"
            onClick={() => setPaused(value => !value)}
            aria-label={paused ? "เล่นวิดีโอ" : "หยุดวิดีโอชั่วคราว"}
          >
            {paused ? (
              <Play size={18} fill="currentColor" />
            ) : (
              <Pause size={18} fill="currentColor" />
            )}
          </button>
        ) : null}
        <div className="short-post__copy">
          <div className="short-post__creator">
            <button
              type="button"
              className="short-creator-profile"
              onClick={onOpenProfile}
              aria-label={`เปิดโปรไฟล์ ${creator.displayName}`}
            >
              <span className="short-avatar" aria-hidden="true">
                <span>{creatorInitial}</span>
                {creator.avatarUrl ? (
                  <img
                    src={creator.avatarUrl}
                    alt=""
                    loading="lazy"
                    onError={event => {
                      event.currentTarget.style.visibility = "hidden";
                    }}
                  />
                ) : null}
              </span>
            </button>
            <button
              type="button"
              className="short-creator-name"
              onClick={onOpenProfile}
            >
              {creator.displayName}
            </button>
            <span className="short-creator-dot">·</span>
            {isPrivate ? (
              <span className="short-private-pill">
                <LockKeyhole size={11} /> ส่วนตัว
              </span>
            ) : isPublic ? (
              <span className="short-public-pill">
                <Globe2Icon /> เปิดดูได้ทุกคน
              </span>
            ) : (
              <button type="button" className="short-follow" onClick={onFollow}>
                {followed ? "กำลังติดตาม" : "+ ติดตาม"}
              </button>
            )}
          </div>
          {post.recommendationReason ? (
            <p className="personal-feed-reason">{post.recommendationReason}</p>
          ) : null}
          <h2>{post.title}</h2>
          <p>{post.caption}</p>
          <div className="short-post__tags">
            {post.tags.map(tag => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
          <div className="short-post__audio">
            <span className="short-audio-disc">
              <Music2 size={14} />
            </span>
            <span>{post.audio}</span>
          </div>
        </div>
        <div
          className="short-action-rail"
          aria-label={
            isPrivate
              ? "การทำงานกับโพสต์ส่วนตัวบนอุปกรณ์นี้"
              : isPublic
                ? "การทำงานกับโพสต์สาธารณะ"
                : "การทำงานกับโพสต์ตัวอย่าง"
          }
        >
          <button
            type="button"
            className="short-action-rail__avatar"
            onClick={onOpenProfile}
            aria-label={`เปิดโปรไฟล์ ${creator.displayName}`}
          >
            <span
              className={`short-avatar short-avatar--large ${isPrivate ? "short-avatar--private" : ""}`}
            >
              <span>{creatorInitial}</span>
              {creator.avatarUrl ? (
                <img
                  src={creator.avatarUrl}
                  alt=""
                  loading="lazy"
                  onError={event => {
                    event.currentTarget.style.visibility = "hidden";
                  }}
                />
              ) : null}
            </span>
            {isPrivate ? (
              <span className="short-avatar-lock">
                <LockKeyhole size={10} />
              </span>
            ) : isPublic ? (
              <span className="short-avatar-plus">
                <Globe2Icon />
              </span>
            ) : (
              <span className="short-avatar-plus">+</span>
            )}
          </button>
          <button
            type="button"
            className={`short-action ${liked ? "is-liked" : ""}`}
            onClick={onLike}
            aria-pressed={liked}
            aria-label={liked ? "เลิกกดใจ" : "กดใจ"}
          >
            <span className="short-action__icon">
              <Heart size={25} fill={liked ? "currentColor" : "none"} />
            </span>
            <span>{liked ? "1" : "0"}</span>
          </button>
          {!isPrivate ? (
            <button
              type="button"
              className="short-action short-action--comments"
              onClick={onShowComments}
              aria-haspopup="dialog"
              aria-expanded={commentsOpen}
              aria-controls={commentsOpen ? "comments-panel" : undefined}
              aria-label={`ดูความคิดเห็นของ ${post.title}`}
            >
              <span className="short-action__icon">
                <MessageCircle size={22} />
              </span>
              <span>
                {commentCount === undefined
                  ? "ความคิดเห็น"
                  : commentCount.toLocaleString("th-TH")}
              </span>
            </button>
          ) : null}
          <button
            type="button"
            className={`short-action ${saved ? "is-saved" : ""}`}
            onClick={onSave}
            aria-pressed={saved}
            aria-label={saved ? "นำออกจากบันทึก" : "บันทึกโพสต์"}
          >
            <span className="short-action__icon">
              <Bookmark size={23} fill={saved ? "currentColor" : "none"} />
            </span>
            <span>{saved ? "เก็บแล้ว" : "บันทึก"}</span>
          </button>
          {!isPrivate ? (
            <button
              type="button"
              className="short-action"
              onClick={onShare}
              aria-label={isPublic ? "แชร์โพสต์สาธารณะ" : "แชร์โพสต์ตัวอย่าง"}
            >
              <span className="short-action__icon">
                <Share2 size={22} />
              </span>
              <span>แชร์</span>
            </button>
          ) : null}
          {isPublic ? (
            <button
              type="button"
              className="short-action"
              onClick={() => onSignal("not-interested")}
              aria-label="ไม่สนใจโพสต์นี้"
            >
              <span className="short-action__icon">
                <ThumbsDown size={20} />
              </span>
              <span>ไม่สนใจ</span>
            </button>
          ) : null}
          {canDelete ? (
            <button
              type="button"
              className="short-action short-action--danger"
              onClick={onDelete}
              disabled={deleting}
              aria-label="ลบโพสต์สาธารณะของฉัน"
            >
              <span className="short-action__icon">
                {deleting ? (
                  <RefreshCw size={19} className="spin" />
                ) : (
                  <Trash2 size={19} />
                )}
              </span>
              <span>{deleting ? "กำลังลบ" : "ลบ"}</span>
            </button>
          ) : null}
          {post.kind === "video" ? (
            <button
              type="button"
              className="short-action short-action--sound"
              onClick={() => setMuted(value => !value)}
              aria-label={muted ? "เปิดเสียงวิดีโอ" : "ปิดเสียงวิดีโอ"}
            >
              <span className="short-action__icon">
                {muted ? <VolumeX size={19} /> : <Volume2 size={19} />}
              </span>
              <span>{muted ? "เสียงปิด" : "เสียงเปิด"}</span>
            </button>
          ) : null}
        </div>
      </div>
      <MediaLightbox
        open={lightboxOpen}
        src={post.media}
        kind={post.kind}
        title={post.title}
        onClose={() => setLightboxOpen(false)}
      />
    </article>
  );
}

function Globe2Icon() {
  return (
    <span className="public-action-globe" aria-hidden="true">
      ◎
    </span>
  );
}

interface ShortVideoFeedProps {
  viewerId?: number | null;
  authLoading?: boolean;
  likedIds: Set<string>;
  savedIds: Set<string>;
  followed: boolean;
  statsOpen: boolean;
  onStatsChange: (open: boolean) => void;
  onLike: (id: string) => void;
  onSave: (id: string) => void;
  onFollow: () => void;
  onOpenOwnProfile: () => void;
  onOpenChat?: (target: ChatTarget) => void;
  notificationTarget?: {
    mediaId: string;
    rootId: number;
    commentId: number;
  } | null;
  onNotificationHandled?: () => void;
}

export default function ShortVideoFeed({
  viewerId = null,
  authLoading = false,
  likedIds,
  savedIds,
  followed,
  statsOpen,
  onStatsChange,
  onLike,
  onSave,
  onFollow,
  onOpenOwnProfile,
  onOpenChat,
  notificationTarget,
  onNotificationHandled,
}: ShortVideoFeedProps) {
  const personal = usePersonalFeed(viewerId, authLoading);
  const personalRef = useRef(personal);
  personalRef.current = personal;
  const publicItemsRef = useRef<PublicMediaSummary[]>([]);
  const [pageRevision, setPageRevision] = useState(0);
  const [documentVisible, setDocumentVisible] = useState(true);
  const [filter, setFilter] = useState<FeedFilter>("all");
  const [viewSession] = useState(() => new MediaViewSession());
  const [viewCounts, setViewCounts] = useState<Record<string, number>>({});
  const [announcement, setAnnouncement] = useState("");
  const [localPosts, setLocalPosts] = useState<FeedPost[]>([]);
  const [publicPosts, setPublicPosts] = useState<FeedPost[]>([]);
  const identity = viewerId ? `account-${viewerId}` : "guest";
  const [rankingIdentity, setRankingIdentity] = useState<string | null>(null);
  const [deepLinkedPost, setDeepLinkedPost] = useState<FeedPost | null>(null);
  const [ownedTokens, setOwnedTokens] = useState<Record<string, string>>({});
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingPublic, setLoadingPublic] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [publicFeedError, setPublicFeedError] = useState("");
  const [privateFeedError, setPrivateFeedError] = useState("");
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>(
    {}
  );
  const [notificationRoot, setNotificationRoot] = useState<
    number | undefined
  >();
  const [commentsPost, setCommentsPost] = useState<FeedPost | null>(null);
  const [activeProfile, setActiveProfile] = useState<FeedCreatorProfile | null>(
    null
  );
  const [accountProfilePosts, setAccountProfilePosts] = useState<FeedPost[]>(
    []
  );
  const [accountProfileCursor, setAccountProfileCursor] = useState<
    string | null
  >(null);
  const [accountProfileLoading, setAccountProfileLoading] = useState(false);
  const [accountProfileLoadingMore, setAccountProfileLoadingMore] =
    useState(false);
  const [accountProfileError, setAccountProfileError] = useState("");
  const [accountProfileErrorCursor, setAccountProfileErrorCursor] = useState<
    string | null | undefined
  >(undefined);
  const accountProfileRequestRef = useRef(0);
  const closeComments = useCallback(() => setCommentsPost(null), []);
  const scrollRef = useRef<HTMLDivElement>(null);
  const swipe = useFeedSwipe(
    scrollRef,
    statsOpen || !!commentsPost || !!activeProfile
  );
  const pageRequestRef = useRef(0);
  const loadMoreBusyRef = useRef(false);
  const tablePostRef = useRef<string | null>(null);
  const statsReturnScrollRef = useRef(0);
  const previousStatsRef = useRef(statsOpen);
  const timerRef = useRef<number | null>(null);
  const profileReturnRef = useRef<{
    scrollTop: number;
    targetId?: string;
    focusClass: string;
  } | null>(null);
  const safePublicPosts = selectIdentityPosts(
    publicPosts,
    publicItemsRef.current.map(item => makePublicPost(item)),
    rankingIdentity,
    identity,
    personal.ready
  );
  const basePosts = [...safePublicPosts, ...localPosts, ...demoPosts];
  const rawPosts =
    deepLinkedPost && !basePosts.some(post => post.id === deepLinkedPost.id)
      ? [deepLinkedPost, ...basePosts]
      : basePosts;
  const allPosts = rawPosts.map(post => ({
    ...post,
    viewCount:
      viewCounts[post.id] === undefined
        ? post.viewCount
        : Math.max(post.viewCount ?? 0, viewCounts[post.id]),
  }));
  const visiblePosts = allPosts.filter(
    post => filter === "all" || post.kind === filter
  );

  useEffect(() => {
    const root = scrollRef.current;
    if (!root || statsOpen || activeProfile) return;
    const update = () => {
      if (root.clientHeight > 0)
        root.style.setProperty("--feed-post-height", `${root.clientHeight}px`);
    };
    update();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", update);
      return () => window.removeEventListener("resize", update);
    }
    const observer = new ResizeObserver(update);
    observer.observe(root);
    return () => observer.disconnect();
  }, [statsOpen, activeProfile, filter]);
  const appendAnchorRef = useRef<{ id: string; offset: number } | null>(null);
  useLayoutEffect(() => {
    const anchor = appendAnchorRef.current,
      root = scrollRef.current;
    if (!anchor || !root) return;
    appendAnchorRef.current = null;
    const node = document.getElementById(anchor.id);
    if (node && root.contains(node))
      root.scrollTop +=
        node.getBoundingClientRect().top -
        root.getBoundingClientRect().top -
        anchor.offset;
  }, [publicPosts]);

  useEffect(() => {
    const listener = () =>
      setDocumentVisible(document.visibilityState === "visible");
    listener();
    document.addEventListener("visibilitychange", listener);
    return () => document.removeEventListener("visibilitychange", listener);
  }, []);

  // Ranking is applied on load/refresh, never when a signal changes while scrolling.
  useEffect(() => {
    if (!personal.ready) return;
    const prefs = personal.enabled
      ? personal.preferences
      : emptyFeedPreferences();
    const ranked = personal.enabled
      ? rankPersonalFeed(publicItemsRef.current, prefs)
      : [...publicItemsRef.current];
    setPublicPosts(
      ranked.map(item => ({
        ...makePublicPost(item),
        recommendationReason: personal.enabled
          ? personalFeedReason(item, prefs)
          : "โพสต์ล่าสุด · ไม่ปรับตามความชอบ",
      }))
    );
    setRankingIdentity(identity);
  }, [personal.ready, personal.enabled, viewerId, pageRevision]);

  function recordPreference(post: FeedPost, action: FeedAction) {
    if (post.publicSummary)
      personalRef.current.record(post.publicSummary, action);
    if (action === "not-interested") {
      announce(
        personalRef.current.enabled
          ? "บันทึกว่าไม่สนใจแล้ว · รีเฟรชเพื่อปรับคำแนะนำ"
          : "ข้ามโพสต์แล้ว · การเรียนรู้ความชอบปิดอยู่"
      );
      swipe.move(1);
    }
  }

  useEffect(() => {
    let active = true;
    const objectUrls: string[] = [];
    setOwnedTokens(getOwnedPublicTokens());

    getAllLocalMedia()
      .then(records => {
        const privateItems = records.map(record => {
          const post = makePrivatePost(record);
          objectUrls.push(post.media);
          return post;
        });
        if (!active) {
          objectUrls.forEach(url => URL.revokeObjectURL(url));
          return;
        }
        setLocalPosts(privateItems);
      })
      .catch(() => {
        if (active)
          setPrivateFeedError(
            "เปิดคลังส่วนตัวเดิมไม่สำเร็จ แต่ยังดูโพสต์สาธารณะได้"
          );
      });

    const request = ++pageRequestRef.current;
    fetchPublicMediaPage(null, PAGE_SIZE)
      .then(page => {
        if (!active || request !== pageRequestRef.current) return;
        publicItemsRef.current = page.items;
        setPublicPosts(page.items.map(item => makePublicPost(item)));
        setPageRevision(v => v + 1);
        setNextCursor(page.nextCursor);
        setPublicFeedError("");
      })
      .catch((cause: unknown) => {
        if (active && request === pageRequestRef.current)
          setPublicFeedError(
            cause instanceof Error ? cause.message : "เปิดฟีดสาธารณะไม่สำเร็จ"
          );
      })
      .finally(() => {
        if (active && request === pageRequestRef.current)
          setLoadingPublic(false);
      });

    return () => {
      active = false;
      pageRequestRef.current += 1;
      objectUrls.forEach(url => URL.revokeObjectURL(url));
    };
  }, []);

  useEffect(() => {
    if (!notificationTarget) return;
    let active = true;
    accountProfileRequestRef.current += 1;
    setFilter("all");
    setActiveProfile(null);
    void fetchPublicMediaItem(notificationTarget.mediaId)
      .then(item => {
        if (!active) return;
        const post = makePublicPost(item);
        tablePostRef.current = `feed-${post.id}`;
        setDeepLinkedPost(post);
        setCommentsPost(post);
        setNotificationRoot(notificationTarget.rootId);
        onNotificationHandled?.();
      })
      .catch(cause => {
        if (active) {
          setPublicFeedError(
            cause instanceof Error
              ? cause.message
              : "เปิดโพสต์จากแจ้งเตือนไม่สำเร็จ"
          );
          onNotificationHandled?.();
        }
      });
    return () => {
      active = false;
    };
  }, [notificationTarget]);

  useLayoutEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [filter]);

  useLayoutEffect(() => {
    if (statsOpen) {
      setCommentsPost(null);
      accountProfileRequestRef.current += 1;
      setActiveProfile(null);
      profileReturnRef.current = null;
    }
    if (!statsOpen && previousStatsRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = statsReturnScrollRef.current;
    }
    previousStatsRef.current = statsOpen;
  }, [statsOpen]);

  useLayoutEffect(() => {
    if (statsOpen || !tablePostRef.current) return;
    const target = document.getElementById(tablePostRef.current);
    if (!target || !scrollRef.current?.contains(target)) return;
    scrollRef.current.scrollTop =
      target.getBoundingClientRect().top -
      scrollRef.current.getBoundingClientRect().top +
      scrollRef.current.scrollTop;
    target
      .querySelector<HTMLElement>(".short-creator-name")
      ?.focus({ preventScroll: true });
    tablePostRef.current = null;
  }, [statsOpen, filter, visiblePosts.length, deepLinkedPost]);

  useEffect(() => {
    let active = true;
    let requestVersion = 0;
    const loadSharedPost = () => {
      const match = /^#feed-public-([a-f0-9]{32})$/.exec(window.location.hash);
      const version = ++requestVersion;
      if (!match) {
        setDeepLinkedPost(null);
        return;
      }
      void fetchPublicMediaItem(match[1])
        .then(item => {
          if (active && version === requestVersion)
            setDeepLinkedPost(makePublicPost(item));
        })
        .catch((cause: unknown) => {
          if (active && version === requestVersion) {
            setDeepLinkedPost(null);
            setPublicFeedError(
              cause instanceof Error
                ? cause.message
                : "เปิดโพสต์จากลิงก์ไม่สำเร็จ"
            );
          }
        });
    };
    loadSharedPost();
    window.addEventListener("hashchange", loadSharedPost);
    return () => {
      active = false;
      window.removeEventListener("hashchange", loadSharedPost);
    };
  }, []);

  useEffect(() => {
    if (statsOpen) return;
    const targetId = window.location.hash.slice(1);
    if (!targetId.startsWith("feed-")) return;
    const frame = window.requestAnimationFrame(() => {
      const target = document.getElementById(targetId);
      if (target && scrollRef.current?.contains(target)) {
        target.scrollIntoView({
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? "auto"
            : "smooth",
          block: "start",
        });
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [visiblePosts.length, deepLinkedPost]);

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    []
  );

  useLayoutEffect(() => {
    const saved = profileReturnRef.current;
    const scroll = scrollRef.current;
    if (activeProfile || !saved || !scroll) return;
    profileReturnRef.current = null;
    const target = saved.targetId
      ? document.getElementById(saved.targetId)
      : null;
    if (target && scroll.contains(target)) {
      scroll.scrollTop =
        target.getBoundingClientRect().top -
        scroll.getBoundingClientRect().top +
        scroll.scrollTop;
      target
        .querySelector<HTMLElement>(saved.focusClass)
        ?.focus({ preventScroll: true });
    } else {
      scroll.scrollTop = saved.scrollTop;
      scroll
        .querySelector<HTMLElement>(saved.focusClass)
        ?.focus({ preventScroll: true });
    }
  }, [activeProfile]);

  function announce(message: string) {
    setAnnouncement(message);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setAnnouncement(""), 2600);
  }

  async function loadAccountCreatorProfile(
    requestedProfile: FeedCreatorProfile,
    cursor: string | null = null,
    append = false
  ) {
    const request = ++accountProfileRequestRef.current;
    setAccountProfileError("");
    setAccountProfileErrorCursor(undefined);
    if (append) {
      setAccountProfileLoadingMore(true);
    } else {
      setAccountProfileLoading(true);
      setAccountProfilePosts([]);
      setAccountProfileCursor(null);
    }

    try {
      const [creator, page] = await Promise.all([
        fetchPublicMediaCreator(requestedProfile.id),
        fetchCreatorMediaPage(requestedProfile.id, cursor, PAGE_SIZE),
      ]);
      if (creator.id !== requestedProfile.id)
        throw new Error("ข้อมูลบัญชีครีเอเตอร์ไม่ตรงกับคำขอ");
      if (request !== accountProfileRequestRef.current) return;

      const publicProfile = feedCreatorFromPublicCreator(creator);
      setActiveProfile(publicProfile);
      const newPosts = page.items.map(item =>
        makePublicPost(item, publicProfile)
      );
      setAccountProfilePosts(current => {
        if (!append) return newPosts;
        const knownIds = new Set(current.map(post => post.id));
        return [...current, ...newPosts.filter(post => !knownIds.has(post.id))];
      });
      setAccountProfileCursor(page.nextCursor);
    } catch (cause) {
      if (request === accountProfileRequestRef.current) {
        setAccountProfileError(
          cause instanceof Error
            ? cause.message
            : "เปิดโปรไฟล์ครีเอเตอร์สาธารณะไม่สำเร็จ"
        );
        setAccountProfileErrorCursor(cursor);
      }
    } finally {
      if (request === accountProfileRequestRef.current) {
        setAccountProfileLoading(false);
        setAccountProfileLoadingMore(false);
      }
    }
  }

  function closeCreatorProfile() {
    accountProfileRequestRef.current += 1;
    setAccountProfileLoading(false);
    setAccountProfileLoadingMore(false);
    setActiveProfile(null);
  }

  function openCreatorProfile(creator: FeedCreatorProfile, postId: string) {
    if (creator.kind === "local") {
      onOpenOwnProfile();
      return;
    }
    const focusTarget =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : undefined;
    profileReturnRef.current = {
      scrollTop: scrollRef.current?.scrollTop ?? 0,
      targetId: `feed-${postId}`,
      focusClass: focusTarget?.classList.contains("short-action-rail__avatar")
        ? ".short-action-rail__avatar"
        : focusTarget?.classList.contains("short-creator-profile")
          ? ".short-creator-profile"
          : ".short-creator-name",
    };
    setCommentsPost(null);
    accountProfileRequestRef.current += 1;
    setAccountProfilePosts([]);
    setAccountProfileCursor(null);
    setAccountProfileError("");
    setAccountProfileErrorCursor(undefined);
    setAccountProfileLoading(false);
    setAccountProfileLoadingMore(false);
    setActiveProfile(creator);
    if (creator.kind === "account") void loadAccountCreatorProfile(creator);
  }

  function openProfilePost(id: string) {
    if (!activeProfile) return;
    const sourcePosts =
      activeProfile.kind === "account"
        ? accountProfilePosts.map(post => ({
            ...post,
            viewCount:
              viewCounts[post.id] === undefined
                ? post.viewCount
                : Math.max(post.viewCount ?? 0, viewCounts[post.id]),
          }))
        : allPosts;
    const selected = selectFeedProfilePosts(activeProfile, sourcePosts).some(
      post => post.id === id
    );
    const openedPost = sourcePosts.find(post => post.id === id);
    if (!selected || !openedPost) return;
    profileReturnRef.current = {
      scrollTop: profileReturnRef.current?.scrollTop ?? 0,
      targetId: `feed-${id}`,
      focusClass: ".short-creator-name",
    };
    if (
      activeProfile.kind === "account" &&
      !allPosts.some(post => post.id === openedPost.id)
    )
      setDeepLinkedPost(openedPost);
    accountProfileRequestRef.current += 1;
    setFilter("all");
    setActiveProfile(null);
  }

  async function refreshPublicFeed() {
    const request = ++pageRequestRef.current;
    setLoadingPublic(true);
    setPublicFeedError("");
    try {
      const page = await fetchPublicMediaPage(null, PAGE_SIZE);
      if (request !== pageRequestRef.current) return;
      scrollRef.current?.scrollTo({ top: 0 });
      publicItemsRef.current = page.items;
      setPublicPosts(page.items.map(item => makePublicPost(item)));
      setPageRevision(v => v + 1);
      setNextCursor(page.nextCursor);
      setOwnedTokens(getOwnedPublicTokens());
      announce("รีเฟรชฟีดสาธารณะแล้ว");
    } catch (cause) {
      if (request !== pageRequestRef.current) return;
      setPublicFeedError(
        cause instanceof Error ? cause.message : "รีเฟรชฟีดไม่สำเร็จ"
      );
    } finally {
      setLoadingPublic(false);
    }
  }

  async function loadMorePublicFeed() {
    if (!nextCursor || loadMoreBusyRef.current) return;
    const request = pageRequestRef.current;
    loadMoreBusyRef.current = true;
    setLoadingMore(true);
    setPublicFeedError("");
    try {
      const page = await fetchPublicMediaPage(nextCursor, PAGE_SIZE);
      if (request !== pageRequestRef.current) return;
      const root = scrollRef.current;
      if (root) {
        const top = root.getBoundingClientRect().top;
        const nearest = [
          ...root.querySelectorAll<HTMLElement>(".short-post"),
        ].sort(
          (a, b) =>
            Math.abs(a.getBoundingClientRect().top - top) -
            Math.abs(b.getBoundingClientRect().top - top)
        )[0];
        if (nearest)
          appendAnchorRef.current = {
            id: nearest.id,
            offset: nearest.getBoundingClientRect().top - top,
          };
      }
      const canPersonalize =
        personalRef.current.ready && personalRef.current.enabled;
      const prefs = canPersonalize
        ? personalRef.current.preferences
        : emptyFeedPreferences();
      const newItems = canPersonalize
        ? rankPersonalFeed(page.items, prefs)
        : page.items;
      const newPosts = newItems.map(item => ({
        ...makePublicPost(item),
        recommendationReason: canPersonalize
          ? personalFeedReason(item, prefs)
          : "โพสต์ล่าสุด",
      }));
      const existingItems = new Set(
        publicItemsRef.current.map(item => item.id)
      );
      publicItemsRef.current = [
        ...publicItemsRef.current,
        ...page.items.filter(item => !existingItems.has(item.id)),
      ];
      setPublicPosts(current => {
        const knownIds = new Set(current.map(post => post.id));
        return [...current, ...newPosts.filter(post => !knownIds.has(post.id))];
      });
      setNextCursor(page.nextCursor);
    } catch (cause) {
      if (request !== pageRequestRef.current) return;
      setPublicFeedError(
        cause instanceof Error ? cause.message : "โหลดโพสต์เพิ่มไม่สำเร็จ"
      );
    } finally {
      loadMoreBusyRef.current = false;
      setLoadingMore(false);
    }
  }

  async function deletePost(post: FeedPost) {
    if (!post.publicMediaId) return;
    const token = ownedTokens[post.publicMediaId];
    if (
      (!token && !post.accountOwned) ||
      !window.confirm(
        `ลบ “${post.title}” จากฟีดสาธารณะหรือไม่? แถวและไฟล์ในฐานข้อมูลปัจจุบันจะถูกลบ; สำเนาใน backup/binlog อาจคงอยู่ตามนโยบายฐานข้อมูล`
      )
    )
      return;
    setDeletingId(post.id);
    try {
      await deletePublicMedia(post.publicMediaId, token ?? "");
      publicItemsRef.current = publicItemsRef.current.filter(
        item => item.id !== post.publicMediaId
      );
      forgetOwnedPublicToken(post.publicMediaId);
      setOwnedTokens(getOwnedPublicTokens());
      setPublicPosts(current => current.filter(item => item.id !== post.id));
      setDeepLinkedPost(current => (current?.id === post.id ? null : current));
      announce("ลบโพสต์และแถวไฟล์ออกจากฐานข้อมูลปัจจุบันแล้ว");
    } catch (cause) {
      announce(
        cause instanceof Error ? cause.message : "ลบโพสต์ไม่สำเร็จ ลองอีกครั้ง"
      );
    } finally {
      setDeletingId(null);
    }
  }

  async function sharePost(post: FeedPost) {
    if (post.visibility === "private") return;
    const url = `${window.location.origin}/#feed-${post.id}`;
    const label =
      post.visibility === "public" ? "โพสต์สาธารณะ" : "โพสต์ตัวอย่าง";
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({
          title: `${post.title} · ขิงขิง`,
          text: `${label} · ${post.caption}`,
          url,
        });
        announce("พร้อมแชร์โพสต์แล้ว");
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        announce("คัดลอกลิงก์โพสต์แล้ว");
      } else {
        announce("ใช้เมนูแชร์ของเบราว์เซอร์เพื่อแชร์โพสต์นี้");
      }
    } catch {
      announce("ยกเลิกการแชร์โพสต์แล้ว");
    }
  }

  if (activeProfile) {
    const profileSourcePosts =
      activeProfile.kind === "account"
        ? accountProfilePosts.map(post => ({
            ...post,
            viewCount:
              viewCounts[post.id] === undefined
                ? post.viewCount
                : Math.max(post.viewCount ?? 0, viewCounts[post.id]),
          }))
        : allPosts;
    const profilePosts = selectFeedProfilePosts(
      activeProfile,
      profileSourcePosts
    );
    return (
      <FeedProfilePreview
        profile={activeProfile}
        posts={profilePosts}
        onBack={closeCreatorProfile}
        onOpenPost={openProfilePost}
        loading={activeProfile.kind === "account" && accountProfileLoading}
        loadingMore={accountProfileLoadingMore}
        error={activeProfile.kind === "account" ? accountProfileError : ""}
        hasMore={
          activeProfile.kind === "account" && accountProfileCursor !== null
        }
        onRetry={() => {
          if (activeProfile.kind !== "account") return;
          const cursor = accountProfileErrorCursor ?? null;
          void loadAccountCreatorProfile(
            activeProfile,
            cursor,
            typeof cursor === "string"
          );
        }}
        onLoadMore={() => {
          if (activeProfile.kind === "account" && accountProfileCursor)
            void loadAccountCreatorProfile(
              activeProfile,
              accountProfileCursor,
              true
            );
        }}
      />
    );
  }

  return (
    <section
      className={`short-feed-page ${statsOpen ? "short-feed-page--stats" : ""}`}
      id="feed"
      aria-label="ฟีดผลงานขิงขิง"
    >
      <header className="feed-toolbar">
        <a
          className="feed-mobile-brand"
          href="#feed"
          onClick={event => {
            event.preventDefault();
            onStatsChange(false);
            setFilter("all");
          }}
          aria-label="ขิงขิง ฟีดคลิป"
        >
          <span className="brand-mark" aria-hidden="true">
            <span />
          </span>
          <span className="brand-name">ขิงขิง</span>
        </a>
        <div
          className="feed-filter-list"
          role="tablist"
          aria-label="เลือกฟีดหรือขิงขิงจัดอันดับโปรไฟล์"
        >
          {filters.map(item => (
            <span className="feed-tab-pair" role="presentation" key={item.id}>
              <button
                id={`feed-tab-${item.id}`}
                type="button"
                role="tab"
                aria-controls="feed-posts-panel"
                aria-selected={!statsOpen && filter === item.id}
                className={!statsOpen && filter === item.id ? "is-active" : ""}
                onClick={() => {
                  onStatsChange(false);
                  setFilter(item.id);
                }}
              >
                {item.label}
              </button>
              {item.id === "all" ? (
                <button
                  id="feed-tab-khingkhing"
                  type="button"
                  role="tab"
                  aria-controls="feed-stats-panel"
                  aria-selected={statsOpen}
                  className={statsOpen ? "is-active" : ""}
                  onClick={() => onStatsChange(true)}
                >
                  ขิงขิง
                </button>
              ) : null}
            </span>
          ))}
        </div>
        {!statsOpen ? (
          <button
            type="button"
            className="feed-refresh"
            onClick={() => void refreshPublicFeed()}
            disabled={loadingPublic}
            aria-label="รีเฟรชโพสต์สาธารณะ"
          >
            <RefreshCw size={14} />
            รีเฟรช
          </button>
        ) : null}
        {!statsOpen ? (
          <span className="feed-toolbar__hint">
            <span className="feed-live-dot" /> สไลด์ขึ้น · ดูรูปหรือคลิปถัดไป
          </span>
        ) : null}
      </header>
      {!statsOpen && filter === "all" ? (
        <div className="personal-feed-settings" data-manus-no-record="true">
          <span title="จัดอันดับจากโพสต์ที่โหลด โดยใช้ใจ บันทึก ดูนาน ข้ามเร็วและไม่สนใจ">
            {personal.status}
          </span>
          <button
            type="button"
            aria-pressed={personal.enabled}
            onClick={() => personal.setEnabled(!personal.enabled)}
          >
            {personal.enabled ? "ปรับตามความชอบ: เปิด" : "ปรับตามความชอบ: ปิด"}
          </button>
          {personal.error ? (
            <button
              type="button"
              disabled={personal.busy}
              onClick={() => void personal.retry()}
            >
              {personal.error}
            </button>
          ) : null}
        </div>
      ) : null}
      {statsOpen ? (
        <div
          className="feed-stats-panel"
          id="feed-stats-panel"
          role="tabpanel"
          aria-labelledby="feed-tab-khingkhing"
        >
          <KhingArena
            likedIds={likedIds}
            savedIds={savedIds}
            onOpenChat={onOpenChat}
            onOpenPost={id => {
              tablePostRef.current = `feed-public-${id}`;
              setFilter("all");
              onStatsChange(false);
              window.location.hash = `feed-public-${id}`;
            }}
          />
        </div>
      ) : null}
      {!statsOpen && publicFeedError ? (
        <div className="feed-private-notice feed-public-notice" role="status">
          <span>{publicFeedError}</span>
          <button type="button" onClick={() => void refreshPublicFeed()}>
            ลองใหม่
          </button>
        </div>
      ) : null}
      {!statsOpen && privateFeedError ? (
        <p className="feed-private-notice" role="status">
          {privateFeedError}
        </p>
      ) : null}
      <div
        className="feed-scroll feed-scroll--swipe"
        tabIndex={0}
        aria-label="สไลด์ขึ้นดูโพสต์ถัดไป สไลด์ลงย้อนกลับ หรือใช้ปุ่มลูกศร"
        {...swipe.handlers}
        ref={scrollRef}
        id="feed-posts-panel"
        role="tabpanel"
        aria-labelledby={`feed-tab-${filter}`}
        hidden={statsOpen}
        onScroll={event => {
          if (!statsOpen)
            statsReturnScrollRef.current = event.currentTarget.scrollTop;
          const root = event.currentTarget;
          if (
            !statsOpen &&
            !commentsPost &&
            !publicFeedError &&
            nextCursor &&
            root.scrollTop > 0 &&
            root.scrollHeight - root.scrollTop - root.clientHeight <
              root.clientHeight * 2
          )
            void loadMorePublicFeed();
        }}
      >
        {visiblePosts.map((post, index) => (
          <FeedPostCard
            key={post.id}
            post={post}
            index={index}
            liked={likedIds.has(post.id)}
            saved={savedIds.has(post.id)}
            followed={followed}
            canDelete={Boolean(
              post.publicMediaId &&
                (post.accountOwned || ownedTokens[post.publicMediaId])
            )}
            deleting={deletingId === post.id}
            commentCount={commentCounts[post.id]}
            commentsOpen={commentsPost?.id === post.id}
            feedActive={!statsOpen && !commentsPost && documentVisible}
            viewSession={viewSession}
            onViewCount={count =>
              setViewCounts(current => ({
                ...current,
                [post.id]: Math.max(current[post.id] ?? 0, count),
              }))
            }
            onSignal={action => recordPreference(post, action)}
            onLike={() => {
              recordPreference(post, likedIds.has(post.id) ? "unlike" : "like");
              onLike(post.id);
            }}
            onSave={() => {
              recordPreference(post, savedIds.has(post.id) ? "unsave" : "save");
              onSave(post.id);
            }}
            onShowComments={() => {
              setNotificationRoot(undefined);
              setCommentsPost(post);
            }}
            onOpenProfile={() => openCreatorProfile(post.creator, post.id)}
            onShare={() => void sharePost(post)}
            onFollow={onFollow}
            onDelete={() => void deletePost(post)}
          />
        ))}
        {visiblePosts.length === 0 ? (
          <p className="feed-empty">ยังไม่มีโพสต์ประเภทนี้</p>
        ) : null}
        {nextCursor ? (
          <div className="feed-more">
            <button
              type="button"
              disabled={loadingMore}
              onClick={() => void loadMorePublicFeed()}
            >
              {loadingMore ? "กำลังโหลด…" : "โหลดโพสต์สาธารณะเพิ่ม"}
            </button>
          </div>
        ) : null}
      </div>
      {!statsOpen && !commentsPost ? (
        <div className="feed-step-buttons" aria-label="เปลี่ยนโพสต์ทีละรายการ">
          <button
            type="button"
            onClick={() => swipe.move(-1)}
            aria-label="โพสต์ก่อนหน้า"
          >
            <ChevronUp size={20} />
          </button>
          <button
            type="button"
            onClick={() => swipe.move(1)}
            aria-label="โพสต์ถัดไป"
          >
            <ChevronDown size={20} />
          </button>
        </div>
      ) : null}
      {!statsOpen && commentsPost ? (
        <CommentsPanel
          key={commentsPost.id}
          post={commentsPost}
          initialRootId={notificationRoot}
          onClose={closeComments}
          onCount={total =>
            setCommentCounts(current => ({
              ...current,
              [commentsPost.id]: total,
            }))
          }
        />
      ) : null}
      {announcement ? (
        <div className="feed-toast" role="status">
          {announcement}
        </div>
      ) : null}
      <p className="visually-hidden" aria-live="polite">
        {announcement}
      </p>
    </section>
  );
}
