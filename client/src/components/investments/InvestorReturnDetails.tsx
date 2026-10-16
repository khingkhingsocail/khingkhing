import { ExternalLink, Info } from "lucide-react";
import {
  returnStatusLabels,
  type InvestorReturn,
} from "../../../../shared/investorReturns";
export function ReturnValue({ record }: { record: InvestorReturn }) {
  return (
    <>
      {new Intl.NumberFormat("th-TH", { maximumFractionDigits: 2 }).format(
        record.reportedValue ?? record.submitted.value
      )}
      %
      <small>
        {record.reportedValue === null
          ? "ค่าที่ผู้ใช้ส่งมา"
          : "ต่อปีตามแหล่งรายงาน"}
      </small>
    </>
  );
}
export default function InvestorReturnDetails({
  record,
}: {
  record: InvestorReturn;
}) {
  return (
    <div className="investor-return-detail">
      <div className="investor-return-result">
        <strong>
          <ReturnValue record={record} />
        </strong>
        <div>
          <b>{record.organization}</b>
          <p>{record.reportedPeriod}</p>
          <p>{record.reportedBasis}</p>
          <span className={`investor-return-status status-${record.status}`}>
            {returnStatusLabels[record.status]}
          </span>
        </div>
      </div>
      <p>{record.summary}</p>
      <div className="investor-return-caveat">
        <Info size={17} />
        <p>
          ตัวเลขเป็นผลงานของบริษัทหรือกองทุนที่เกี่ยวข้อง
          ไม่ใช่ผลตอบแทนส่วนบุคคลของนักลงทุน และไม่ใช่สัญญาผลตอบแทนในอนาคต
          {record.caveats ? ` · ${record.caveats}` : ""}
        </p>
      </div>
      {record.extras.length ? (
        <section>
          <h4>สถิติที่น่าสนใจเพิ่มเติม</h4>
          {record.extras.map((extra, index) => (
            <article className="investor-return-extra" key={index}>
              <h5>{extra.label}</h5>
              <p>{extra.text}</p>
              <span className="investor-return-status">
                {extra.confirmed
                  ? "ตรวจแหล่งอ้างอิงแล้ว"
                  : "ยังยืนยันข้อความนี้ไม่ได้"}
              </span>
              <a
                href={extra.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                อ่านแหล่งอ้างอิง <ExternalLink size={12} />
              </a>
            </article>
          ))}
        </section>
      ) : null}
      <section>
        <h4>แหล่งข้อมูลที่เปิดตรวจแล้ว</h4>
        {record.sources.length ? (
          record.sources.map((source, index) => (
            <article className="investor-return-source" key={index}>
              <a href={source.url} target="_blank" rel="noopener noreferrer">
                {source.title}
                <ExternalLink size={13} />
              </a>
              <small>
                เปิดตรวจ{" "}
                {new Date(source.retrievedAt).toLocaleDateString("th-TH", {
                  timeZone: "Asia/Bangkok",
                })}
              </small>
              <p>{source.supports}</p>
              {source.excerpt ? (
                <details>
                  <summary>ข้อความหลักฐาน / สรุปข้อมูลจากต้นทาง</summary>
                  <p className="investor-return-excerpt">{source.excerpt}</p>
                </details>
              ) : null}
            </article>
          ))
        ) : (
          <p>
            ยังไม่มีแหล่งที่เปิดตรวจยืนยันค่าหรือช่วงเวลาได้
            ตัวเลขในตารางจึงติดป้ายข้อมูลที่ผู้ใช้ส่งมา
          </p>
        )}
      </section>
      <details className="investor-return-submitted">
        <summary>ข้อมูลเดิมที่ส่งมาและลิงก์อ้างอิง</summary>
        <p>
          {record.submitted.value}% ต่อปี · {record.submitted.period} ·{" "}
          {record.submitted.basis}
        </p>
        <a
          href={record.submitted.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          เปิดแหล่งอ้างอิงเดิม
          <ExternalLink size={12} />
        </a>
      </details>
    </div>
  );
}
