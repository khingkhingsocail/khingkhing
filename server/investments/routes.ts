import type { Express } from "express";
import { getDb } from "../db";
import { investmentPublicReferences } from "../../drizzle/schema";
import { investmentReferenceSchema } from "../../shared/investmentReferences";

export function registerInvestmentReferenceRoutes(app: Express) {
  app.get("/api/investment-references", async (_req, res) => {
    res.set({
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    try {
      const db = await getDb();
      if (!db)
        return res.status(503).json({ error: "ฐานข้อมูลการลงทุนยังไม่พร้อม" });
      const rows = await db
        .select({ payload: investmentPublicReferences.payload })
        .from(investmentPublicReferences)
        .limit(1001);
      if (rows.length > 1000)
        return res
          .status(503)
          .json({ error: "ข้อมูลการลงทุนเกินขอบเขตที่โหลดได้" });
      const items = rows.map(row =>
        investmentReferenceSchema.parse(JSON.parse(row.payload))
      );
      return res.json({ items, total: items.length });
    } catch {
      return res
        .status(503)
        .json({ error: "อ่านข้อมูลการลงทุนไม่สำเร็จ กรุณาลองใหม่" });
    }
  });
}
