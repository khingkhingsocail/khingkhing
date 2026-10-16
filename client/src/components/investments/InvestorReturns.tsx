import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowUpDown,
  RefreshCw,
  Search,
  TrendingUp,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import {
  filterInvestorReturns,
  investorReturnSchema,
  returnStatusLabels,
  type InvestorReturn,
  type ReturnSort,
} from "../../../../shared/investorReturns";
import {
  captureMenuReturn,
  restoreMenuReturn,
  type MenuReturn,
} from "../../lib/returnToMenu";
import InvestorReturnDetails, { ReturnValue } from "./InvestorReturnDetails";
import "./investor-returns.css";

export function InvestorReturnsTable({
  records,
  onOpen,
  query,
  sort,
}: {
  records: InvestorReturn[];
  onOpen: (record: InvestorReturn, opener: HTMLButtonElement) => void;
  query: string;
  sort: ReturnSort;
}) {
  const rows = filterInvestorReturns(records, query, sort);
  return (
    <>
      {!rows.length ? (
        <p className="investor-returns-empty" role="status">
          ยังไม่มีข้อมูลที่ตรงกับชื่อที่ค้นหา
        </p>
      ) : (
        <div
          className="investor-returns-scroll"
          tabIndex={0}
          role="region"
          aria-label="ตารางผลตอบแทน เลื่อนซ้ายขวาได้"
        >
          <table>
            <caption>
              ผลตอบแทนในอดีตของบริษัทและกองทุน · ต่างช่วงเวลาและค่าธรรมเนียม
              ไม่ใช่อันดับความเก่งของนักลงทุน
            </caption>
            <thead>
              <tr>
                <th
                  scope="col"
                  aria-sort={sort === "name" ? "ascending" : "none"}
                >
                  นักลงทุน
                </th>
                <th scope="col">บริษัท / กองทุน</th>
                <th scope="col">ช่วงเวลาที่วัด</th>
                <th
                  scope="col"
                  aria-sort={
                    sort === "value-desc"
                      ? "descending"
                      : sort === "value-asc"
                        ? "ascending"
                        : "none"
                  }
                >
                  ผลตอบแทนเฉลี่ยต่อปี
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(record => (
                <tr key={record.id}>
                  <td>
                    <button
                      type="button"
                      className="investor-return-name"
                      onClick={event => onOpen(record, event.currentTarget)}
                      aria-haspopup="dialog"
                    >
                      <span>
                        {record.investor
                          .split(" ")
                          .map(part => part[0])
                          .slice(0, 2)
                          .join("")}
                      </span>
                      <strong>{record.investor}</strong>
                    </button>
                  </td>
                  <td>{record.organization}</td>
                  <td>{record.reportedPeriod}</td>
                  <td>
                    <b className="investor-return-value">
                      <ReturnValue record={record} />
                    </b>
                    <small>{record.reportedBasis}</small>
                    <span
                      className={`investor-return-status status-${record.status}`}
                    >
                      {returnStatusLabels[record.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
export default function InvestorReturns() {
  const [records, setRecords] = useState<InvestorReturn[]>([]);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [revision, setRevision] = useState(0),
    [query, setQuery] = useState(""),
    [sort, setSort] = useState<ReturnSort>("name");
  const [selected, setSelected] = useState<InvestorReturn | null>(null),
    [open, setOpen] = useState(false);
  const returnRef = useRef<MenuReturn | null>(null);
  const titleId = useId();
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timer = setTimeout(() => controller.abort(), 15000);
    setLoading(true);
    setError("");
    fetch("/api/investor-returns", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async response => {
        if (!response.ok) throw Error("โหลดข้อมูลผลตอบแทนไม่สำเร็จ");
        const body = await response.json();
        if (!Array.isArray(body.items) || body.items.length > 500)
          throw Error("ข้อมูลผลตอบแทนไม่ถูกต้อง");
        return body.items.map((row: unknown) =>
          investorReturnSchema.parse(row)
        );
      })
      .then(rows => {
        if (active) setRecords(rows);
      })
      .catch(() => {
        if (active) setError("โหลดผลตอบแทนไม่สำเร็จ กรุณาลองใหม่");
      })
      .finally(() => {
        clearTimeout(timer);
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [revision]);
  const summary = useMemo(
    () => records.filter(row => row.status === "confirmed").length,
    [records]
  );
  function openRecord(record: InvestorReturn, opener: HTMLButtonElement) {
    returnRef.current = captureMenuReturn(opener);
    setSelected(record);
    setOpen(true);
  }
  return (
    <section className="investor-returns" aria-labelledby={titleId}>
      <header>
        <div>
          <p>
            <TrendingUp size={14} /> LONG-TERM TRACK RECORDS
          </p>
          <h3 id={titleId}>ผลงานระยะยาวของนักลงทุน</h3>
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={() => setRevision(value => value + 1)}
        >
          <RefreshCw size={14} />
          {loading ? "กำลังโหลด…" : "โหลดใหม่"}
        </button>
      </header>
      <p className="investor-returns-notice">
        ข้อมูลที่คุณส่งมา พร้อมผลตรวจแหล่งอ้างอิง · แตะชื่อเพื่อเปิดรายละเอียด
        แล้วปิดกลับเมนูเดิมได้ ไม่รวมกับผลตอบแทนรายเดือนของผู้แข่งขัน
      </p>
      <div className="investor-returns-controls">
        <label>
          <Search size={15} />
          <input
            type="search"
            value={query}
            maxLength={100}
            onChange={event => setQuery(event.target.value)}
            placeholder="ค้นชื่อนักลงทุนหรือกองทุน"
            aria-label="ค้นผลตอบแทนนักลงทุน"
          />
        </label>
        <label>
          <ArrowUpDown size={14} />
          <select
            value={sort}
            onChange={event => setSort(event.target.value as ReturnSort)}
            aria-label="เรียงตารางผลตอบแทน"
          >
            <option value="name">เรียงชื่อ A → Z</option>
            <option value="value-desc">ตัวเลขผลตอบแทน มาก → น้อย</option>
            <option value="value-asc">ตัวเลขผลตอบแทน น้อย → มาก</option>
          </select>
        </label>
      </div>
      {loading ? (
        <p role="status" className="investor-returns-empty">
          กำลังโหลดผลตอบแทนจากฐานข้อมูล…
        </p>
      ) : error ? (
        <p role="alert" className="investor-returns-empty">
          {error}
          <button type="button" onClick={() => setRevision(value => value + 1)}>
            ลองใหม่
          </button>
        </p>
      ) : (
        <>
          <p className="investor-returns-caption">
            {records.length} รายการ · ตรวจค่าและช่วงเวลาได้ครบ {summary} รายการ
            · ลำดับตัวเลขไม่ใช่อันดับความเก่ง
            รายการที่ยังตรวจไม่ได้อยู่ท้ายเมื่อเรียงตัวเลข
          </p>
          <InvestorReturnsTable
            records={records}
            onOpen={openRecord}
            query={query}
            sort={sort}
          />
        </>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="investor-return-dialog"
          showCloseButton={false}
          onCloseAutoFocus={event => {
            event.preventDefault();
            const snapshot = returnRef.current;
            if (snapshot)
              requestAnimationFrame(() => restoreMenuReturn(snapshot));
          }}
        >
          <div className="investor-return-dialog-top">
            <DialogClose asChild>
              <button type="button">
                <ArrowLeft size={16} />
                ปิด / กลับเมนูเดิม
              </button>
            </DialogClose>
            <DialogClose asChild>
              <button type="button" aria-label="ปิดรายละเอียดผลตอบแทน">
                <X size={19} />
              </button>
            </DialogClose>
          </div>
          <DialogHeader>
            <DialogTitle>
              {selected?.investor ?? "รายละเอียดผลตอบแทน"}
            </DialogTitle>
            <DialogDescription>
              ผลงานของบริษัทหรือกองทุนตามช่วงเวลาและฐานที่รายงาน
              ไม่ใช่ผลตอบแทนส่วนบุคคล
            </DialogDescription>
          </DialogHeader>
          <div className="investor-return-dialog-body">
            {selected ? <InvestorReturnDetails record={selected} /> : null}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
