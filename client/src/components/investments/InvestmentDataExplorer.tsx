import { useMemo, useRef, useState } from "react";
import { ArrowDownUp, Search } from "lucide-react";
import {
  investmentKindLabels,
  type InvestmentReference,
} from "../../../../shared/investmentReferences";
import {
  dashboardRecords,
  type DashboardKind,
} from "../../lib/investmentDashboard";
import InvestmentDetails from "./InvestmentDetails";
import { RankingViewCount } from "../RankingViewBadge";
import { useRankingViews } from "../../hooks/useRankingViews";
import { rankingTargetId } from "../../../../shared/rankingViews";

export default function InvestmentDataExplorer({
  records,
}: {
  records: InvestmentReference[];
}) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<DashboardKind>("all");
  const [descending, setDescending] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const visible = useMemo(
    () => dashboardRecords(records, query, kind, descending),
    [records, query, kind, descending]
  );
  const selected = records.find(record => record.id === selectedId);
  const entityViews = useRankingViews(
    records.map(record => ({ kind: "investment-entity", key: record.id }))
  );
  const open = (id: string) => {
    if (selectedId !== id)
      entityViews.open({ kind: "investment-entity", key: id });
    setSelectedId(id);
    requestAnimationFrame(() => detailRef.current?.focus());
  };
  return (
    <>
      <div className="idash-controls">
        <label className="idash-search">
          <Search size={17} />
          <input
            aria-label="ค้นข้อมูลนักลงทุน กองทุน บริษัท"
            type="search"
            value={query}
            maxLength={100}
            onChange={event => setQuery(event.target.value)}
            placeholder="ค้นชื่อ กองทุน หรือสัญลักษณ์…"
          />
        </label>
        <label>
          ประเภท
          <select
            aria-label="กรองประเภทข้อมูลลงทุน"
            value={kind}
            onChange={event => setKind(event.target.value as DashboardKind)}
          >
            <option value="all">ทั้งหมด</option>
            <option value="investor">นักลงทุน</option>
            <option value="fund">กองทุน ETF</option>
            <option value="company">บริษัท</option>
          </select>
        </label>
        <button type="button" onClick={() => setDescending(value => !value)}>
          <ArrowDownUp size={16} />
          {descending ? "ชื่อ Z → A" : "ชื่อ A → Z"}
        </button>
      </div>
      <p className="idash-muted">
        {visible.length} รายการที่แสดง · เรียงตามชื่อ ไม่ใช่อันดับผลตอบแทน
      </p>
      {entityViews.error ? (
        <button type="button" onClick={entityViews.retry}>
          ลองโหลดยอดเปิดดูใหม่
        </button>
      ) : null}
      {!visible.length ? (
        <p role="status" className="idash-empty">
          ไม่มีรายการที่ตรงกับการค้นหา
        </p>
      ) : (
        <div
          className="idash-table-scroll"
          tabIndex={0}
          role="region"
          aria-label="ตารางข้อมูลลงทุน เลื่อนแนวนอนได้"
        >
          <table className="idash-table">
            <caption>
              ข้อมูลอ้างอิงจากฐานข้อมูลขิงขิง · ไม่ใช่ข้อมูลที่ดึงจาก
              HedgeFollow
            </caption>
            <thead>
              <tr>
                <th
                  scope="col"
                  aria-sort={descending ? "descending" : "ascending"}
                >
                  <button
                    type="button"
                    onClick={() => setDescending(value => !value)}
                  >
                    ชื่อ / สัญลักษณ์
                    <ArrowDownUp size={12} />
                  </button>
                </th>
                <th scope="col">ประเภท</th>
                <th scope="col">ตัวอย่างหุ้น</th>
                <th scope="col">แหล่งข้อมูล</th>
                <th scope="col">เปิดดูในขิงขิง</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(record => (
                <tr
                  key={record.id}
                  className={selectedId === record.id ? "is-selected" : ""}
                >
                  <td>
                    <button
                      id={`investment-row-${record.id}`}
                      type="button"
                      className="idash-name"
                      aria-expanded={selectedId === record.id}
                      onClick={() => open(record.id)}
                    >
                      <span className="idash-monogram">
                        {record.ticker.split(" ")[0] ||
                          record.name
                            .split(" ")
                            .map(part => part[0])
                            .join("")
                            .slice(0, 2)}
                      </span>
                      <span>
                        <strong>{record.name}</strong>
                        <small>
                          {record.ticker || "ข้อมูลบุคคล · ไม่ใช่บัญชีขิงขิง"}
                        </small>
                      </span>
                    </button>
                  </td>
                  <td>
                    <span className={`idash-type idash-type--${record.kind}`}>
                      {investmentKindLabels[record.kind]}
                    </span>
                  </td>
                  <td>
                    {record.holdings.length
                      ? `${record.holdings.length} รายการที่เก็บ`
                      : "—"}
                  </td>
                  <td>
                    <span>เอกสารทางการ</span>
                    <small>อ่านแหล่ง {record.retrievedAt.slice(0, 10)}</small>
                  </td>
                  <td>
                    <RankingViewCount
                      total={entityViews.counts.get(
                        rankingTargetId({
                          kind: "investment-entity",
                          key: record.id,
                        })
                      )}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {selected ? (
        <div ref={detailRef} tabIndex={-1} className="idash-detail-focus">
          <InvestmentDetails
            record={selected}
            close={() => {
              setSelectedId(null);
              document.getElementById(`investment-row-${selected.id}`)?.focus();
            }}
          />
        </div>
      ) : null}
    </>
  );
}
