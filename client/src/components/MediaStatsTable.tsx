import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ArrowUpRight, BarChart3, FileVideo2, Image, RefreshCw, Search } from "lucide-react";
import type { PublicMediaSummary } from "@shared/publicMedia";
import { fetchPublicMediaPage, isPublicMediaSummary } from "@/lib/publicMedia";
import {
  filterMediaStats, formatStatsBytes, mergeStatsItems, sortMediaStats, statsColumns,
  summarizeMediaStats, toMediaStatsRows,
  type StatsDirection, type StatsKindFilter, type StatsSortKey,
} from "@/lib/mediaStats";
import "./media-stats.css";

const PAGE_SIZE = 100;
const dateFormatter = new Intl.DateTimeFormat("th-TH-u-ca-gregory", {
  dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok",
});
const countFormatter = new Intl.NumberFormat("th-TH");

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : dateFormatter.format(date);
}

interface MediaStatsTableProps {
  likedIds: ReadonlySet<string>;
  savedIds: ReadonlySet<string>;
  onOpenPost: (id: string) => void;
}

export default function MediaStatsTable({ likedIds, savedIds, onOpenPost }: MediaStatsTableProps) {
  const [items, setItems] = useState<PublicMediaSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [kind, setKind] = useState<StatsKindFilter>("all");
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<StatsSortKey>("createdAt");
  const [direction, setDirection] = useState<StatsDirection>("desc");
  const versionRef = useRef(0);
  const busyRef = useRef(false);

  const loadPage = useCallback(async (cursor: string | null) => {
    if (busyRef.current) return;
    busyRef.current = true;
    const version = ++versionRef.current;
    if (cursor) setLoadingMore(true);
    else setLoading(true);
    setError("");
    try {
      const page = await fetchPublicMediaPage(cursor, PAGE_SIZE);
      if (version !== versionRef.current) return;
      if (!Array.isArray(page.items) || !page.items.every(isPublicMediaSummary)
        || !page.items.every((item) => Number.isSafeInteger(item.size) && item.size >= 0)
        || !page.items.every((item) => item.viewCount === undefined || (Number.isSafeInteger(item.viewCount) && item.viewCount >= 0))
        || (page.nextCursor !== null && typeof page.nextCursor !== "string")
        || (cursor && page.nextCursor === cursor)) throw new Error("ข้อมูลตารางไม่ถูกต้อง กรุณารีเฟรชใหม่");
      setItems((current) => mergeStatsItems(cursor ? current : [], page.items));
      setNextCursor(page.nextCursor);
      setLoaded(true);
    } catch (cause) {
      if (version === versionRef.current) setError(cause instanceof Error ? cause.message : "โหลดสถิติไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      if (version === versionRef.current) {
        busyRef.current = false;
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadPage(null);
    return () => {
      ++versionRef.current;
      busyRef.current = false;
    };
  }, [loadPage]);

  const rows = useMemo(() => toMediaStatsRows(items, likedIds, savedIds), [items, likedIds, savedIds]);
  const filtered = useMemo(() => filterMediaStats(rows, kind, query), [rows, kind, query]);
  const sorted = useMemo(() => sortMediaStats(filtered, sortKey, direction), [filtered, sortKey, direction]);
  const summary = useMemo(() => summarizeMediaStats(filtered), [filtered]);
  const sortLabel = statsColumns.find((column) => column.key === sortKey)?.label ?? "วันที่เผยแพร่";
  const busy = loading || loadingMore;

  function selectSort(key: StatsSortKey) {
    if (key === sortKey) setDirection((current) => current === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
      setDirection(key === "title" || key === "kind" ? "asc" : "desc");
    }
  }

  return (
    <section className="media-stats" aria-labelledby="media-stats-title">
      <header className="media-stats__header">
        <div>
          <p className="media-stats__eyebrow"><BarChart3 size={14} /> PUBLIC MEDIA · STATISTICS</p>
          <h2 id="media-stats-title">ขิงขิง</h2>
          <p>สถิติรูปและวิดีโอ · หนึ่งแถวต่อหนึ่งโพสต์สาธารณะ · ไม่รวมคลังส่วนตัวและสื่อตัวอย่าง</p>
        </div>
        <button type="button" className="media-stats__refresh" disabled={busy} onClick={() => void loadPage(null)}>
          <RefreshCw size={15} className={loading ? "spin" : undefined} /> รีเฟรช
        </button>
      </header>

      <div className="media-stats__summary" aria-label="สรุปเฉพาะรายการที่โหลดและผ่านตัวกรอง">
        {[
          { label: "รายการที่แสดง", value: countFormatter.format(summary.count), icon: <BarChart3 size={18} /> },
          { label: "รูปภาพ", value: countFormatter.format(summary.images), icon: <Image size={18} /> },
          { label: "วิดีโอ", value: countFormatter.format(summary.videos), icon: <FileVideo2 size={18} /> },
          { label: "ขนาดไฟล์รวมที่แสดง", value: summary.bytes === null ? "—" : formatStatsBytes(summary.bytes), icon: <ArrowUpDown size={18} /> },
        ].map((stat) => (
          <div key={stat.label}><span>{stat.icon}{stat.label}</span><strong>{loaded ? stat.value : "—"}</strong></div>
        ))}
      </div>

      <div className="media-stats__controls">
        <label className="media-stats__search"><Search size={16} /><span className="visually-hidden">ค้นชื่อหรือคำอธิบายผลงาน</span>
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นชื่อหรือคำอธิบาย…" maxLength={240} />
        </label>
        <label>ประเภท
          <select value={kind} onChange={(event) => setKind(event.target.value as StatsKindFilter)}>
            <option value="all">ทั้งหมด</option><option value="image">รูปภาพ</option><option value="video">วิดีโอ</option>
          </select>
        </label>
        <label>เรียงตาม
          <select value={sortKey} onChange={(event) => selectSort(event.target.value as StatsSortKey)}>
            {statsColumns.map((column) => <option value={column.key} key={column.key}>{column.label}</option>)}
          </select>
        </label>
        <button type="button" className="media-stats__direction" onClick={() => setDirection((current) => current === "asc" ? "desc" : "asc")}>
          {direction === "asc" ? <ArrowUp size={15} /> : <ArrowDown size={15} />}
          {sortKey === "createdAt" ? (direction === "asc" ? "เก่า → ใหม่" : "ใหม่ → เก่า") : (direction === "asc" ? "น้อย → มาก / ก → ฮ" : "มาก → น้อย / ฮ → ก")}
        </button>
      </div>
      <p className="media-stats__scope" id="media-stats-scope" role="status">
        แสดง {countFormatter.format(filtered.length)} จาก {countFormatter.format(items.length)} รายการที่โหลดแล้ว
        {nextCursor ? " · ยังมีโพสต์เพิ่มเติม" : loaded ? " · โหลดครบตามหน้าข้อมูลที่ได้รับแล้ว" : ""}
        {` · เรียง ${sortLabel} ${direction === "asc" ? "↑" : "↓"}`}
      </p>
      <p className="media-stats__notice" id="media-stats-notice">
        การเรียงและสรุปใช้เฉพาะรายการที่โหลดและผ่านตัวกรอง ไม่ใช่อันดับรวมทั้งระบบ · ใจ/บันทึกเป็นสถานะเฉพาะเซสชันนี้และหายเมื่อรีโหลด · วิวเป็นยอดจริงจากข้อมูลโพสต์ที่ได้รับ (โพสต์เก่าที่ไม่มีค่าจะแสดง — ไม่ใช่ศูนย์) · ยอดความคิดเห็นและแชร์ยังไม่เชื่อมในตารางนี้ จึงแสดง — ไม่ใช่ศูนย์
      </p>
      {error ? <p className="media-stats__error" role="alert">{error} {loaded ? "· กำลังแสดงข้อมูลจากครั้งก่อน" : ""}</p> : null}
      {loading ? <p className="media-stats__loading" role="status">กำลังโหลดสถิติ…</p> : null}

      <div className="media-stats__scroll" role="region" aria-label="ตารางสถิติโพสต์ เลื่อนแนวนอนเพื่อดูทุกคอลัมน์" tabIndex={0}>
        <table aria-describedby="media-stats-scope media-stats-notice" aria-busy={busy}>
          <caption className="visually-hidden">ตารางสถิติโพสต์สาธารณะ กดหัวคอลัมน์เพื่อสลับทิศทางการเรียง</caption>
          <thead><tr>
            <th scope="col">ลำดับ</th>
            {statsColumns.map((column) => (
              <th scope="col" key={column.key} aria-sort={sortKey === column.key ? (direction === "asc" ? "ascending" : "descending") : "none"}>
                <button type="button" onClick={() => selectSort(column.key)} aria-label={`เรียงตาม ${column.label}${sortKey === column.key ? " สลับทิศทาง" : ""}`}>
                  {column.label}{sortKey === column.key ? (direction === "asc" ? <ArrowUp size={13} /> : <ArrowDown size={13} />) : <ArrowUpDown size={13} />}
                </button>
              </th>
            ))}
            <th scope="col">ความคิดเห็น</th><th scope="col">แชร์</th><th scope="col">เปิดโพสต์</th>
          </tr></thead>
          <tbody>
            {sorted.map((row, index) => (
              <tr key={row.id}>
                <td className="media-stats__number">{countFormatter.format(index + 1)}</td>
                <th scope="row" className="media-stats__title"><button type="button" onClick={() => onOpenPost(row.id)}>{row.title}</button><small>{row.description || "ไม่มีคำอธิบาย"}</small></th>
                <td><span className={`media-stats__kind media-stats__kind--${row.kind}`}>{row.kind === "image" ? <Image size={13} /> : <FileVideo2 size={13} />}{row.kind === "image" ? "รูปภาพ" : "วิดีโอ"}</span></td>
                <td className="media-stats__date">{formatDate(row.createdAt)}</td>
                <td className="media-stats__number">{formatStatsBytes(row.size)}</td>
                <td className="media-stats__number">{row.sessionLikes}</td><td className="media-stats__number">{row.sessionBookmarks}</td>
                <td className={row.views === null ? "media-stats__unknown" : "media-stats__number"}>{row.views === null ? <span aria-label="ยังไม่มีข้อมูลวิว">—</span> : countFormatter.format(row.views)}</td>
                {["comments", "shares"].map((metric) => <td key={metric} className="media-stats__unknown"><span aria-label="ยังไม่เก็บข้อมูล" title="ยังไม่เก็บข้อมูลจริง">—</span></td>)}
                <td><button type="button" className="media-stats__open" onClick={() => onOpenPost(row.id)} aria-label={`เปิด ${row.title} ในฟีด`}>ดูในฟีด <ArrowUpRight size={13} /></button></td>
              </tr>
            ))}
            {!sorted.length && !loading ? <tr><td colSpan={11} className="media-stats__empty">{!loaded && error ? "ยังโหลดข้อมูลไม่สำเร็จ กดรีเฟรชเพื่อลองใหม่" : items.length ? "ไม่พบผลงานที่ตรงกับตัวกรอง ลองเปลี่ยนประเภทหรือคำค้น" : "ยังไม่มีโพสต์สาธารณะ อัปโหลดรูปหรือวิดีโอเพื่อเริ่มต้น"}</td></tr> : null}
          </tbody>
        </table>
      </div>
      <footer className="media-stats__footer"><span>วันที่แสดงตามเวลาไทย (UTC+7) · ขนาดใช้ KiB/MiB</span>
        {nextCursor ? <button type="button" disabled={busy} onClick={() => void loadPage(nextCursor)}>{loadingMore ? "กำลังโหลด…" : "โหลดเพิ่ม 100 รายการ"}</button> : null}
      </footer>
    </section>
  );
}
