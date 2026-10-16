import {
  rankingTargetId,
  type RankingTarget,
} from "../../../shared/rankingViews";

export class RankingOpeningQueue {
  private pending = new Map<
    string,
    { target: RankingTarget; inFlight: boolean }
  >();
  constructor(
    private write: (target: RankingTarget, eventId: string) => Promise<number>,
    private done: (id: string, total: number) => void,
    private failed: () => void,
    private uuid: () => string = () => crypto.randomUUID()
  ) {}
  open(target: RankingTarget) {
    const eventId = this.uuid();
    this.pending.set(eventId, { target, inFlight: false });
    void this.send(eventId);
  }
  retry() {
    for (const eventId of this.pending.keys()) void this.send(eventId);
  }
  private async send(eventId: string) {
    const event = this.pending.get(eventId);
    if (!event || event.inFlight) return;
    event.inFlight = true;
    try {
      const total = await this.write(event.target, eventId);
      this.pending.delete(eventId);
      this.done(rankingTargetId(event.target), total);
    } catch {
      event.inFlight = false;
      this.failed();
    }
  }
}
export class RankingGroupOpening {
  private last: string | null = null;
  shouldOpen(id: string, ready: boolean, visible: boolean) {
    if (!visible) {
      this.last = null;
      return false;
    }
    if (!ready || !id || this.last === id) return false;
    this.last = id;
    return true;
  }
}
