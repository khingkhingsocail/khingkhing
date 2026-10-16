import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownUp,
  BarChart3,
  Crown,
  Dumbbell,
  Globe2,
  Heart,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  TrendingUp,
  Trophy,
  Users,
  MessageCircle,
} from "lucide-react";
import type { ChatTarget } from "../../../../shared/chat";
import {
  arenaBoards,
  arenaCategories,
  type ArenaBoard,
  type ArenaCategory,
  type ArenaLeaderboard,
} from "../../../../shared/arena";
import {
  arenaCapabilities,
  fetchArenaBoards,
  fetchArenaLeaderboard,
} from "@/lib/arena";
import MediaStatsTable from "../MediaStatsTable";
import ArenaEntryForm from "./ArenaEntryForm";
import ArenaProfileDetails from "./ArenaProfileDetails";
import RankIdentity from "./RankIdentity";
import ReviewDesk from "./ReviewDesk";
import CelebrityReferences from "./CelebrityReferences";
import InvestmentReferences from "./InvestmentReferences";
import { reviewLabels } from "../../../../shared/verification";
import { RankingViewStatus, RankingViewCount } from "../RankingViewBadge";
import {
  useRankingViews,
  useRankingOpening,
} from "../../hooks/useRankingViews";
import {
  communityBoardTarget,
  rankingTargetId,
} from "../../../../shared/rankingViews";
import "./evidence.css";
import "./arena.css";

