import { useEffect, useState } from "react";
import {
  investmentReferenceSchema,
  type InvestmentReference,
} from "../../../shared/investmentReferences";

export function useInvestmentReferences() {
  const [records, setRecords] = useState<InvestmentReference[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [loadedAt, setLoadedAt] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    let timedOut = false;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 15000);
    setLoading(true);
    setError("");
    void fetch("/api/investment-references", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async response => {
        if (!response.ok)
          throw new Error("โหลดข้อมูลในขิงขิงไม่สำเร็จ กรุณาลองใหม่");
        const body = await response.json();
        if (!Array.isArray(body.items))
          throw new Error("รูปแบบข้อมูลลงทุนไม่ถูกต้อง");
        const next = body.items.map((row: unknown) =>
          investmentReferenceSchema.parse(row)
        );
        if (active) {
          setRecords(next);
          setLoadedAt(new Date().toISOString());
        }
      })
      .catch(() => {
        if (active)
          setError(
            timedOut
              ? "การโหลดข้อมูลใช้เวลานานเกินไป กรุณาลองใหม่"
              : "โหลดข้อมูลอ้างอิงไม่สำเร็จ กรุณาลองใหม่"
          );
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
  return {
    records,
    loading,
    error,
    loadedAt,
    reload: () => setRevision(value => value + 1),
  };
}
