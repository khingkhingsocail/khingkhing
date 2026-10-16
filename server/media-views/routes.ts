import express, { type Express } from "express";
import { eq, sql } from "drizzle-orm";
import { publicMedia, publicMediaViewTotals } from "../../drizzle/schema";
import {
  mediaViewInputSchema,
  publicMediaIdSchema,
} from "../../shared/mediaViews";
import { getDb } from "../db";
import { recordMediaView } from "./core";

export function registerMediaViewRoutes(app: Express) {
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
  router.get("/:id", async (req, res) => {
    if (!publicMediaIdSchema.safeParse(req.params.id).success)
      return res.status(404).json({ error: "ไม่พบโพสต์นี้" });
    try {
      const db = await getDb();
      if (!db) return res.status(503).json({ error: "โหลดยอดวิวไม่สำเร็จ" });
      const [row] = await db
        .select({ id: publicMedia.id, total: publicMediaViewTotals.total })
        .from(publicMedia)
        .leftJoin(
          publicMediaViewTotals,
          eq(publicMedia.id, publicMediaViewTotals.mediaId)
        )
        .where(eq(publicMedia.id, req.params.id))
        .limit(1);
      if (!row) return res.status(404).json({ error: "ไม่พบโพสต์นี้" });
      return res.json({
        mediaId: row.id,
        viewCount: row.total ?? 0,
        counted: false,
      });
    } catch {
      return res.status(503).json({ error: "โหลดยอดวิวไม่สำเร็จ" });
    }
  });
  router.post(
    "/:id",
    (req, res, next) => {
      if (req.get("X-Khing-Media-View") !== "1")
        return res.status(403).json({ error: "คำขอวิวไม่ถูกต้อง" });
      if (!publicMediaIdSchema.safeParse(req.params.id).success)
        return res.status(404).json({ error: "ไม่พบโพสต์นี้" });
      const now = Date.now();
      for (const [key, state] of rates)
        if (state.until <= now) rates.delete(key);
      const key = req.ip ?? "unknown";
      const state = rates.get(key) ?? { count: 0, until: now + 60000 };
      if (state.count >= 60 || (!rates.has(key) && rates.size >= 10000)) {
        res.set("Retry-After", "60");
        return res
          .status(429)
          .json({ error: "ดูโพสต์ถี่เกินไป กรุณารอสักครู่" });
      }
      state.count++;
      rates.set(key, state);
      next();
    },
    express.json({ limit: "1kb" }),
    async (req, res) => {
      const parsed = mediaViewInputSchema.safeParse(req.body);
      if (!parsed.success)
        return res.status(400).json({ error: "ข้อมูลวิวไม่ถูกต้อง" });
      try {
        const db = await getDb();
        if (!db)
          return res.status(503).json({ error: "บันทึกยอดวิวไม่สำเร็จ" });
        const result = await recordMediaView(
          db,
          req.params.id,
          parsed.data.eventId
        );
        if (!result) return res.status(404).json({ error: "ไม่พบโพสต์นี้" });
        // Bounded, opportunistic cleanup of expired anonymous event UUIDs only.
        if (Date.now() - lastCleanup > 60000) {
          lastCleanup = Date.now();
          await db
            .execute(
              sql`DELETE FROM public_media_view_events WHERE created_at <= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 DAY) LIMIT 500`
            )
            .catch(() => {});
        }
        return res.json(result);
      } catch {
        return res
          .status(503)
          .json({ error: "บันทึกยอดวิวไม่สำเร็จ กรุณาลองใหม่" });
      }
    }
  );
  router.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      if (error)
        res.status(400).json({ error: "คำขอวิวใหญ่เกินไปหรือไม่ถูกต้อง" });
    }
  );
  app.use("/api/media-views", router);
}
