import {
  mediaViewResultSchema,
  publicMediaIdSchema,
  type MediaViewResult,
} from "../../../shared/mediaViews";

export async function recordPublicMediaView(
  mediaId: string,
  eventId: string
): Promise<MediaViewResult> {
  publicMediaIdSchema.parse(mediaId);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(`/api/media-views/${mediaId}`, {
      method: "POST",
      credentials: "omit",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "X-Khing-Media-View": "1",
      },
      body: JSON.stringify({ eventId }),
    });
    if (!response.ok) throw new Error("บันทึกยอดวิวไม่สำเร็จ");
    const result = mediaViewResultSchema.parse(await response.json());
    if (result.mediaId !== mediaId) throw new Error("ยอดวิวไม่ตรงกับโพสต์");
    return result;
  } finally {
    clearTimeout(timer);
  }
}

// Only in-memory for this mounted feed. No fingerprint, account or localStorage.
export class MediaViewSession {
  private events = new Map<
    string,
    {
      eventId: string;
      pending?: Promise<MediaViewResult>;
      result?: MediaViewResult;
    }
  >();
  constructor(
    private send = recordPublicMediaView,
    private uuid: () => string = () => crypto.randomUUID()
  ) {}
  hasQualified(id: string) {
    return this.events.has(id);
  }
  hasRecorded(id: string) {
    return Boolean(this.events.get(id)?.result);
  }
  record(id: string): Promise<MediaViewResult> {
    let event = this.events.get(id);
    if (!event) {
      event = { eventId: this.uuid() };
      this.events.set(id, event);
    }
    if (event.result) return Promise.resolve(event.result);
    if (event.pending) return event.pending;
    const current = event;
    current.pending = Promise.resolve()
      .then(() => this.send(id, current.eventId))
      .then(result => {
        current.result = result;
        return result;
      })
      .finally(() => {
        current.pending = undefined;
      });
    return current.pending;
  }
}
