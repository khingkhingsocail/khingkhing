import { describe, expect, it } from "vitest";
import {
  detectPublicMediaKind,
  MAX_PUBLIC_MEDIA_BYTES,
  parsePublicMediaRange,
} from "./media";

describe("public media upload validation", () => {
  it("uses a 1,000 MiB cap for chunked public uploads", () => {
    expect(MAX_PUBLIC_MEDIA_BYTES).toBe(1000 * 1024 * 1024);
  });

  it("recognizes the allowed media signatures (header check, not a full decoder)", () => {
    expect(
      detectPublicMediaKind(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), "image/jpeg")
    ).toBe("image");
    expect(
      detectPublicMediaKind(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        "image/png"
      )
    ).toBe("image");
    expect(
      detectPublicMediaKind(Buffer.from("RIFF0000WEBP", "ascii"), "image/webp")
    ).toBe("image");
    expect(
      detectPublicMediaKind(Buffer.from("0000ftypisom", "ascii"), "video/mp4")
    ).toBe("video");
    expect(
      detectPublicMediaKind(
        Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x00]),
        "video/webm"
      )
    ).toBe("video");
  });

  it("rejects MIME spoofing and unsupported formats", () => {
    expect(
      detectPublicMediaKind(Buffer.from("not an image"), "image/png")
    ).toBeNull();
    expect(
      detectPublicMediaKind(
        Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
        "image/svg+xml"
      )
    ).toBeNull();
  });
});

describe("public media byte ranges", () => {
  it("supports explicit, open-ended, and suffix ranges", () => {
    expect(parsePublicMediaRange("bytes=10-19", 100)).toEqual({
      start: 10,
      end: 19,
    });
    expect(parsePublicMediaRange("bytes=90-", 100)).toEqual({
      start: 90,
      end: 99,
    });
    expect(parsePublicMediaRange("bytes=-10", 100)).toEqual({
      start: 90,
      end: 99,
    });
  });

  it("rejects malformed, multiple, and unsatisfiable ranges", () => {
    expect(parsePublicMediaRange(undefined, 100)).toBeNull();
    expect(parsePublicMediaRange("bytes=100-", 100)).toBe("invalid");
    expect(parsePublicMediaRange("bytes=5-4", 100)).toBe("invalid");
    expect(parsePublicMediaRange("bytes=1-2,4-5", 100)).toBe("invalid");
  });
});
