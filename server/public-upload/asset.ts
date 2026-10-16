import type { Response } from "express";
import { and, eq, sql } from "drizzle-orm";
import { publicMediaChunks } from "../../drizzle/schema";
import { PUBLIC_UPLOAD_CHUNK_BYTES } from "../../shared/publicUpload";
export function chunkSlice(start: number, end: number, sequence: number) {
  const offset = sequence * PUBLIC_UPLOAD_CHUNK_BYTES;
  return {
    start: Math.max(0, start - offset),
    end: Math.min(PUBLIC_UPLOAD_CHUNK_BYTES - 1, end - offset),
  };
}
export async function streamChunkedAsset(
  db: any,
  res: Response,
  id: string,
  size: number,
  mime: string,
  range: { start: number; end: number } | null
) {
  const start = range?.start ?? 0,
    end = range?.end ?? size - 1;
  res
    .status(range ? 206 : 200)
    .set({
      "Content-Type": mime,
      "Accept-Ranges": "bytes",
      "Content-Disposition": "inline",
      "Content-Length": String(end - start + 1),
      ...(range ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}),
    });
  if (res.req.method === "HEAD") {
    res.end();
    return;
  }
  for (
    let sequence = Math.floor(start / PUBLIC_UPLOAD_CHUNK_BYTES);
    sequence <= Math.floor(end / PUBLIC_UPLOAD_CHUNK_BYTES);
    sequence++
  ) {
    if (res.destroyed) return;
    const slice = chunkSlice(start, end, sequence);
    const [part] = await db
      .select({
        data: sql<Buffer>`SUBSTRING(${publicMediaChunks.data}, ${slice.start + 1}, ${slice.end - slice.start + 1})`,
      })
      .from(publicMediaChunks)
      .where(
        and(
          eq(publicMediaChunks.mediaId, id),
          eq(publicMediaChunks.sequence, sequence)
        )
      )
      .limit(1);
    if (!part) {
      res.destroy();
      return;
    }
    const data = Buffer.from(part.data);
    if (data.length !== slice.end - slice.start + 1) {
      res.destroy();
      return;
    }
    if (!res.write(data)) {
      await new Promise<void>(resolve => {
        const done = () => {
          res.off("drain", done);
          res.off("close", done);
          resolve();
        };
        res.once("drain", done);
        res.once("close", done);
        if (res.destroyed) done();
      });
    }
  }
  res.end();
}
