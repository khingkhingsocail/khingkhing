import type { Express } from "express";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { arenaPublicReferences } from "../../drizzle/schema";
import { arenaCategories } from "../../shared/arena";
import { arenaReferenceSchema } from "../../shared/arenaReferences";

export function registerArenaReferenceRoutes(app: Express) {
  app.get("/api/arena-references", async (req, res) => {
    res.set({
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    const category =
      typeof req.query.category === "string" ? req.query.category : null;
    if (category && !arenaCategories.some(c => c.id === category))
      return res.status(400).json({ error: "หมวดไม่ถูกต้อง" });
    const db = await getDb();
    if (!db)
      return res
        .status(503)
        .json({ error: "ฐานข้อมูลสถิติอ้างอิงยังไม่พร้อม" });
    try {
      const rows = await db
        .select({ payload: arenaPublicReferences.payload })
        .from(arenaPublicReferences)
        .where(
          category
            ? eq(
                arenaPublicReferences.category,
                category as (typeof arenaCategories)[number]["id"]
              )
            : undefined
        )
        .limit(1001);
      if (rows.length > 1000)
        return res
          .status(503)
          .json({ error: "ข้อมูลอ้างอิงเกินขอบเขต กรุณาเลือกหมวด" });
      const items = rows.map(row =>
        arenaReferenceSchema.parse(JSON.parse(row.payload))
      );
      return res.json({ items, total: items.length });
    } catch {
      return res
        .status(503)
        .json({ error: "อ่านสถิติอ้างอิงไม่สำเร็จ กรุณาลองอีกครั้ง" });
    }
  });
}
