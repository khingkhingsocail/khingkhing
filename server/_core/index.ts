import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { publicPlatformScript } from "./publicConfig";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { registerPublicMediaRoutes } from "../media";
import { registerMediaViewRoutes } from "../media-views/routes";
import { registerArenaRoutes } from "../arena";
import { registerChatRoutes } from "../chat/routes";
import { registerCommentRoutes } from "../comments/routes";
import { registerProfileRoutes } from "../profile/routes";
import { registerNotificationRoutes } from "../notifications/routes";
import { registerArenaReferenceRoutes } from "../references/routes";
import { registerInvestmentReferenceRoutes } from "../investments/routes";
import { registerRankingViewRoutes } from "../ranking-views/routes";
import { registerInvestorReturnRoutes } from "../investor-returns/routes";
import { registerPublicUploadRoutes } from "../public-upload/routes";
import { registerFeedPersonalizationRoutes } from "../feed-personalization/routes";
async function startServer() {
  const app = express();
  const server = createServer(app);
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  registerPublicUploadRoutes(app);
  registerPublicMediaRoutes(app);
  registerMediaViewRoutes(app);
  app.use("/api/media", (_req, res) =>
    res.status(404).json({ error: "ไม่พบเส้นทางสื่อที่ร้องขอ" })
  );
  registerArenaRoutes(app);
  registerChatRoutes(app);
  registerCommentRoutes(app);
  registerProfileRoutes(app);
  registerNotificationRoutes(app);
  registerArenaReferenceRoutes(app);
  registerInvestmentReferenceRoutes(app);
  registerRankingViewRoutes(app);
  registerInvestorReturnRoutes(app);
  registerFeedPersonalizationRoutes(app);
  // Media routes above enforce their own raw-body limit before the general API parsers.
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  app.get("/api/platform/config.js", (_req, res) => {
    res
      .set("Cache-Control", "no-store")
      .type("application/javascript")
      .send(publicPlatformScript());
  });
  registerOAuthRoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "ไม่พบ API นี้" })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = Number(process.env.PORT || "3000");
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("Invalid PORT");
  server.on("error", error => {
    console.error("Server failed:", error.message);
    process.exit(1);
  });
  server.listen(port, "0.0.0.0", () =>
    console.log(`Server listening on port ${port}`)
  );
}

startServer().catch(error => {
  console.error(error);
  process.exit(1);
});
