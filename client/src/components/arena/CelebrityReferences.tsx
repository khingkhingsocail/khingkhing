import { useEffect, useMemo, useState } from "react";
import {
  ExternalLink,
  Globe2,
  RefreshCw,
  Search,
  Trophy,
  X,
} from "lucide-react";
import { type ArenaCategory, rankTier } from "../../../../shared/arena";
import {
  referenceBoard,
  referenceScopeLabel,
} from "../../../../shared/referenceBoards";
import {
  arenaReferenceSchema,
  referenceCategory,
  referenceGroup,
  rankReferences,
  type ArenaReference,
} from "../../../../shared/arenaReferences";
import { RankingViewStatus, RankingViewCount } from "../RankingViewBadge";
import {
  useRankingViews,
  useRankingOpening,
} from "../../hooks/useRankingViews";
import { rankingTargetId } from "../../../../shared/rankingViews";
import "./celebrity-references.css";

export default function CelebrityReferences({
  category,
}: {
  category: ArenaCategory;
}) {
  const [storedRecords, setRecords] = useState<ArenaReference[]>([]);
  const [allCategories, setAllCategories] = useState(false);
  const records = useMemo(
    () =>
      storedRecords.filter(
        record => allCategories || referenceCategory(record) === category
      ),
    [storedRecords, category, allCategories]
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState("");
  const [query, setQuery] = useState("");
  const [reverse, setReverse] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError("");
    void fetch("/api/arena-references", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async res => {
        if (!res.ok)
          throw new Error("โหลดสถิติคนดังไม่สำเร็จ กรุณาลองอีกครั้ง");
        const page = await res.json();
        if (!Array.isArray(page.items))
          throw new Error("ข้อมูลสถิติไม่ถูกต้อง");
        return page.items.map((item: unknown) =>
          arenaReferenceSchema.parse(item)
        );
      })
      .then(items => {
        if (active) setRecords(items);
      })
      .catch(cause => {
        if (active)
          setError(
            cause instanceof Error ? cause.message : "โหลดข้อมูลไม่สำเร็จ"
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [revision]);
  const groups = useMemo(
    () =>
      [...new Set(records.map(referenceGroup))].sort((a, b) => {
        const first = referenceBoard(a.split("|")[0])?.title ?? a;
        const second = referenceBoard(b.split("|")[0])?.title ?? b;
        return first.localeCompare(second, "th") || b.localeCompare(a);
      }),
    [records]
  );
  const activeGroup = groups.includes(selected) ? selected : (groups[0] ?? "");
  const ranked = useMemo(
    () => rankReferences(records, activeGroup),
    [records, activeGroup]
  );
  const visible = ranked.filter(r =>
    r.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
  );
  if (reverse) visible.reverse();
  const first = ranked[0];
  const board = referenceBoard(first?.boardKey ?? "");
  const detailRecord = records.find(r => r.id === detail);
  const people = [
    ...new Map(records.map(record => [record.personId, record])).values(),
  ].sort((a, b) => a.name.localeCompare(b.name));
  const personRecords = detailRecord
    ? storedRecords.filter(r => r.personId === detailRecord.personId)
    : [];
  const entryViews = useRankingViews(
    records.map(item => ({ kind: "reference-entry", key: item.id }))
  );
  const groupTarget = { kind: "reference-group" as const, key: activeGroup };
  const groupViews = useRankingOpening(
    activeGroup ? groupTarget : null,
    !loading && !error && !!activeGroup
  );
  function openReference(id: string) {
    if (detail !== id) entryViews.open({ kind: "reference-entry", key: id });
    setDetail(id);
  }
  function groupLabel(group: string) {
    const item = records.find(r => referenceGroup(r) === group)!;
    return `${referenceBoard(item.boardKey)?.title} · ${referenceScopeLabel(item.scope, item.observedAt)}`;
  }
  return (
    <section
      className="celebrity-references"
      aria-labelledby="celebrity-reference-title"
    >
      <header className="celebrity-references__heading">
        <div>
          <p>
            <Globe2 size={13} /> PUBLIC BENCHMARKS
          </p>
          <h3 id="celebrity-reference-title">
            สถิติคนดัง · แรงบันดาลใจของผู้ท้าชิง
          </h3>
        </div>
        <button
          type="button"
          className="arena-secondary"
          onClick={() => setRevision(v => v + 1)}
          disabled={loading}
        >
          <RefreshCw size={14} />
          โหลดข้อมูลอีกครั้ง
        </button>
      </header>
      <p className="celebrity-references__notice">
        ข้อมูลบุคคลสาธารณะจากแหล่งอ้างอิง
        ไม่ใช่บัญชีที่สมัครขิงขิงหรือผู้เข้าร่วมแข่งขัน ·
        แยกจากอันดับรายเดือนของคุณ · ไม่รวมข้อมูลส่วนตัวหรือสถิติที่ตรวจไม่ได้
      </p>
      <div className="celebrity-references__browse">
        <button
          type="button"
          className="arena-secondary"
          aria-pressed={!allCategories}
          onClick={() => {
            setAllCategories(false);
            setDetail(null);
          }}
        >
          หมวดที่เลือก
        </button>
        <button
          type="button"
          className="arena-secondary"
          aria-pressed={allCategories}
          onClick={() => {
            setAllCategories(true);
            setDetail(null);
          }}
        >
          ดูทุกหมวดอ้างอิง
        </button>
        {!loading ? (
          <span>
            {new Set(records.map(r => r.personId)).size} คน · {records.length}{" "}
            สถิติในชุดที่แสดง{allCategories ? "" : "หมวดนี้"}
          </span>
        ) : null}
      </div>
      {loading ? <p role="status">กำลังโหลดสถิติอ้างอิง…</p> : null}
      {error ? (
        <p role="alert">
          {error}{" "}
          <button
            type="button"
            className="arena-secondary"
            onClick={() => setRevision(v => v + 1)}
          >
            ลองใหม่
          </button>
        </p>
      ) : null}
      {!loading && !error && !records.length ? (
        <p className="celebrity-references__empty">
          ยังไม่มีข้อมูลคนดังที่ตรวจแหล่งได้ในหมวดนี้ · ไม่เติมคะแนนสมมติ กด
          “ดูทุกหมวดอ้างอิง” เพื่อสำรวจข้อมูลที่มี
        </p>
      ) : null}
      {records.length ? (
        <>
          <details className="celebrity-directory">
            <summary>เลือกคนดัง · ดูทุกสถิติที่มีแหล่งอ้างอิง</summary>
            <div>
              {people.map(person => (
                <button
                  type="button"
                  className="arena-secondary"
                  key={person.personId}
                  onClick={() => {
                    setSelected(referenceGroup(person));
                    openReference(person.id);
                    setQuery("");
                  }}
                >
                  {person.name}
                </button>
              ))}
            </div>
          </details>
          <div className="celebrity-references__controls">
            <label>
              สถิติที่เทียบกันได้
              <select
                value={activeGroup}
                onChange={e => {
                  setSelected(e.target.value);
                  setDetail(null);
                }}
              >
                {groups.map(group => (
                  <option key={group} value={group}>
                    {groupLabel(group)}
                  </option>
                ))}
              </select>
            </label>
            <label className="celebrity-references__search">
              <Search size={14} />
              <input
                aria-label="ค้นชื่อคนดังในรายการที่เลือก"
                type="search"
                value={query}
                maxLength={100}
                placeholder="ค้นชื่อในสถิติที่เลือก"
                onChange={e => setQuery(e.target.value)}
              />
            </label>
            <button
              className="arena-secondary"
              type="button"
              onClick={() => setReverse(v => !v)}
            >
              {reverse ? "อันดับท้ายก่อน" : "อันดับสูงสุดก่อน"}
            </button>
          </div>
          {!loading && !error && activeGroup ? (
            <RankingViewStatus target={groupTarget} state={groupViews} />
          ) : null}
          {entryViews.error ? (
            <button
              type="button"
              className="arena-secondary"
              onClick={entryViews.retry}
            >
              ลองโหลดยอดเปิดดูสถิติใหม่
            </button>
          ) : null}
          <p className="celebrity-references__scope">
            {first?.scope === "career-best"
              ? "ผลงานที่ทำไว้ตลอดอาชีพ ไม่ใช่ผลการแข่งขันเดือนนี้"
              : first?.scope === "career-total"
                ? `ยอดสะสมที่แหล่งรายงาน ณ ${first.observedAt} ไม่ใช่ยอดเรียลไทม์`
                : `Snapshot ที่อ่านจากแหล่งสาธารณะวันที่ ${first?.observedAt} ไม่ใช่ยอดเรียลไทม์`}{" "}
            · อันดับเฉพาะ {ranked.length} คนในรายการและช่วงเวลานี้
            ไม่ใช่อันดับโลกครบทุกคน · ≈ หมายถึงตัวเลขปัดเศษ
          </p>
          <div className="celebrity-reference-list">
            {visible.map(item => (
              <article
                className={`celebrity-reference-card celebrity-reference-card--${rankTier(item.rank)}`}
                key={item.id}
              >
                <button
                  type="button"
                  className="celebrity-reference-identity"
                  aria-expanded={detail === item.id}
                  aria-controls={
                    detail === item.id
                      ? "celebrity-reference-detail"
                      : undefined
                  }
                  onClick={() => {
                    if (detail === item.id) setDetail(null);
                    else openReference(item.id);
                  }}
                >
                  <span className="celebrity-reference-avatar">
                    {Array.from(item.name)[0]}
                    <i>#{item.rank}</i>
                  </span>
                  <span>
                    <small>
                      <Trophy size={11} /> #{item.rank} · PUBLIC REFERENCE
                    </small>
                    <strong>{item.name}</strong>
                    <em>ข้อมูลอ้างอิง · แตะดูทุกสถิติของคนนี้</em>
                  </span>
                </button>
                <div className="celebrity-reference-score">
                  <strong>
                    {item.approximate ? "≈ " : ""}
                    {item.displayValue}
                  </strong>
                  <span>
                    {board?.unit} ·{" "}
                    {item.scope === "career-best"
                      ? item.eventDate
                      : item.observedAt}
                  </span>
                  <a
                    href={item.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    ดูแหล่งข้อมูล <ExternalLink size={12} />
                  </a>
                  <RankingViewCount
                    total={entryViews.counts.get(
                      rankingTargetId({ kind: "reference-entry", key: item.id })
                    )}
                  />
                </div>
              </article>
            ))}
          </div>
          {!visible.length ? (
            <p role="status">ไม่พบชื่อในสถิติที่เลือก</p>
          ) : null}
          {detailRecord ? (
            <aside
              className="celebrity-reference-detail"
              id="celebrity-reference-detail"
              aria-label={`รายละเอียดสถิติ ${detailRecord.name}`}
            >
              <header>
                <h4>
                  {detailRecord.name} · {personRecords.length} สถิติอ้างอิง
                </h4>
                <button
                  type="button"
                  aria-label="ปิดรายละเอียดสถิติ"
                  className="arena-secondary"
                  onClick={() => setDetail(null)}
                >
                  <X size={15} />
                </button>
              </header>
              <RankingViewCount
                total={entryViews.counts.get(
                  rankingTargetId({
                    kind: "reference-entry",
                    key: detailRecord.id,
                  })
                )}
              />
              <p>
                ข้อมูลสาธารณะที่มีแหล่งอ้างอิงในชุดนี้
                ไม่ใช่ข้อมูลทุกอย่างของบุคคล และไม่ใช่บัญชีผู้ใช้ขิงขิง
              </p>
              <div className="celebrity-person-stats">
                {personRecords.map(item => (
                  <article key={item.id}>
                    <h5>{referenceBoard(item.boardKey)?.title}</h5>
                    <strong>
                      {item.approximate ? "≈ " : ""}
                      {item.displayValue}
                    </strong>
                    <p>
                      {referenceScopeLabel(item.scope, item.observedAt)}
                      {item.eventDate ? ` · ทำผลงาน ${item.eventDate}` : ""} ·
                      อ่านข้อมูล {item.retrievedAt.slice(0, 10)}
                    </p>
                    <blockquote>{item.excerpt}</blockquote>
                    <p>{item.notes}</p>
                    <a
                      href={item.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {item.sourceTitle} <ExternalLink size={13} />
                    </a>
                  </article>
                ))}
              </div>
              <p className="celebrity-references__scope">
                กรอบอันดับนี้ไม่ใช่ตรารับรองโดย AI หรือผู้ดูแล
                ไม่สื่อว่าบุคคลนี้รับรองแอป
                และไม่เปรียบเทียบคนละหน่วย/ประเภทเป็นคะแนนเดียว
              </p>
            </aside>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
