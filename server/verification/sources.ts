import { lookup } from "node:dns/promises";
import { createHash } from "node:crypto";
import { Agent, request } from "undici";
import ipaddr from "ipaddr.js";
import * as cheerio from "cheerio";
import type { PublicSource } from "../../shared/verification";

export function isPublicAddress(address: string): boolean {
  try {
    let parsed = ipaddr.parse(address);
    if (
      parsed.kind() === "ipv6" &&
      (parsed as ipaddr.IPv6).isIPv4MappedAddress()
    )
      parsed = (parsed as ipaddr.IPv6).toIPv4Address();
    return parsed.range() === "unicast";
  } catch {
    return false;
  }
}
export function validateSourceUrl(value: string): URL {
  const url = new URL(value);
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port && !["80", "443"].includes(url.port)) ||
    url.hostname === "localhost" ||
    !url.hostname.includes(".")
  )
    throw new Error("ลิงก์หลักฐานไม่ใช่เว็บสาธารณะที่อนุญาต");
  if (
    ipaddr.isValid(url.hostname.replace(/^\[|\]$/g, "")) &&
    !isPublicAddress(url.hostname.replace(/^\[|\]$/g, ""))
  )
    throw new Error("ไม่อนุญาตลิงก์เครือข่ายภายใน");
  return url;
}
export function sourceTier(hostname: string): PublicSource["tier"] {
  const host = hostname.toLowerCase();
  const matches = (domain: string) =>
    host === domain || host.endsWith("." + domain);
  if (
    [
      "worldathletics.org",
      "guinnessworldrecords.com",
      "olympics.com",
      "olympics.org",
      "sec.gov",
      "set.or.th",
    ].some(matches)
  )
    return "institution";
  if (
    ["youtube.com", "tiktok.com", "instagram.com", "facebook.com"].some(matches)
  )
    return "platform";
  return "other";
}
export async function readPublicSource(
  value: string,
  outerSignal?: AbortSignal
): Promise<PublicSource> {
  let url = validateSourceUrl(value);
  const signal = outerSignal
    ? AbortSignal.any([outerSignal, AbortSignal.timeout(12000)])
    : AbortSignal.timeout(12000);
  for (let redirect = 0; redirect < 4; redirect++) {
    const resolved = await lookup(url.hostname, { all: true });
    if (!resolved.length || resolved.some(r => !isPublicAddress(r.address)))
      throw new Error("ไม่อนุญาตปลายทาง private IP");
    const pinned = resolved[0];
    const agent = new Agent({
      connect: {
        lookup: (_hostname, options, callback) => {
          if (typeof options === "object" && options.all)
            callback(null, [
              { address: pinned.address, family: pinned.family },
            ]);
          else callback(null, pinned.address, pinned.family);
        },
        timeout: 8000,
      },
    });
    try {
      const response = await request(url, {
        dispatcher: agent,
        signal,
        headers: {
          "user-agent": "KhingKhing-EvidenceReview/1.0",
          accept: "text/html,text/plain",
          "accept-encoding": "identity",
        },
        headersTimeout: 8000,
        bodyTimeout: 8000,
      });
      if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
        const location = response.headers.location;
        response.body.destroy();
        if (!location || typeof location !== "string")
          throw new Error("เว็บ redirect ไม่ถูกต้อง");
        url = validateSourceUrl(new URL(location, url).toString());
        continue;
      }
      if (response.statusCode !== 200) {
        response.body.destroy();
        throw new Error("อ่านหน้าอ้างอิงไม่ได้");
      }
      const contentType = String(response.headers["content-type"] ?? "");
      if (!/text\/html|text\/plain/.test(contentType)) {
        response.body.destroy();
        throw new Error("รองรับเว็บข้อความ/HTML เท่านั้น");
      }
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const part of response.body) {
        size += part.length;
        if (size > 1024 * 1024) {
          response.body.destroy();
          throw new Error("หน้าเว็บใหญ่เกินขอบเขตตรวจ");
        }
        chunks.push(Buffer.from(part));
      }
      const html = Buffer.concat(chunks).toString("utf8");
      const $ = cheerio.load(html);
      $("script,style,noscript,iframe,nav,footer").remove();
      const title = $("title").text().trim().slice(0, 200) || url.hostname;
      const text = ($("main").text() || $("article").text() || $("body").text())
        .replace(/\s+/g, " ")
        .trim();
      if (text.length < 80)
        throw new Error("หน้าเว็บไม่มีข้อความหลักฐานที่อ่านได้");
      const excerpt = text.slice(0, 18000);
      return {
        url: url.toString(),
        title,
        excerpt,
        retrievedAt: new Date().toISOString(),
        sha256: createHash("sha256").update(excerpt).digest("hex"),
        tier: sourceTier(url.hostname),
      };
    } finally {
      await agent.close();
    }
  }
  throw new Error("redirect มากเกินไป");
}
