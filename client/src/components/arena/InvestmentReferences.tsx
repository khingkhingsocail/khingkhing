import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownUp,
  Building2,
  ExternalLink,
  Landmark,
  RefreshCw,
  Search,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  investmentKinds,
  investmentKindLabels,
  investmentReferenceSchema,
  investmentMetricLabels,
  investmentMetricGroup,
  rankInvestmentMetrics,
  filterInvestmentReferences,
  type InvestmentReference,
} from "../../../../shared/investmentReferences";
import HedgeFollowReference from "./HedgeFollowReference";
import { hedgeFollowStockUrl } from "../../lib/hedgeFollow";
import { Link } from "wouter";
import { RankingViewStatus, RankingViewCount } from "../RankingViewBadge";
import {
  useRankingViews,
  useRankingOpening,
} from "../../hooks/useRankingViews";
import { rankingTargetId } from "../../../../shared/rankingViews";
import InvestorReturns from "../investments/InvestorReturns";
import "./investment-references.css";

const kindIcons = { investor: Users, fund: Landmark, company: Building2 };
const amount = (value: number, unit: string) =>
  `${new Intl.NumberFormat("th-TH", { maximumFractionDigits: 4 }).format(value)} ${unit}`;
export default function InvestmentReferences() {
  const [items, setItems] = useState<InvestmentReference[]>([]);
  const [kind, setKind] = useState<InvestmentReference["kind"]>("investor");
  const [query, setQuery] = useState("");
  const [descending, setDescending] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [metricGroup, setMetricGroup] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError("");
    void fetch("/api/investment-references", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async res => {
        if (!res.ok)
          throw new Error("โหลดข้อมูลการลงทุนไม่สำเร็จ กรุณาลองใหม่");
        const body = await res.json();
        if (!Array.isArray(body.items))
          throw new Error("ข้อมูลการลงทุนไม่ถูกต้อง");
        return body.items.map((row: unknown) =>
          investmentReferenceSchema.parse(row)
        );
      })
      .then(rows => {
        if (active) setItems(rows);
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
  const visible = useMemo(
    () => filterInvestmentReferences(items, kind, query, descending),
    [items, kind, query, descending]
  );
  const detail = items.find(row => row.id === selected && row.kind === kind);
  const groups = [
    ...new Map(
      items
        .filter(r => r.kind === "fund")
        .flatMap(entity =>
          entity.metrics.map(
            metric => [investmentMetricGroup(metric), metric] as const
          )
        )
    ).entries(),
  ];
  const activeGroup = groups.some(([key]) => key === metricGroup)
    ? metricGroup
    : (groups[0]?.[0] ?? "");
  const ranks = rankInvestmentMetrics(items, activeGroup);
  const detailTickers = (detail?.ticker ?? "")
    .split(/\s*\/\s*/)
    .filter(Boolean);
  const investorsInDetail =
    detail?.kind === "company"
      ? items.flatMap(entity =>
          entity.holdings
            .filter(holding => detailTickers.includes(holding.ticker))
            .map(holding => ({ entity, holding }))
        )
      : [];
  const showRows = !loading && !error;
  const entityViews = useRankingViews(
    items.map(item => ({ kind: "investment-entity", key: item.id }))
  );
  const groupTarget = { kind: "investment-group" as const, key: activeGroup };
  const groupViews = useRankingOpening(
    activeGroup ? groupTarget : null,
    showRows && kind === "fund" && !!activeGroup,
    kind === "fund"
  );
  function openEntity(id: string) {
    if (selected !== id)
      entityViews.open({ kind: "investment-entity", key: id });
    setSelected(id);
  }
  return (
    <section
      className="investment-references"
      aria-labelledby="investment-reference-title"
    >
      <header className="investment-references__header">
        <div>
          <p>
            <TrendingUp size={14} /> INVESTMENT DIRECTORY
          </p>
          <h3 id="investment-reference-title">
            การลงทุน · นักลงทุน กองทุน และบริษัท
          </h3>
        </div>
        <button
          type="button"
          className="arena-secondary"
          disabled={loading}
          onClick={() => setRevision(v => v + 1)}
        >
          <RefreshCw size={14} />
          โหลดข้อมูลใหม่
        </button>
      </header>
      <p className="investment-notice">
        ข้อมูลอ้างอิงจากเอกสารทางการ
        ไม่ใช่บัญชีผู้เข้าร่วมขิงขิงหรือคำแนะนำซื้อขาย ·
        ผลตอบแทนรายเดือนของชุมชนแสดงแยกด้านล่าง
      </p>
      <Link href="/investments" className="investment-dashboard-link">
        <TrendingUp size={17} /> เปิดแดชบอร์ดนักลงทุนและกองทุน
        <span>ภาพรวม · รายชื่อเด่น · ข้อมูลอ้างอิง</span>
      </Link>
      <HedgeFollowReference />
      <InvestorReturns />
      <nav className="investment-kind-tabs" aria-label="หัวข้อย่อยการลงทุน">
        {investmentKinds.map(value => {
          const Icon = kindIcons[value];
          return (
            <button
              type="button"
              key={value}
              aria-pressed={kind === value}
              className={kind === value ? "is-active" : ""}
              onClick={() => {
                setKind(value);
                setSelected(null);
                setQuery("");
              }}
            >
              <Icon size={16} />
              {investmentKindLabels[value]}
              <small>
                {showRows
                  ? items.filter(row => row.kind === value).length
                  : "—"}
              </small>
            </button>
          );
        })}
      </nav>
      <div className="investment-controls">
        <label>
          <Search size={15} />
          <input
            aria-label="ค้นนักลงทุน กองทุน หรือบริษัท"
            type="search"
            maxLength={100}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="ค้นชื่อ สัญลักษณ์ หรือบทบาท"
          />
        </label>
        <button
          type="button"
          className="arena-secondary"
          onClick={() => setDescending(v => !v)}
        >
          <ArrowDownUp size={14} />
          {descending ? "ชื่อ Z → A" : "ชื่อ A → Z"}
        </button>
      </div>
      {loading ? <p role="status">กำลังโหลดข้อมูลการลงทุน…</p> : null}
      {error ? (
        <p role="alert">
          {error}
          <button
            type="button"
            className="arena-secondary"
            onClick={() => setRevision(v => v + 1)}
          >
            ลองใหม่
          </button>
        </p>
      ) : null}
      {showRows ? (
        <>
          <p className="investment-caption">
            {visible.length} รายชื่อที่แสดง · เรียงตามชื่อ
            ไม่ใช่อันดับความเก่งหรือผลตอบแทน ·
            แตะชื่อเพื่อดูข้อมูลและบริษัทที่ถือหุ้น
          </p>
          {!visible.length ? (
            <p role="status">
              ยังไม่มีข้อมูลที่ตรงกับหัวข้อหรือชื่อที่ค้นหา ไม่เติมข้อมูลสมมติ
            </p>
          ) : null}
          <div className="investment-directory">
            {visible.map(entity => (
              <article
                key={entity.id}
                className={`investment-entity ${entity.id === selected ? "is-selected" : ""}`}
              >
                <button
                  type="button"
                  aria-expanded={entity.id === selected}
                  onClick={() => {
                    if (entity.id === selected) setSelected(null);
                    else openEntity(entity.id);
                  }}
                >
                  <span className="investment-entity__mark">
                    {Array.from(entity.name)[0]}
                  </span>
                  <span>
                    <small>
                      {investmentKindLabels[entity.kind]}{" "}
                      {entity.ticker ? `· ${entity.ticker}` : ""}
                    </small>
                    <strong>{entity.name}</strong>
                  </span>
                </button>
                <p>{entity.role}</p>
                <RankingViewCount
                  total={entityViews.counts.get(
                    rankingTargetId({
                      kind: "investment-entity",
                      key: entity.id,
                    })
                  )}
                />
                {entity.metrics.map(metric => (
                  <div
                    className="investment-metric"
                    key={investmentMetricGroup(metric)}
                  >
                    <span>{investmentMetricLabels[metric.key]}</span>
                    <strong>{amount(metric.value, metric.unit)}</strong>
                    <small>
                      วันที่ข้อมูล {metric.asOf} · {metric.basis}
                    </small>
                  </div>
                ))}
              </article>
            ))}
          </div>
          {entityViews.error ? (
            <button
              type="button"
              className="arena-secondary"
              onClick={entityViews.retry}
            >
              ลองโหลดยอดเปิดดูใหม่
            </button>
          ) : null}
          {detail ? (
            <aside
              className="investment-detail"
              aria-label={`รายละเอียด ${detail.name}`}
            >
              <header>
                <h4>{detail.name}</h4>
                <button
                  type="button"
                  className="arena-secondary"
                  onClick={() => setSelected(null)}
                >
                  ปิดรายละเอียด
                </button>
              </header>
              <RankingViewCount
                total={entityViews.counts.get(
                  rankingTargetId({ kind: "investment-entity", key: detail.id })
                )}
              />
              <p>{detail.summary}</p>
              <HedgeFollowReference entityId={detail.id} />
              <div className="investment-facts">
                {detail.facts.map((fact, index) => (
                  <article key={index}>
                    <h5>{fact.label}</h5>
                    <p>{fact.text}</p>
                    <small>
                      วันที่อ้างอิง {fact.asOf} · อ่านแหล่ง{" "}
                      {detail.retrievedAt.slice(0, 10)}
                    </small>
                    <a
                      href={fact.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {fact.sourceTitle}
                      <ExternalLink size={12} />
                    </a>
                    <details>
                      <summary>ข้อความจากแหล่งอ้างอิง</summary>
                      <blockquote>{fact.excerpt}</blockquote>
                    </details>
                  </article>
                ))}
              </div>
              {detail.metrics.length ? (
                <div className="investment-facts">
                  {detail.metrics.map(metric => (
                    <article key={investmentMetricGroup(metric)}>
                      <h5>{investmentMetricLabels[metric.key]}</h5>
                      <strong>{amount(metric.value, metric.unit)}</strong>
                      <p>{metric.basis}</p>
                      <small>วันที่ข้อมูล {metric.asOf}</small>
                      <a
                        href={metric.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {metric.sourceTitle}
                        <ExternalLink size={12} />
                      </a>
                      <blockquote>{metric.excerpt}</blockquote>
                    </article>
                  ))}
                </div>
              ) : null}
              {detail.holdings.length ? (
                <div className="investment-holdings">
                  <h5>
                    บริษัทที่ถือหุ้นตามรายงาน · ตัวอย่าง ไม่ใช่พอร์ตทั้งหมด
                  </h5>
                  {detail.holdings.map((holding, index) => (
                    <article key={index}>
                      <strong>
                        {holding.name}{" "}
                        {holding.ticker ? `(${holding.ticker})` : ""}
                      </strong>
                      <span>
                        {holding.weightPercent === null
                          ? "ไม่ระบุน้ำหนักพอร์ตในข้อมูลนี้"
                          : `น้ำหนักพอร์ต ${amount(holding.weightPercent, "%")}`}
                      </span>
                      <small>วันที่ข้อมูล {holding.asOf}</small>
                      <a
                        href={holding.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        ดูเอกสารถือหุ้น
                        <ExternalLink size={12} />
                      </a>
                      {hedgeFollowStockUrl(holding.ticker) ? (
                        <a
                          href={hedgeFollowStockUrl(holding.ticker)!}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          ค้นผู้ถือหุ้น {holding.ticker} บน HedgeFollow
                          <ExternalLink size={12} />
                        </a>
                      ) : null}
                      {items.find(
                        row =>
                          row.kind === "company" &&
                          row.ticker.split(/\s*\/\s*/).includes(holding.ticker)
                      ) ? (
                        <button
                          type="button"
                          className="arena-secondary"
                          onClick={() => {
                            const company = items.find(
                              row =>
                                row.kind === "company" &&
                                row.ticker
                                  .split(/\s*\/\s*/)
                                  .includes(holding.ticker)
                            );
                            if (company) {
                              setKind("company");
                              openEntity(company.id);
                              setQuery("");
                            }
                          }}
                        >
                          ดูบริษัทนี้
                        </button>
                      ) : null}
                    </article>
                  ))}
                </div>
              ) : null}
              {investorsInDetail.length ? (
                <div className="investment-holdings">
                  <h5>กองทุน / บริษัทที่รายงานการถือหุ้นในบริษัทนี้</h5>
                  {investorsInDetail.map(({ entity, holding }) => (
                    <article key={entity.id}>
                      <strong>{entity.name}</strong>
                      <span>
                        {holding.weightPercent === null
                          ? "ไม่ระบุน้ำหนักพอร์ต"
                          : `น้ำหนักพอร์ต ${amount(holding.weightPercent, "%")}`}{" "}
                        · {holding.asOf}
                      </span>
                      <a
                        href={holding.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        ดูแหล่งถือหุ้น
                        <ExternalLink size={12} />
                      </a>
                      <button
                        type="button"
                        className="arena-secondary"
                        onClick={() => {
                          setKind(entity.kind);
                          openEntity(entity.id);
                          setQuery("");
                        }}
                      >
                        ดูข้อมูลผู้ถือหุ้นรายนี้
                      </button>
                    </article>
                  ))}
                </div>
              ) : null}
              {detail.gaps ? (
                <p className="investment-notice">
                  ข้อมูลที่ยังไม่ระบุ: {detail.gaps}
                </p>
              ) : null}
              <p className="investment-caption">
                การถือหุ้นตามรายงานไม่ใช่การโอนเงินใหม่ให้บริษัทโดยตรง
                และอาจเปลี่ยนหลังวันรายงาน
                ไม่มีข้อมูลพอร์ตส่วนตัวหรือผลตอบแทนส่วนบุคคลที่อนุมานจากบริษัท
              </p>
            </aside>
          ) : null}
          {kind === "fund" && groups.length ? (
            <div className="investment-comparison">
              <h4>จัดลำดับตัวชี้วัดกองทุนที่เทียบกันได้</h4>
              <RankingViewStatus target={groupTarget} state={groupViews} />
              <label>
                รายการ / ฐานการรายงาน / วันที่
                <select
                  aria-label="ตัวชี้วัดกองทุนที่เทียบกันได้"
                  value={activeGroup}
                  onChange={e => setMetricGroup(e.target.value)}
                >
                  {groups.map(([key, metric]) => (
                    <option key={key} value={key}>
                      {investmentMetricLabels[metric.key]} · {metric.basis} ·{" "}
                      {metric.asOf}
                    </option>
                  ))}
                </select>
              </label>
              {ranks.length >= 2 ? (
                <ol>
                  {ranks.map(row => (
                    <li key={row.entity.id}>
                      #{row.rank} {row.entity.name} ·{" "}
                      {amount(row.metric.value, row.metric.unit)}
                    </li>
                  ))}
                </ol>
              ) : (
                <p>
                  ยังจัดอันดับเปรียบเทียบไม่ได้ มีเพียง {ranks.length}{" "}
                  กองทุนในฐานการรายงานและวันที่เดียวกัน
                  ไม่ใช้ข้อมูลต่างวันที่หรือคนละฐานมาจัดอันดับ
                </p>
              )}
              <small>
                ค่าธรรมเนียมน้อยก่อน / สินทรัพย์มากก่อน
                คืออันดับตัวเลขเฉพาะชุดข้อมูล ไม่ใช่กองทุนที่ดีที่สุด
                ไม่ใช่ความมั่งคั่งหรือผลตอบแทนของนักลงทุน
              </small>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
