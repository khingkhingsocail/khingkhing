import { useState } from "react";
import { ExternalLink, X } from "lucide-react";
import {
  investmentKindLabels,
  investmentMetricLabels,
  investmentMetricGroup,
  type InvestmentReference,
} from "../../../../shared/investmentReferences";
import { holdingsDates, holdingsForDate } from "../../lib/investmentDashboard";
import { hedgeFollowStockUrl } from "../../lib/hedgeFollow";

const numeric = (value: number) =>
  new Intl.NumberFormat("th-TH", { maximumFractionDigits: 4 }).format(value);
export function ReportedHoldings({ record }: { record: InvestmentReference }) {
  const dates = holdingsDates(record);
  const [selectedDate, setSelectedDate] = useState(dates[0] ?? "");
  const date = dates.includes(selectedDate) ? selectedDate : (dates[0] ?? "");
  const holdings = holdingsForDate(record, date);
  if (!holdings.length)
    return (
      <p className="idash-muted">
        ยังไม่มีตัวอย่างรายการถือหุ้นในชุดข้อมูลนี้
        ไม่ได้หมายความว่าไม่มีการลงทุน
      </p>
    );
  return (
    <section
      className="idash-holdings"
      aria-label={`หุ้นที่รายงานของ ${record.name}`}
    >
      <div className="idash-subhead">
        <h3>หุ้นที่รายงาน · ตัวอย่างเท่านั้น</h3>
        <label>
          วันที่ข้อมูล
          <select
            aria-label="วันที่รายการถือหุ้น"
            value={date}
            onChange={event => setSelectedDate(event.target.value)}
          >
            {dates.map(value => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="idash-muted">
        สเกลน้ำหนักพอร์ต 0–100% · ไม่ใช่พอร์ตทั้งหมด และไม่ใช่ผลตอบแทน
      </p>
      <div className="idash-weight-scale" aria-hidden="true">
        <span>0%</span>
        <span>50%</span>
        <span>100%</span>
      </div>
      {holdings.map(holding => (
        <article
          className="idash-holding"
          key={`${holding.ticker}-${holding.name}`}
        >
          <div>
            <strong>{holding.ticker || holding.name}</strong>
            <span>{holding.name}</span>
            <b>
              {holding.weightPercent === null
                ? "—"
                : `${numeric(holding.weightPercent)}%`}
            </b>
          </div>
          {holding.weightPercent !== null ? (
            <div
              className="idash-weight-track"
              role="meter"
              aria-label={`น้ำหนัก ${holding.name}`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={holding.weightPercent}
            >
              <span style={{ width: `${holding.weightPercent}%` }} />
            </div>
          ) : (
            <p className="idash-muted">
              ไม่มีน้ำหนักพอร์ตในเอกสารที่ใช้ ไม่แทนด้วยศูนย์
            </p>
          )}
          <small>{holding.asOf}</small>
          <a href={holding.sourceUrl} target="_blank" rel="noopener noreferrer">
            เอกสารต้นทาง
            <ExternalLink size={12} />
          </a>
          {hedgeFollowStockUrl(holding.ticker) ? (
            <a
              href={hedgeFollowStockUrl(holding.ticker)!}
              target="_blank"
              rel="noopener noreferrer"
            >
              ดูผู้ถือหุ้นบน HedgeFollow
              <ExternalLink size={12} />
            </a>
          ) : null}
        </article>
      ))}
    </section>
  );
}

export default function InvestmentDetails({
  record,
  close,
}: {
  record: InvestmentReference;
  close: () => void;
}) {
  return (
    <aside className="idash-detail" aria-label={`รายละเอียด ${record.name}`}>
      <header>
        <div>
          <p className="idash-eyebrow">
            ข้อมูลจากเอกสารทางการ · {investmentKindLabels[record.kind]}
          </p>
          <h2>{record.name}</h2>
        </div>
        <button
          type="button"
          className="idash-icon"
          aria-label="ปิดรายละเอียด"
          onClick={close}
        >
          <X size={20} />
        </button>
      </header>
      <p>{record.summary}</p>
      <div className="idash-detail-metrics">
        {record.metrics.map(metric => (
          <article key={investmentMetricGroup(metric)}>
            <small>{investmentMetricLabels[metric.key]}</small>
            <strong>
              {numeric(metric.value)} {metric.unit}
            </strong>
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
          </article>
        ))}
      </div>
      <ReportedHoldings key={record.id} record={record} />
      <details className="idash-facts">
        <summary>ข้อเท็จจริงและแหล่งข้อมูล</summary>
        {record.facts.map((fact, index) => (
          <article key={index}>
            <h3>{fact.label}</h3>
            <p>{fact.text}</p>
            <small>วันที่อ้างอิง {fact.asOf}</small>
            <a href={fact.sourceUrl} target="_blank" rel="noopener noreferrer">
              {fact.sourceTitle}
              <ExternalLink size={12} />
            </a>
            <blockquote>{fact.excerpt}</blockquote>
          </article>
        ))}
      </details>
      <p className="idash-muted">
        อ่านแหล่งข้อมูล {record.retrievedAt.slice(0, 10)} ·
        ไม่ใช่ข้อมูลเรียลไทม์
      </p>
      {record.gaps ? (
        <details className="idash-facts">
          <summary>ข้อมูลที่ยังไม่มีและข้อจำกัด</summary>
          <p>{record.gaps}</p>
        </details>
      ) : null}
    </aside>
  );
}
