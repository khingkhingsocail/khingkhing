import { ExternalLink } from "lucide-react";
import {
  hedgeFollowEntityLink,
  hedgeFollowReference,
} from "../../lib/hedgeFollow";

export default function HedgeFollowReference({
  entityId,
}: {
  entityId?: string;
}) {
  const entityLink = entityId ? hedgeFollowEntityLink(entityId) : null;
  if (entityId && !entityLink) return null;
  return (
    <aside
      className="hedgefollow-reference"
      aria-label="HedgeFollow แหล่งอ้างอิงเพิ่มเติม"
    >
      <header>
        <strong>HedgeFollow</strong>
        <span>แหล่งรวบรวมเพิ่มเติม · ไม่ใช่การรับรองทางการ</span>
      </header>
      {entityLink ? (
        <>
          <a href={entityLink.url} target="_blank" rel="noopener noreferrer">
            {entityLink.label}
            <ExternalLink size={13} />
          </a>
          <p>{entityLink.note}</p>
        </>
      ) : (
        <>
          <p>
            ใช้เปิดดูพอร์ตองค์กรและผู้ถือหุ้นเพิ่มเติม
            ส่วนตัวเลขในขิงขิงยังอ้างอิงเอกสาร SEC และผู้จัดการกองทุนเดิม
            ไม่คัดลอกอันดับหรือผล Performance ของเว็บมาเป็นผลตอบแทนจริงของผู้ใช้
          </p>
          <a
            href={hedgeFollowReference.home}
            target="_blank"
            rel="noopener noreferrer"
          >
            เปิด HedgeFollow
            <ExternalLink size={13} />
          </a>
        </>
      )}
      <details>
        <summary>ข้อจำกัดของข้อมูลและการใช้งาน</summary>
        <p>
          รายงาน 13F เป็นข้อมูล ณ สิ้นไตรมาส โดยทั่วไปยื่นภายใน 45 วัน
          ไม่แสดงสถานะขายชอร์ตและไม่ครอบคลุมสินทรัพย์ทุกชนิด
          จึงไม่ใช่พอร์ตแบบเรียลไทม์หรือผลตอบแทนจริงของบุคคล
        </p>
        <p>
          ขิงขิงใช้เป็นลิงก์อ้างอิงเท่านั้น
          ยังไม่ได้เชื่อมดึงข้อมูลหรือซิงค์อัตโนมัติ การคัดลอกข้อมูล
          การใช้งานเชิงพาณิชย์
          และการเข้าถึงด้วยบอตต้องได้รับอนุญาตตามเงื่อนไขของผู้ให้บริการ
        </p>
        <div className="hedgefollow-reference__links">
          <a
            href={hedgeFollowReference.guide}
            target="_blank"
            rel="noopener noreferrer"
          >
            คู่มือ HedgeFollow
            <ExternalLink size={12} />
          </a>
          <a
            href={hedgeFollowReference.secGuide}
            target="_blank"
            rel="noopener noreferrer"
          >
            ข้อกำหนด 13F ของ SEC
            <ExternalLink size={12} />
          </a>
          <a
            href={hedgeFollowReference.terms}
            target="_blank"
            rel="noopener noreferrer"
          >
            เงื่อนไขการใช้ข้อมูล
            <ExternalLink size={12} />
          </a>
        </div>
      </details>
      <small>
        ตรวจลิงก์และเงื่อนไขวันที่ {hedgeFollowReference.checkedAt} ·
        ไม่ใช่วันที่ข้อมูลพอร์ต
      </small>
    </aside>
  );
}
