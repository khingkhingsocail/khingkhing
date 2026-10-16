import express, { type Express } from "express";
import { inArray, sql } from "drizzle-orm";
import { rankingViewTotals } from "../../drizzle/schema";
import {
  rankingOpenSchema,
  rankingReadSchema,
  rankingTargetId,
} from "../../shared/rankingViews";
import { getDb } from "../db";
import { rankingTargetExists, recordRankingOpen, targetHash } from "./core";

export function registerRankingViewRoutes(app: Express) {
  const router = express.Router();
  const rates = new Map<string, { count: number; until: number }>();
  let lastCleanup = 0;
  router.use((_req, res, next) => {
    res.set({
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    next();
  });
  router.use((req, res, next) => {
    const now = Date.now();
    for (const [key, state] of rates) if (state.until < now) rates.delete(key);
    const key = req.ip ?? "unknown";
    const state = rates.get(key) ?? { count: 0, until: now + 60000 };
    if (state.count >= 120 || rates.size >= 10000) {
      res.set("Retry-After", "60");
      return res.status(429).json({ error: "เปิดดูถี่เกินไป กรุณารอสักครู่" });
    }
    state.count++;
    rates.set(key, state);
    next();
  });
  router.use(express.json({ limit: "4kb" }));
  router.get("/", async (req, res) => {
    try {
      const input =
        typeof req.query.targets === "string" &&
        req.query.targets.length <= 20000
          ? JSON.parse(req.query.targets)
          : null;
      const parsed = rankingReadSchema.safeParse({ targets: input });
      if (!parsed.success)
        return res.status(400).json({ error: "รายการเปิดดูไม่ถูกต้อง" });
      const db = await getDb();
      if (!db) return res.status(503).json({ error: "โหลดจำนวนเปิดดูไม่ได้" });
      const ids = parsed.data.targets.map(targetHash);
      const rows = await db
        .select({ id: rankingViewTotals.id, total: rankingViewTotals.total })
        .from(rankingViewTotals)
        .where(inArray(rankingViewTotals.id, ids));
      const totals = new Map(rows.map(row => [row.id, row.total]));
      return res.json({
        counts: parsed.data.targets.map(target => ({
          id: rankingTargetId(target),
          total: totals.get(targetHash(target)) ?? 0,
        })),
      });
    } catch {
      return res.status(503).json({ error: "โหลดจำนวนเปิดดูไม่ได้" });
    }
  });
  router.post("/open", async (req, res) => {
    if (req.get("x-khing-views") !== "1")
      return res.status(403).json({ error: "คำขอเปิดดูไม่ถูกต้อง" });
    const parsed = rankingOpenSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: "ข้อมูลเปิดดูไม่ถูกต้อง" });
    try {
      const db = await getDb();
      if (!db)
        return res.status(503).json({ error: "บันทึกจำนวนเปิดดูไม่ได้" });
      if (!(await rankingTargetExists(db, parsed.data.target)))
        return res.status(404).json({ error: "ไม่พบรายการจัดอันดับ" });
      const result = await recordRankingOpen(
        db,
        parsed.data.target,
        parsed.data.eventId
      );
      // Bounded cleanup of anonymous UUIDs only; aggregate counts are never reset.
      if (Date.now() - lastCleanup > 60000) {
        lastCleanup = Date.now();
        await db
          .execute(
            sql`DELETE FROM ranking_view_events WHERE created_at <= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 DAY) LIMIT 500`
          )
          .catch(() => {});
      }
      return res.json({ id: rankingTargetId(parsed.data.target), ...result });
    } catch {
      return res
        .status(503)
        .json({ error: "บันทึกจำนวนเปิดดูไม่ได้ กรุณาลองใหม่" });
    }
  });
  router.use(
    (
      cause: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      if (cause)
        res.status(400).json({ error: "คำขอเปิดดูมีขนาดใหญ่หรือไม่ถูกต้อง" });
    }
  );
  app.use("/api/ranking-views", router);
}
