import { Crown, Shield, Sparkles, Trophy } from "lucide-react";
import { rankTier, type ArenaProfile } from "../../../../shared/arena";

export const tierLabels = {
  champion: "CHAMPION",
  challenger: "CHALLENGER",
  elite: "ELITE",
  contender: "CONTENDER",
};
export default function RankIdentity({
  profile,
  rank,
  onClick,
}: {
  profile: ArenaProfile;
  rank?: number;
  onClick?: () => void;
}) {
  const tier = rank ? rankTier(rank) : "contender";
  const Icon =
    tier === "champion"
      ? Crown
      : tier === "challenger"
        ? Trophy
        : tier === "elite"
          ? Sparkles
          : Shield;
  return (
    <button
      type="button"
      className={`rank-identity rank-identity--${tier}`}
      data-arena-profile={profile.id}
      onClick={onClick}
      disabled={!onClick}
      aria-label={`ดูโปรไฟล์ ${profile.displayName}${rank ? ` อันดับ ${rank}` : ""}`}
    >
      <span className="rank-identity__avatar">
        {profile.avatar ? (
          <img src={profile.avatar} alt="" />
        ) : (
          <span>{Array.from(profile.displayName)[0] ?? "ข"}</span>
        )}
        <i>
          <Icon size={12} />
        </i>
      </span>
      <span className="rank-identity__plate">
        <span className="rank-identity__tier">
          <Icon size={11} />
          {rank ? `#${rank} · ` : ""}
          {tierLabels[tier]}
        </span>
        <strong>{profile.displayName}</strong>
        <small>@{profile.handle}</small>
      </span>
    </button>
  );
}
