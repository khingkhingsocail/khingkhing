import { Eye } from "lucide-react";
import {
  rankingTargetId,
  type RankingTarget,
} from "../../../shared/rankingViews";
import { useRankingViews } from "../hooks/useRankingViews";
import "./ranking-view-badge.css";
export function RankingViewCount({ total }: { total?: number }) {
  return (
    <span
      className="ranking-view-count"
      title="จำนวนครั้งที่เปิดดูในขิงขิง ไม่ใช่จำนวนคนไม่ซ้ำ"
    >
      <Eye size={13} aria-hidden="true" />
      เปิดดู{" "}
      {total === undefined
        ? "—"
        : new Intl.NumberFormat("th-TH").format(total)}{" "}
      ครั้ง
    </span>
  );
}
export function RankingViewStatus({
  target,
  state,
}: {
  target: RankingTarget;
  state: ReturnType<typeof useRankingViews>;
}) {
  return (
    <div className="ranking-view-badge">
      <RankingViewCount total={state.counts.get(rankingTargetId(target))} />
      {state.error ? (
        <button
          type="button"
          onClick={state.retry}
          aria-label="ลองโหลดหรือบันทึกจำนวนเปิดดูอีกครั้ง"
        >
          ลองใหม่
        </button>
      ) : null}
    </div>
  );
}
export default function RankingViewBadge({
  target,
}: {
  target: RankingTarget;
}) {
  const state = useRankingViews([target]);
  return <RankingViewStatus target={target} state={state} />;
}
