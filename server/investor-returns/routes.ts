import type { Express } from "express";
import { getDb } from "../db";
import { investorReturnReferences } from "../../drizzle/schema";
import { investorReturnSchema } from "../../shared/investorReturns";
export function registerInvestorReturnRoutes(app: Express) {
  app.get("/api/investor-returns", async (_req, res) => {
    res.set({
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    try {
      const db = await getDb();
      if (!db)
        return res.status(503).json({ error: "ฐานข้อมูลผลตอบแทนยังไม่พร้อม" });
      const rows = await db
        .select({ payload: investorReturnReferences.payload })
        .from(investorReturnReferences)
        .limit(501);
      if (rows.length > 500)
        return res
          .status(503)
          .json({ error: "ข้อมูลผลตอบแทนเกินขอบเขตที่โหลดได้" });
      const items = rows.map(row =>
        investorReturnSchema.parse(JSON.parse(row.payload))
      );
      return res.json({ items, total: items.length });
    } catch {
      return res
        .status(503)
        .json({ error: "โหลดผลตอบแทนไม่สำเร็จ กรุณาลองใหม่" });
    }
  });
}
