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
  router.post("/suggest", express.json({ limit: "6mb" }), async (req: Request, res: Response) => {
    const filename = safeText(req.body?.filename, 160);
    const mimeType = safeText(req.body?.mimeType, 80);
    const kind = req.body?.kind === "video" ? "วิดีโอ" : "รูปภาพ";
    const mediaDataUrl = typeof req.body?.mediaDataUrl === "string" && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(req.body.mediaDataUrl)
      ? req.body.mediaDataUrl
      : null;
    if (!filename) return res.status(400).json({ error: "ต้องเลือกไฟล์ก่อนให้ AI แนะนำ" });

    try {
      const response = await invokeLLM({
        model: "gemini-3-flash-preview",
        maxTokens: 4000,
        messages: [
          {
            role: "system",
            content:
              "คุณเป็นผู้ช่วยเขียนโพสต์ภาษาไทยสำหรับฟีดสาธารณะ ตอบเป็น JSON ตาม schema เท่านั้น ห้ามกล่าวอ้างสิ่งที่มองไม่เห็นจากชื่อไฟล์ ให้คำแนะนำที่สุภาพ กระชับ และเหมาะกับสื่อประเภทที่ระบุ",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `วิเคราะห์${kind}จากภาพตัวอย่างที่แนบ (ถ้าเป็นวิดีโอคือเฟรมตัวอย่าง) ห้ามระบุตัวตนหรือชื่อบุคคลจากใบหน้า ให้ระบุเฉพาะสิ่งที่เห็นจริง และตอบเป็น JSON object เท่านั้น มีคีย์ title, description, hashtags, mediaType, detectedObjects, animals, plants, actions, scene, colors, provenanceAssessment, provenanceClues, aiOriginAssessment, aiOriginClues, identifiedEntities\nใน identifiedEntities ให้ระบุสิ่งของ สัตว์ หรือพืชที่จำแนกได้ โดยแต่ละรายการมี name (ชื่อทั่วไปภาษาไทย), scientificName (ชื่อวิทยาศาสตร์ถ้าระบุได้), family (ชื่อวงศ์), genus (ชื่อสกุล), category (object/animal/plant) และ confidence (high/medium/low) ห้ามเดาชื่อวิทยาศาสตร์หากภาพไม่พอ ให้ใช้ "ไม่ทราบ" และ confidence low\nประเมินแหล่งที่มาของสื่อโดยใช้ provenanceAssessment ค่าใดค่าหนึ่งเท่านั้น: likely_ai_generated (น่าจะสร้างด้วย AI), likely_edited (น่าจะตัดต่อหรือแก้ไข), likely_camera_original (น่าจะมาจากกล้องและไม่พบสัญญาณการแก้ไข), uncertain (ยังสรุปไม่ได้) ให้เขียนหลักฐานที่สังเกตได้จริงใน provenanceClues และ aiOriginClues ห้ามสรุปยืนยัน 100% จากภาพตัวอย่างเพียงอย่างเดียว โดยเฉพาะวิดีโอที่ส่งมาเพียงเฟรมเดียว\nชื่อไฟล์: ${filename}\nชนิดไฟล์: ${mimeType}\nสร้าง title ภาษาไทยไม่เกิน 100 ตัวอักษร, description ภาษาไทยไม่เกิน 170 ตัวอักษร และ hashtags จำนวน 5 คำพอดี แต่ละคำขึ้นต้นด้วย # ห้ามเว้นวรรคในคำและไม่ซ้ำกัน`,
              },
              ...(mediaDataUrl ? [{ type: "image_url" as const, image_url: { url: mediaDataUrl, detail: "auto" as const } }] : []),
            ],
          },
        ],
        responseFormat: { type: "json_object" },
      });
      const content = response.choices?.[0]?.message?.content;
      let raw: { title?: unknown; description?: unknown; hashtags?: unknown; mediaType?: unknown; detectedObjects?: unknown; animals?: unknown; plants?: unknown; actions?: unknown; scene?: unknown; colors?: unknown; provenanceAssessment?: unknown; provenanceClues?: unknown; aiOriginAssessment?: unknown; aiOriginClues?: unknown; identifiedEntities?: unknown } = {};
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
        mediaType: safeText(raw.mediaType, 80) || kind,
        detectedObjects: Array.isArray(raw.detectedObjects) ? raw.detectedObjects.filter((v): v is string => typeof v === "string").slice(0, 8) : [],
        animals: Array.isArray(raw.animals) ? raw.animals.filter((v): v is string => typeof v === "string").slice(0, 8) : [],
        actions: Array.isArray(raw.actions) ? raw.actions.filter((v): v is string => typeof v === "string").slice(0, 8) : [],
        scene: safeText(raw.scene, 120),
        colors: Array.isArray(raw.colors) ? raw.colors.filter((v): v is string => typeof v === "string").slice(0, 6) : [],
        plants: Array.isArray(raw.plants) ? raw.plants.filter((v): v is string => typeof v === "string").slice(0, 8) : [],
        identifiedEntities: Array.isArray(raw.identifiedEntities) ? raw.identifiedEntities.slice(0, 12).map((entity: any) => ({
          name: safeText(entity?.name, 80) || "ไม่ทราบ",
          scientificName: safeText(entity?.scientificName, 100) || "ไม่ทราบ",
          family: safeText(entity?.family, 80) || "ไม่ทราบ",
          genus: safeText(entity?.genus, 80) || "ไม่ทราบ",
          category: entity?.category === "animal" || entity?.category === "plant" ? entity.category : "object",
          confidence: entity?.confidence === "high" || entity?.confidence === "medium" ? entity.confidence : "low",
        })) : [],
        aiOriginAssessment: raw.aiOriginAssessment === "likely_ai" || raw.aiOriginAssessment === "likely_camera" || raw.aiOriginAssessment === "uncertain" ? raw.aiOriginAssessment : "uncertain",
        aiOriginClues: safeText(raw.aiOriginClues, 240) || "ภาพอย่างเดียวไม่สามารถยืนยันแหล่งที่มาได้ ควรตรวจ metadata หรือไฟล์ต้นฉบับเพิ่มเติม",
        provenanceAssessment: raw.provenanceAssessment === "likely_ai_generated" || raw.provenanceAssessment === "likely_edited" || raw.provenanceAssessment === "likely_camera_original" || raw.provenanceAssessment === "uncertain" ? raw.provenanceAssessment : "uncertain",
        provenanceClues: safeText(raw.provenanceClues, 320) || "ยังไม่พบหลักฐานเพียงพอจากภาพตัวอย่าง ควรตรวจ metadata และไฟล์ต้นฉบับเพิ่มเติม",
      });
    } catch (cause) {
      return fail(res, cause);
    }
  });
  app.use("/api/post-ai", router);
}
