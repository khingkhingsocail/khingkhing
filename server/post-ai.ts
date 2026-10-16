import express, { type Express, type Request, type Response } from "express";
import { invokeLLM } from "./_core/llm";

const safeText = (value: unknown, max: number) =>
  typeof value === "string"
    ? value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max)
    : "";

function fail(res: Response, cause: unknown) {
  console.error("[Post AI] suggestion failed", cause);
  res.status(503).json({ error: "AI ยังไม่พร้อม กรุณาลองใหม่อีกครั้ง" });
}

export function registerPostAIRoutes(app: Express) {
  const router = express.Router();
  router.post("/suggest", express.json({ limit: "8kb" }), async (req: Request, res: Response) => {
    const filename = safeText(req.body?.filename, 160);
    const mimeType = safeText(req.body?.mimeType, 80);
    const kind = req.body?.kind === "video" ? "วิดีโอ" : "รูปภาพ";
    if (!filename) return res.status(400).json({ error: "ต้องเลือกไฟล์ก่อนให้ AI แนะนำ" });

    try {
      const response = await invokeLLM({
        model: "gemini-3-flash-preview",
        maxTokens: 1200,
        messages: [
          {
            role: "system",
            content:
              "คุณเป็นผู้ช่วยเขียนโพสต์ภาษาไทยสำหรับฟีดสาธารณะ ตอบเป็น JSON ตาม schema เท่านั้น ห้ามกล่าวอ้างสิ่งที่มองไม่เห็นจากชื่อไฟล์ ให้คำแนะนำที่สุภาพ กระชับ และเหมาะกับสื่อประเภทที่ระบุ",
          },
          {
            role: "user",
            content: `สร้างคำแนะนำสำหรับโพสต์${kind}\nชื่อไฟล์: ${filename}\nชนิดไฟล์: ${mimeType}\nสร้าง title ภาษาไทยไม่เกิน 100 ตัวอักษร, description ภาษาไทยไม่เกิน 170 ตัวอักษร และ hashtags จำนวน 5 คำพอดี แต่ละคำขึ้นต้นด้วย # ห้ามเว้นวรรคในคำ และไม่ซ้ำกัน`,
          },
        ],
        outputSchema: {
          name: "post_suggestion",
          strict: true,
          schema: {
            type: "object",
            properties: {
              title: { type: "string" },
              description: { type: "string" },
              hashtags: { type: "array", items: { type: "string" }, minItems: 5, maxItems: 5 },
            },
            required: ["title", "description", "hashtags"],
            additionalProperties: false,
          },
        },
      });
      const content = response.choices?.[0]?.message?.content;
      let raw: { title?: unknown; description?: unknown; hashtags?: unknown } = {};
      if (typeof content === "string") {
        try {
          raw = JSON.parse(content) as typeof raw;
        } catch {
          raw = {};
        }
      }
      const hashtags = Array.isArray(raw.hashtags)
        ? raw.hashtags
            .map((tag: unknown) => (typeof tag === "string" ? tag.trim().replace(/^#?/, "#") : ""))
            .filter((tag: string) => /^#[^\s#]{1,30}$/.test(tag))
            .slice(0, 5)
        : [];
      const fallbackTags = ["#ขิงขิง", kind === "วิดีโอ" ? "#วิดีโอ" : "#ภาพถ่าย", "#ผลงาน", "#สร้างสรรค์", "#โพสต์ใหม่"];
      return res.json({
        title: safeText(raw.title, 100) || `โพสต์${kind}ใหม่`,
        description: safeText(raw.description, 170) || `แชร์${kind}จากไฟล์ ${filename}`,
        hashtags: [...hashtags, ...fallbackTags].filter((tag, index, all) => all.indexOf(tag) === index).slice(0, 5),
      });
    } catch (cause) {
      return fail(res, cause);
    }
  });
  app.use("/api/post-ai", router);
}
