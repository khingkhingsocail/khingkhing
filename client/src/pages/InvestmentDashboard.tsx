import { useEffect } from "react";
import { Link } from "wouter";
import {
  ArrowLeft,
  ArrowUpRight,
  Database,
  FileText,
  Landmark,
  LayoutDashboard,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
  Users,
} from "lucide-react";
import { useInvestmentReferences } from "../hooks/useInvestmentReferences";
import {
  dashboardSummary,
  featuredInvestmentReferences,
} from "../lib/investmentDashboard";
import { hedgeFollowReference } from "../lib/hedgeFollow";
import InvestmentDataExplorer from "../components/investments/InvestmentDataExplorer";
import InvestorReturns from "../components/investments/InvestorReturns";
import "../components/investments/investment-dashboard.css";

export function FeaturedInvestmentCards() {
  return (
    <div className="idash-featured">
      {featuredInvestmentReferences.map((reference, index) => (
        <article key={reference.id}>
          <div className="idash-featured-top">
            <span className="idash-organization-mark">
              {reference.initials}
            </span>
            <span className="idash-chip">รายชื่ออ้างอิง · ไม่ใช่อันดับ</span>
          </div>
          <p className="idash-featured-person">{reference.person}</p>
          <h3>{reference.organization}</h3>
          <p className="idash-featured-note">{reference.note}</p>
          <dl>
            <div>
              <dt>มูลค่าพอร์ต 13F</dt>
              <dd>—</dd>
            </div>
            <div>
              <dt>Performance</dt>
              <dd>—</dd>
            </div>
            <div>
              <dt>จำนวนหลักทรัพย์</dt>
              <dd>—</dd>
            </div>
          </dl>
          <p className="idash-pending-caption">
            รอข้อมูลจากช่องทาง HedgeFollow ที่อนุญาต
          </p>
          <a href={reference.url} target="_blank" rel="noopener noreferrer">
            เปิดหน้าอ้างอิง
            <ArrowUpRight size={16} />
            <span className="idash-featured-number" aria-hidden="true">
              0{index + 1}
            </span>
          </a>
        </article>
      ))}
    </div>
  );
}
export default function InvestmentDashboard() {
  const data = useInvestmentReferences();
  const summary = dashboardSummary(data.records);
  const ready = !data.loading && !data.error;
  useEffect(() => {
    const previous = document.title;
    document.title = "ขิงขิง — แดชบอร์ดนักลงทุนและกองทุน";
    return () => {
      document.title = previous;
    };
  }, []);
  return (
    <div className="idash">
      <a className="idash-skip" href="#investment-main">
        ข้ามไปเนื้อหาแดชบอร์ด
      </a>
      <aside className="idash-rail">
        <Link className="idash-brand" href="/feed">
          <span>ข</span>
          <div>
            ขิงขิง<small>INVESTMENT ARENA</small>
          </div>
        </Link>
        <p className="idash-rail-label">EXPLORE THE CAPITAL</p>
        <nav aria-label="เมนูแดชบอร์ด">
          <a href="#investment-overview">
            <LayoutDashboard size={17} />
            ภาพรวม
          </a>
          <a href="#investment-featured">
            <Users size={17} />
            รายชื่อเด่น
          </a>
          <a href="#investment-data">
            <Landmark size={17} />
            ข้อมูลในขิงขิง
          </a>
          <a href="#investment-returns">
            <TrendingUp size={17} />
            ผลตอบแทนระยะยาว
          </a>
          <a href="#investment-sources">
            <ShieldCheck size={17} />
            แหล่งข้อมูล
          </a>
        </nav>
        <div className="idash-rail-bottom">
          <p>
            ดูข้อมูลให้ชัด
            <br />
            ก่อนเปรียบเทียบผลงาน
          </p>
          <Link href="/feed">
            <ArrowLeft size={15} />
            กลับฟีดขิงขิง
          </Link>
        </div>
      </aside>
      <main id="investment-main" className="idash-main" tabIndex={-1}>
        <header className="idash-topbar">
          <span>
            <TrendingUp size={15} /> KHING KHING / INVESTMENTS
          </span>
          <Link href="/feed">
            <ArrowLeft size={14} />
            กลับเข้าแอป
          </Link>
        </header>
        <section id="investment-overview" className="idash-overview">
          <div>
            <p className="idash-eyebrow">INVESTOR & FUND INTELLIGENCE</p>
            <h1>
              มองพอร์ตใหญ่
              <br />
              <em>เห็นภาพการลงทุน</em>
            </h1>
            <p className="idash-lead">
              นักลงทุนและองค์กรเด่นที่อ้างอิงจาก HedgeFollow
              <br />
              พร้อมข้อมูลจากเอกสารทางการที่มีอยู่ในขิงขิง
            </p>
          </div>
          <aside className="idash-connection">
            <span className="idash-chip idash-chip--pending">
              เวอร์ชันเบื้องต้น
            </span>
            <h2>HedgeFollow</h2>
            <p>
              <span className="idash-dot" />
              รอคู่มือเชื่อมต่อข้อมูล
            </p>
            <small>
              คุณระบุว่ามีสิทธิ์ใช้งานแล้ว
              แต่ยังไม่ได้ส่งเอกสารหรือวิธีเชื่อมต่อ จึงยังไม่แสดงตัวเลขจาก
              HedgeFollow ในหน้านี้
            </small>
            <a
              href={hedgeFollowReference.home}
              target="_blank"
              rel="noopener noreferrer"
            >
              เปิดเว็บไซต์อ้างอิง
              <ArrowUpRight size={16} />
            </a>
          </aside>
        </section>
        <div className="idash-summary" aria-label="สรุปขอบเขตข้อมูล">
          <article>
            <Users size={18} />
            <span>รายชื่อเด่นอ้างอิง</span>
            <strong>{featuredInvestmentReferences.length}</strong>
            <small>รายการที่คัดเลือก ไม่ใช่อันดับ</small>
          </article>
          <article>
            <Database size={18} />
            <span>ข้อมูลทางการในขิงขิง</span>
            <strong>{ready ? summary.records : "—"}</strong>
            <small>เฉพาะชุดข้อมูลที่โหลดสำเร็จ</small>
          </article>
          <article>
            <Landmark size={18} />
            <span>กองทุน ETF ในชุดข้อมูล</span>
            <strong>{ready ? summary.funds : "—"}</strong>
            <small>ไม่ใช่จำนวนกองทุนบน HedgeFollow</small>
          </article>
          <article>
            <FileText size={18} />
            <span>ตัวอย่างรายการถือหุ้น</span>
            <strong>{ready ? summary.holdingExamples : "—"}</strong>
            <small>นับรายงาน ไม่ใช่หุ้นที่ไม่ซ้ำกัน</small>
          </article>
        </div>
        <section id="investment-featured">
          <div className="idash-section-heading">
            <div>
              <p className="idash-eyebrow">FEATURED REFERENCES</p>
              <h2>นักลงทุนและองค์กรเด่น</h2>
            </div>
            <span className="idash-chip">HedgeFollow · ลิงก์อ้างอิง</span>
          </div>
          <p className="idash-muted">
            ชื่อบุคคลตามรายการของเว็บอ้างอิง ไม่ยืนยันว่าเป็นผู้จัดการปัจจุบัน
            ตัวเลขที่ยังไม่ได้เชื่อมแสดง — ไม่ใช่ศูนย์
          </p>
          <FeaturedInvestmentCards />
        </section>
        <section id="investment-returns">
          <InvestorReturns />
        </section>
        <section id="investment-data">
          <div className="idash-section-heading">
            <div>
              <p className="idash-eyebrow">AVAILABLE IN KHING KHING</p>
              <h2>ข้อมูลอ้างอิงที่เปิดดูได้แล้ว</h2>
            </div>
            <button type="button" disabled={data.loading} onClick={data.reload}>
              <RefreshCw size={15} />
              {data.loading ? "กำลังโหลด…" : "โหลดข้อมูลขิงขิงใหม่"}
            </button>
          </div>
          <p className="idash-muted">
            ส่วนนี้อ่านจากฐานข้อมูลขิงขิง โดยอ้างอิง SEC และเอกสารผู้ออกกองทุน
            ไม่ใช่ข้อมูลที่นำเข้าจาก HedgeFollow
          </p>
          {data.loading ? (
            <div className="idash-empty" role="status">
              กำลังโหลดข้อมูลอ้างอิงจากฐานข้อมูล…
            </div>
          ) : data.error ? (
            <div className="idash-empty" role="alert">
              <p>{data.error}</p>
              <button type="button" onClick={data.reload}>
                ลองโหลดอีกครั้ง
              </button>
            </div>
          ) : (
            <InvestmentDataExplorer records={data.records} />
          )}
          {ready && data.loadedAt ? (
            <p className="idash-load-caption">
              โหลดจากฐานข้อมูล {new Date(data.loadedAt).toLocaleString("th-TH")}{" "}
              · ไม่ใช่วันข้อมูลพอร์ต และไม่ได้ซิงค์ HedgeFollow
            </p>
          ) : null}
        </section>
        <section id="investment-sources" className="idash-source-panel">
          <div>
            <ShieldCheck size={22} />
            <h2>รู้ที่มา ก่อนเทียบตัวเลข</h2>
            <p>
              ข้อมูล 13F มีระยะเวลารายงาน ไม่ครอบคลุมสินทรัพย์ทุกชนิด
              และไม่ใช่พอร์ตเรียลไทม์
              มูลค่าพอร์ตองค์กรไม่ใช่ทรัพย์สินหรือผลตอบแทนส่วนบุคคล
            </p>
          </div>
          <div>
            <h3>แหล่งข้อมูลและขั้นตอนถัดไป</h3>
            <p>
              ขั้นต่อไปคือเชื่อม API หรือชุดข้อมูลที่อนุญาตตามเอกสาร HedgeFollow
              พร้อมเก็บไตรมาส วันที่ และวิธีคำนวณ
              ในระหว่างนี้ไม่มีการดึงข้อมูลหรืออัปเดตอัตโนมัติ
            </p>
            <a
              href={hedgeFollowReference.guide}
              target="_blank"
              rel="noopener noreferrer"
            >
              คู่มือ HedgeFollow
              <ArrowUpRight size={14} />
            </a>
            <a
              href={hedgeFollowReference.secGuide}
              target="_blank"
              rel="noopener noreferrer"
            >
              ข้อมูล Form 13F จาก SEC
              <ArrowUpRight size={14} />
            </a>
            <a
              href={hedgeFollowReference.terms}
              target="_blank"
              rel="noopener noreferrer"
            >
              เงื่อนไขผู้ให้บริการ
              <ArrowUpRight size={14} />
            </a>
          </div>
        </section>
        <footer className="idash-footer">
          <strong>KHING KHING ARENA</strong>
          <span>
            ข้อมูลเพื่อการศึกษา ไม่ใช่คำแนะนำซื้อขาย ·
            ไม่ใช่บัญชีหรือผลงานของผู้ใช้ในแอป
          </span>
        </footer>
      </main>
    </div>
  );
}
