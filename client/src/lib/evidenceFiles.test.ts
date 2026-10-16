import { describe, expect, it, vi } from "vitest";
import {
  addEvidenceFiles,
  evidenceFileKey,
  uploadEvidenceQueue,
} from "./evidenceFiles";
const file = (
  name: string,
  size = 1024,
  type = "image/png",
  lastModified = 1
) => ({ name, size, type, lastModified });
describe("Evidence attachment selection", () => {
  it("accepts pictures and videos together without changing original queue", () => {
    const existing = [file("image.png")];
    const result = addEvidenceFiles(existing, [
      file("clip.mp4", 2048, "video/mp4"),
    ]);
    expect(result).toHaveLength(2);
    expect(existing).toHaveLength(1);
  });
  it("deduplicates the same file across clicks or drop", () => {
    const image = file("image.png");
    expect(addEvidenceFiles([image], [image])).toHaveLength(1);
    expect(evidenceFileKey(image)).not.toBe(
      evidenceFileKey({ ...image, lastModified: 2 })
    );
  });
  it("rejects unsupported formats and empty files before changing queue", () => {
    for (const invalid of [
      file("script.svg", 10, "image/svg+xml"),
      file("empty.png", 0),
      file("empty-mime.mp4", 10, ""),
    ])
      expect(() => addEvidenceFiles([], [invalid])).toThrow();
  });
  it("accepts exact 20 MiB but rejects any byte over", () => {
    expect(
      addEvidenceFiles([], [file("a.png", 20 * 1024 * 1024)])
    ).toHaveLength(1);
    expect(() =>
      addEvidenceFiles([], [file("a.png", 20 * 1024 * 1024 + 1)])
    ).toThrow("20 MiB");
  });
  it("enforces three files including already uploaded evidence", () => {
    expect(() =>
      addEvidenceFiles([], [file("a.png"), file("b.png")], 2)
    ).toThrow("3 ไฟล์");
    expect(addEvidenceFiles([], [file("a.png")], 2)).toHaveLength(1);
  });
  it("enforces total size including previously uploaded files", () => {
    expect(() =>
      addEvidenceFiles(
        [],
        [file("a.png", 20 * 1024 * 1024)],
        1,
        31 * 1024 * 1024
      )
    ).toThrow("50 MiB");
    expect(
      addEvidenceFiles(
        [],
        [file("a.png", 20 * 1024 * 1024)],
        2,
        30 * 1024 * 1024
      )
    ).toHaveLength(1);
  });
  it("rejects the whole new batch rather than silently partially selecting", () => {
    const original = [file("original.png")];
    expect(() =>
      addEvidenceFiles(original, [
        file("new.png"),
        file("bad.exe", 2, "application/octet-stream"),
      ])
    ).toThrow();
    expect(original.map(f => f.name)).toEqual(["original.png"]);
  });
});
describe("Evidence partial upload retry", () => {
  it("removes only successful files and retry sends only remaining queue", async () => {
    const a = file("a.png"),
      b = file("b.png"),
      c = file("c.png");
    let pending = [a, b, c];
    const upload = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("network failed"));
    const remove = (item: typeof a) => {
      pending = pending.filter(
        f => evidenceFileKey(f) !== evidenceFileKey(item)
      );
    };
    await expect(uploadEvidenceQueue(pending, upload, remove)).rejects.toThrow(
      "network failed"
    );
    expect(pending).toEqual([b, c]);
    expect(upload).toHaveBeenCalledTimes(2);
    const retry = vi.fn().mockResolvedValue({});
    await uploadEvidenceQueue(pending, retry, remove);
    expect(retry.mock.calls.map(args => args[0].name)).toEqual([
      "b.png",
      "c.png",
    ]);
    expect(pending).toHaveLength(0);
  });
  it("never declares upload success when first request fails", async () => {
    const callback = vi.fn();
    await expect(
      uploadEvidenceQueue(
        [file("a.png")],
        async () => {
          throw new Error("denied");
        },
        callback
      )
    ).rejects.toThrow();
    expect(callback).not.toHaveBeenCalled();
  });
});
