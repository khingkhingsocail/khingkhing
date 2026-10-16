import { afterEach, describe, expect, it, vi } from "vitest";
import { MediaViewSession, recordPublicMediaView } from "./mediaViews";
import { isPublicMediaSummary } from "./publicMedia";
const mediaId = "a".repeat(32);
afterEach(() => vi.unstubAllGlobals());
describe("media view session", () => {
  it("coalesces concurrent qualifications and loop/remount attempts within the feed", async () => {
    const send = vi.fn(async () => ({ mediaId, viewCount: 1, counted: true }));
    const session = new MediaViewSession(send, () => "event-1");
    await Promise.all([session.record(mediaId), session.record(mediaId)]);
    await session.record(mediaId);
    expect(send).toHaveBeenCalledTimes(1);
    expect(session.hasRecorded(mediaId)).toBe(true);
  });
  it("retries only the failed event with the original UUID", async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValue({ mediaId, viewCount: 5, counted: false });
    const session = new MediaViewSession(send, () => "same-event");
    await expect(session.record(mediaId)).rejects.toThrow();
    expect(session.hasQualified(mediaId)).toBe(true);
    expect(session.hasRecorded(mediaId)).toBe(false);
    await session.record(mediaId);
    expect(send.mock.calls.map(c => c[1])).toEqual([
      "same-event",
      "same-event",
    ]);
  });
  it("new feed visits use new events and different posts never share results", async () => {
    const send = vi.fn(async (id: string) => ({
      mediaId: id,
      viewCount: 1,
      counted: true,
    }));
    const session = new MediaViewSession(send, () => "event-a");
    await session.record(mediaId);
    await session.record("b".repeat(32));
    await new MediaViewSession(send, () => "event-b").record(mediaId);
    expect(send).toHaveBeenCalledTimes(3);
  });
  it("validates server totals and does not send personal identifiers", async () => {
    const fetchMock = vi.fn(async (_url: string, _options: RequestInit) => ({
      ok: true,
      json: async () => ({ mediaId, viewCount: 8, counted: true }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    expect((await recordPublicMediaView(mediaId, "test-event")).viewCount).toBe(
      8
    );
    const options = fetchMock.mock.calls[0][1] as any;
    expect(options.credentials).toBe("omit");
    expect(JSON.parse(options.body)).toEqual({ eventId: "test-event" });
    expect(options.headers).not.toHaveProperty("Authorization");
  });
  it("rejects mismatched IDs and negative/NaN totals", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          mediaId: "b".repeat(32),
          viewCount: 8,
          counted: true,
        }),
      }))
    );
    await expect(recordPublicMediaView(mediaId, "event")).rejects.toThrow();
    const item = {
      id: mediaId,
      title: "test",
      description: "",
      kind: "image",
      mimeType: "image/png",
      size: 10,
      createdAt: "date",
    };
    expect(isPublicMediaSummary({ ...item, viewCount: 0 })).toBe(true);
    expect(isPublicMediaSummary({ ...item, viewCount: -1 })).toBe(false);
    expect(isPublicMediaSummary({ ...item, viewCount: NaN })).toBe(false);
  });
});