const icons = {
  sports: Dumbbell,
  stocks: TrendingUp,
  followers: Users,
  likes: Heart,
  world: Globe2,
};
const currentMonth = () =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
export default function KhingArena({
  likedIds,
  savedIds,
  onOpenPost,
  onOpenChat,
}: {
  likedIds: ReadonlySet<string>;
  savedIds: ReadonlySet<string>;
  onOpenPost: (id: string) => void;
  onOpenChat?: (target: ChatTarget) => void;
}) {
  const [category, setCategory] = useState<ArenaCategory>("sports");
  const [boards, setBoards] = useState<ArenaBoard[]>(arenaBoards);
  const [boardKey, setBoardKey] = useState(arenaBoards[0].key);
  const [period, setPeriod] = useState(currentMonth);
  const [verified, setVerified] = useState<"all" | "verified" | "ai-supported">(
    "all"
  );
  const [ascending, setAscending] = useState(false);
  const [query, setQuery] = useState("");
  const [data, setData] = useState<ArenaLeaderboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadedPeriod, setLoadedPeriod] = useState("");
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [detail, setDetail] = useState<{ id: string; rank?: number } | null>(
    null
  );
  const [editProfileId, setEditProfileId] = useState<string | undefined>(
    undefined
  );
  const [filesOpen, setFilesOpen] = useState(false);
  const [message, setMessage] = useState("");
  const focusReturnRef = useRef<string | null>(null);
  const ownIds = Object.keys(arenaCapabilities());
  const availableBoards = boards.filter(b => b.category === category);
  const activeBoard = boards.find(b => b.key === boardKey);

  const refreshBoards = useCallback(async () => {
    const result = await fetchArenaBoards();
    setBoards(result.boards);
    return result.boards;
  }, []);
  useEffect(() => {
    let active = true;
    fetchArenaBoards()
      .then(result => {
        if (active) setBoards(result.boards);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    setData(null);
    setError("");
    if (!boardKey) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchArenaLeaderboard(boardKey, period, verified)
      .then(result => {
        if (active) {
          setData(result);
          setLoadedPeriod(period);
        }
      })
      .catch(cause => {
        if (active)
          setError(
            cause instanceof Error ? cause.message : "โหลดอันดับไม่สำเร็จ"
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [boardKey, period, verified, revision]);

  const visible = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("th-TH");
    const ranked = (data?.items ?? []).filter(
      item =>
        !term ||
        `${item.profile.displayName} ${item.profile.handle}`
          .toLocaleLowerCase("th-TH")
          .includes(term)
    );
    return ascending
      ? ranked
          .slice()
          .sort(
            (a, b) => b.rank - a.rank || a.profileId.localeCompare(b.profileId)
          )
      : ranked;
  }, [data, ascending, query]);
  const leaders = data?.items.filter(item => item.rank <= 3).slice(0, 3) ?? [];
  const entryViews = useRankingViews(
    (data?.items ?? []).map(item => ({ kind: "community-entry", key: item.id }))
  );
  const boardTarget = communityBoardTarget(boardKey, period);
  const boardViews = useRankingOpening(
    boardKey ? boardTarget : null,
    !loading &&
      !error &&
      !!data &&
      data.board.key === boardKey &&
      loadedPeriod === period &&
      !detail,
    !detail
  );
  function selectCategory(next: ArenaCategory) {
    setCategory(next);
    setQuery("");
    setBoardKey(boards.find(b => b.category === next)?.key ?? "");
  }
  function openProfile(id: string, rank?: number) {
    focusReturnRef.current = id;
    const entry = data?.items.find(item => item.profileId === id);
    if (entry) entryViews.open({ kind: "community-entry", key: entry.id });
    setDetail({ id, rank });
    setFormOpen(false);
  }
  function returnToBoard() {
    setDetail(null);
    requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>(
          `[data-arena-profile="${focusReturnRef.current}"]`
        )
        ?.focus({ preventScroll: true });
    });
  }

  if (detail)
    return (
      <ArenaProfileDetails
        id={detail.id}
        rank={detail.rank}
        onBack={returnToBoard}
        onChat={
          onOpenChat ? () => onOpenChat({ profileId: detail.id }) : undefined
        }
        onEdit={() => {
          setEditProfileId(detail.id);
          setDetail(null);
          setFormOpen(true);
        }}
      />
    );

  return (
    <section className="khing-arena" aria-labelledby="arena-title">
      <header className="arena-hero">
        <div className="arena-hero__lines" aria-hidden="true" />
        <div className="arena-hero__top">
          <span>
            <Trophy size={14} /> KHING KHING ARENA
          </span>
          <span>YOUR STATS. YOUR STAGE.</span>
        </div>
        <h2 id="arena-title">
          ขิงให้สุด
          <br />
          <em>ขึ้นที่หนึ่งในทางของคุณ</em>
        </h2>
        <p>
          โชว์สถิติที่คุณภูมิใจ แข่งขันในหมวดที่คุณถนัด
          <br />
          โปรไฟล์ กรอบชื่อ และแรงค์ที่เล่าเรื่องผลงานของคุณ
        </p>
        <button
          type="button"
          className="arena-primary"
          onClick={() => {
            setEditProfileId(undefined);
            setFormOpen(true);
          }}
        >
          <Plus size={16} />
          สร้างโปรไฟล์ / ลงสถิติ
        </button>
        <span className="arena-hero__trophy" aria-hidden="true">
          <Trophy size={76} strokeWidth={1.2} />
          <i>#1</i>
        </span>
      </header>

      <nav className="arena-category-tabs" aria-label="หมวดหมู่แข่งขัน">
        {arenaCategories.map(item => {
          const Icon = icons[item.id];
          return (
            <button
              type="button"
              key={item.id}
              className={category === item.id ? "is-active" : ""}
              aria-pressed={category === item.id}
              onClick={() => selectCategory(item.id)}
            >
              <Icon size={17} />
              <span>
                {item.label}
                <small>{item.short}</small>
              </span>
            </button>
          );
        })}
      </nav>
      {category === "stocks" ? (
        <InvestmentReferences />
      ) : (
        <CelebrityReferences category={category} />
      )}
      {formOpen ? (
        <ArenaEntryForm
          key={editProfileId ?? "new-form"}
          boards={boards}
          defaultBoard={
            boardKey || (category === "world" ? "custom" : arenaBoards[0].key)
          }
          defaultPeriod={period}
          initialProfileId={editProfileId}
          onClose={() => setFormOpen(false)}
          onSaved={(key, month, evidenceCount) => {
            setFormOpen(false);
            setPeriod(month);
            setMessage(
              evidenceCount
                ? `บันทึกสถิติและหลักฐาน ${evidenceCount} ไฟล์แล้ว · หลักฐานไม่ขึ้นฟีด ส่ง AI ตรวจต่อได้จากโปรไฟล์`
                : "บันทึกโปรไฟล์และสถิติที่ผู้ใช้รายงานเองแล้ว"
            );
            void refreshBoards()
              .then(updated => {
                setCategory(
                  updated.find(b => b.key === key)?.category ?? category
                );
                setBoardKey(key);
                setRevision(v => v + 1);
              })
              .catch(() => {
                setBoardKey(key);
                setRevision(v => v + 1);
              });
          }}
        />
      ) : null}
      {message ? (
        <p className="arena-success" role="status">
          {message}
        </p>
      ) : null}

      <div className="arena-board-heading">
        <div>
          <p>LEADERBOARD · MONTHLY</p>
          <h3>อันดับโปรไฟล์</h3>
        </div>
        <button
          type="button"
          className="arena-secondary"
          disabled={loading}
          onClick={() => {
            setRevision(v => v + 1);
            void refreshBoards().catch(() => {});
          }}
        >
          <RefreshCw size={14} />
          รีเฟรช
        </button>
      </div>
      {!loading && !error && data ? (
        <RankingViewStatus target={boardTarget} state={boardViews} />
      ) : null}
      <p className="arena-fine-print">
        ยอดเปิดดูในขิงขิงเริ่มเก็บเมื่อเปิดระบบนี้ · เป็นจำนวนครั้ง
        ไม่ใช่จำนวนคนไม่ซ้ำ และไม่ส่งผลต่ออันดับ
      </p>
      {entryViews.error ? (
        <button
          type="button"
          className="arena-secondary"
          onClick={entryViews.retry}
        >
          ลองโหลดยอดเปิดดูโปรไฟล์ใหม่
        </button>
      ) : null}
      <div className="arena-board-controls">
        <label className="arena-field">
          รายการแข่งขัน
          <select value={boardKey} onChange={e => setBoardKey(e.target.value)}>
            {!availableBoards.length ? (
              <option value="">ยังไม่มีรายการ — สร้างรายการแรก</option>
            ) : (
              availableBoards.map(board => (
                <option value={board.key} key={board.key}>
                  {board.title} · {board.unit}
                </option>
              ))
            )}
          </select>
        </label>
        <label className="arena-field">
          เดือนแข่งขัน
          <input
            type="month"
            min="2000-01"
            max={currentMonth()}
            value={period}
            onChange={e => setPeriod(e.target.value)}
          />
        </label>
        <label className="arena-field">
          สถานะสถิติ
          <select
            value={verified}
            onChange={e =>
              setVerified(e.target.value as "all" | "verified" | "ai-supported")
            }
          >
            <option value="all">ทั้งหมด · รวมผู้ใช้รายงานเอง</option>
            <option value="ai-supported">AI พบหลักฐานสนับสนุน</option>
            <option value="verified">ผู้ดูแลรับรองแล้วเท่านั้น</option>
          </select>
        </label>
      </div>
      <p className="arena-note">
        <ShieldCheck size={15} />
        อันดับเฉพาะผู้เข้าร่วมในขิงขิง รายการและเดือนเดียวกัน ·{" "}
        {activeBoard?.direction === "lower"
          ? "ค่าน้อยดีกว่า"
          : "ค่ามากดีกว่า"}{" "}
        · คะแนนเท่ากันได้อันดับเดียวกัน
      </p>
      {onOpenChat ? (
        <div className="arena-chat-actions">
          <button
            type="button"
            className="arena-secondary"
            onClick={() => onOpenChat({ category, period })}
          >
            <MessageCircle size={16} />
            ห้องพูดคุยหมวด{" "}
            {arenaCategories.find(item => item.id === category)?.label}
          </button>
          {boardKey ? (
            <button
              type="button"
              className="arena-secondary"
              onClick={() => onOpenChat({ category, boardKey, period })}
            >
              <Users size={16} />
              ห้องรายการนี้ · {period}
            </button>
          ) : null}
          <small>เข้าสู่ระบบ ผูกโปรไฟล์และลงสถิติที่ตรง ก่อนเข้าร่วมแชท</small>
        </div>
      ) : null}
      <p className="arena-fine-print">
        ข้อมูลที่กรอกเองยังไม่ยืนยัน แม้แนบหลักฐาน · กรอบแรงค์ไม่ใช่ตรายืนยัน ·
        สถิติโลกที่นำมาโชว์ไม่ใช่การรับรองสถิติโลกอย่างเป็นทางการ
      </p>
      {error ? (
        <div className="arena-error" role="alert">
          {error}
          <button type="button" onClick={() => setRevision(v => v + 1)}>
            ลองใหม่
          </button>
        </div>
      ) : null}
      {loading ? (
        <p className="arena-loading" role="status">
          กำลังจัดอันดับ…
        </p>
      ) : null}

      {leaders.length && !query && !ascending ? (
        <div className="arena-podium" aria-label="ผู้เข้าร่วมอันดับต้น ๆ">
          {leaders.map(item => (
            <article
              key={item.id}
              className={`arena-podium__card arena-podium__card--${item.rank}`}
            >
              <span className="arena-podium__place">
                <Crown size={15} />
                อันดับ {item.rank}
              </span>
              <RankIdentity
                profile={item.profile}
                rank={item.rank}
                onClick={() => openProfile(item.profileId, item.rank)}
              />
              <strong>
                {new Intl.NumberFormat("th-TH", {
                  maximumFractionDigits: 6,
                }).format(item.value)}
                <small>{item.unit}</small>
              </strong>
              <span className="arena-verification">
                {item.verification === "verified"
                  ? "ผู้ดูแลรับรองแล้ว"
                  : reviewLabels[item.reviewStatus ?? "none"]}
              </span>
              <RankingViewCount
                total={entryViews.counts.get(
                  rankingTargetId({ kind: "community-entry", key: item.id })
                )}
              />
            </article>
          ))}
        </div>
      ) : null}
      <div className="arena-list-toolbar">
        <label>
          <Search size={15} />
          <input
            type="search"
            aria-label="ค้นชื่อผู้แข่งขัน"
            maxLength={60}
            placeholder="ค้นชื่อหรือ @ผู้แข่งขัน"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="arena-secondary"
          onClick={() => setAscending(v => !v)}
        >
          <ArrowDownUp size={14} />
          {ascending ? "อันดับท้ายก่อน" : "อันดับสูงสุดก่อน"}
        </button>
      </div>
      <p className="arena-fine-print" role="status">
        {data
          ? `${data.total} ผู้เข้าร่วม · แสดง ${visible.length} โปรไฟล์ · ค้นหาไม่เปลี่ยนอันดับ`
          : "ยังไม่มีข้อมูลอันดับที่โหลดสำเร็จ"}
      </p>
      {visible.length ? (
        <div className="arena-ranking-list">
          {visible.map(item => (
            <article
              key={item.id}
              className={`arena-ranking-row arena-ranking-row--${item.rank <= 3 ? item.rank : "other"}`}
            >
              <span className="arena-ranking-row__rank">#{item.rank}</span>
              <RankIdentity
                profile={item.profile}
                rank={item.rank}
                onClick={() => openProfile(item.profileId, item.rank)}
              />
              <div className="arena-ranking-row__score">
                <strong>
                  {new Intl.NumberFormat("th-TH", {
                    maximumFractionDigits: 6,
                  }).format(item.value)}
                </strong>
                <span>{item.unit}</span>
                <small>
                  {item.verification === "verified"
                    ? "ผู้ดูแลรับรอง"
                    : reviewLabels[item.reviewStatus ?? "none"]}
                </small>
                <RankingViewCount
                  total={entryViews.counts.get(
                    rankingTargetId({ kind: "community-entry", key: item.id })
                  )}
                />
              </div>
            </article>
          ))}
        </div>
      ) : !loading && !error ? (
        <div className="arena-empty">
          <Trophy size={32} />
          <h4>
            {verified !== "all"
              ? "ยังไม่มีสถิติที่ผ่านการยืนยัน"
              : query
                ? "ไม่พบโปรไฟล์ที่ค้นหา"
                : "เวทีนี้ยังรอผู้ท้าชิงคนแรก"}
          </h4>
          <p>
            {verified !== "all"
              ? "แนบหลักฐานในโปรไฟล์และส่ง AI ตรวจ ผล AI แยกจากการรับรองโดยผู้ดูแล ไม่สร้างข้อมูลรับรองปลอม"
              : "สร้างโปรไฟล์และลงสถิติของคุณ เพื่อเริ่มอันดับจริงของรายการนี้"}
          </p>
          <button
            type="button"
            className="arena-primary"
            onClick={() => setFormOpen(true)}
          >
            ลงสถิติของฉัน <Plus size={14} />
          </button>
        </div>
      ) : null}
      <div className="arena-frame-legend">
        <span>
          <Crown size={14} />
          #1 Champion · ทอง
        </span>
        <span>#2 Challenger · เงิน</span>
        <span>#3 Elite · ทองแดง</span>
        <span>#4+ Contender</span>
      </div>
      {ownIds.length ? (
        <div className="arena-own-profiles">
          <h4>โปรไฟล์ของฉันบนเบราว์เซอร์นี้</h4>
          {ownIds.map(id => (
            <button
              type="button"
              className="arena-secondary"
              key={id}
              onClick={() => openProfile(id)}
            >
              โปรไฟล์ {id.slice(0, 8)}…
            </button>
          ))}
        </div>
      ) : null}
      <div className="arena-media-tools">
        <ReviewDesk />
        <button
          type="button"
          className="arena-secondary"
          aria-expanded={filesOpen}
          onClick={() => setFilesOpen(v => !v)}
        >
          <BarChart3 size={14} />
          {filesOpen ? "ซ่อน" : "เปิด"}ตารางสถิติไฟล์รูป / วิดีโอ
        </button>
        {filesOpen ? (
          <MediaStatsTable
            likedIds={likedIds}
            savedIds={savedIds}
            onOpenPost={onOpenPost}
          />
        ) : null}
      </div>
    </section>
  );
}
