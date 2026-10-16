import { describe, it, expect, vi } from "vitest";
import { expectedChunkSize, storeMediaChunks } from "./storage";
import { chunkSlice } from "./asset";
import {
  MAX_PUBLIC_MEDIA_BYTES,
  PUBLIC_UPLOAD_CHUNK_BYTES,
  publicUploadFileError,
} from "../../shared/publicUpload";
describe("large public uploads", () => {
  it("accepts 1,000MiB, rejects larger/empty, accepts empty MIME and aliases", () => {
    expect(
      publicUploadFileError({
        size: MAX_PUBLIC_MEDIA_BYTES,
        name: "video.MOV",
        type: "",
      })
    ).toBe("");
    expect(
      publicUploadFileError({
        size: MAX_PUBLIC_MEDIA_BYTES + 1,
        name: "v.mp4",
        type: "video/mp4",
      })
    ).toContain("1,000");
    expect(
      publicUploadFileError({ size: 0, name: "photo.png", type: "image/png" })
    ).not.toBe("");
    expect(
      publicUploadFileError({ size: 10, name: "photo", type: "image/jpg" })
    ).toBe("");
    expect(
      publicUploadFileError({ size: 10, name: "x.svg", type: "image/svg+xml" })
    ).not.toBe("");
  });
  it("validates last chunk size and prevents arbitrary indexes", () => {
    expect(expectedChunkSize(1000 * 1024 * 1024, 24)).toBe(
      PUBLIC_UPLOAD_CHUNK_BYTES
    );
    expect(expectedChunkSize(PUBLIC_UPLOAD_CHUNK_BYTES + 17, 1)).toBe(17);
    for (const index of [-1, 1.2, 250])
      expect(expectedChunkSize(MAX_PUBLIC_MEDIA_BYTES, index)).toBe(0);
  });
  it("writes separate packets and roundtrips chunks", async () => {
    const rows: any[] = [];
    const tx = {
      insert: vi.fn(() => ({
        values: async (r: any) => {
          rows.push(r);
        },
      })),
    };
    const input = Buffer.alloc(PUBLIC_UPLOAD_CHUNK_BYTES * 2 + 17, 9);
    await storeMediaChunks(tx, "a".repeat(32), input);
    expect(rows.map(r => r.data.length)).toEqual([
      PUBLIC_UPLOAD_CHUNK_BYTES,
      PUBLIC_UPLOAD_CHUNK_BYTES,
      17,
    ]);
    expect(Buffer.concat(rows.map(r => r.data)).equals(input)).toBe(true);
    expect(rows.map(r => r.sequence)).toEqual([0, 1, 2]);
  });
  it("slices ranges across chunk boundaries", () => {
    expect(
      chunkSlice(
        PUBLIC_UPLOAD_CHUNK_BYTES - 10,
        PUBLIC_UPLOAD_CHUNK_BYTES + 9,
        0
      )
    ).toEqual({
      start: PUBLIC_UPLOAD_CHUNK_BYTES - 10,
      end: PUBLIC_UPLOAD_CHUNK_BYTES - 1,
    });
    expect(
      chunkSlice(
        PUBLIC_UPLOAD_CHUNK_BYTES - 10,
        PUBLIC_UPLOAD_CHUNK_BYTES + 9,
        1
      )
    ).toEqual({ start: 0, end: 9 });
  });
});
