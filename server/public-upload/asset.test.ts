import { describe, it, expect } from "vitest";
import express from "express";
import { createServer } from "node:http";
import { streamChunkedAsset } from "./asset";
import { PUBLIC_UPLOAD_CHUNK_BYTES as C } from "../../shared/publicUpload";
describe("chunked asset responses", () => {
  it("streams full/range/HEAD with bounded SQL chunks", async () => {
    let query = 0;
    const buffers = [Buffer.alloc(C, 1), Buffer.alloc(17, 2)];
    let rangeMode = false;
    const db: any = {
      select: () => {
        const q: any = {
          from: () => q,
          where: () => q,
          limit: () => q,
          then: (r: any) =>
            Promise.resolve([
              {
                data: rangeMode
                  ? query++ === 0
                    ? buffers[0].subarray(C - 10)
                    : buffers[1].subarray(0, 10)
                  : buffers[query++],
              },
            ]).then(r),
        };
        return q;
      },
    };
    const app = express();
    app.get("/asset", async (req, res) => {
      await streamChunkedAsset(
        db,
        res,
        "a".repeat(32),
        C + 17,
        "video/mp4",
        req.get("range") ? { start: C - 10, end: C + 9 } : null
      );
    });
    const server = createServer(app);
    await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
    const url = `http://127.0.0.1:${(server.address() as any).port}/asset`;
    try {
      const full = await fetch(url);
      expect(full.status).toBe(200);
      expect((await full.arrayBuffer()).byteLength).toBe(C + 17);
      expect(query).toBe(2);
      query = 0;
      rangeMode = true;
      const ranged = await fetch(url, {
        headers: { Range: `bytes=${C - 10}-${C + 9}` },
      });
      expect(ranged.status).toBe(206);
      expect(ranged.headers.get("content-range")).toBe(
        `bytes ${C - 10}-${C + 9}/${C + 17}`
      );
      const body = new Uint8Array(await ranged.arrayBuffer());
      expect(Array.from(body)).toEqual([
        ...Array(10).fill(1),
        ...Array(10).fill(2),
      ]);
      query = 0;
      const head = await fetch(url, { method: "HEAD" });
      expect(head.status).toBe(200);
      expect((await head.arrayBuffer()).byteLength).toBe(0);
      expect(query).toBe(0);
    } finally {
      server.closeAllConnections();
      await new Promise<void>(r => server.close(() => r()));
    }
  });
});
