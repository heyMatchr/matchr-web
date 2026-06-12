export type StatusBadgeType =
  | "boosted"
  | "elite"
  | "online"
  | "premium"
  | "verified";

type StatusBadgeSize = "compact" | "normal";

export type StatusBadgeItem = {
  level?: number;
  type: StatusBadgeType;
};

const badgeRank: Record<StatusBadgeType, number> = {
  verified: 0,
  premium: 1,
  elite: 2,
  boosted: 3,
  online: 4,
};

const badgeTone: Record<StatusBadgeType, string> = {
  boosted: "border-[#C8A24A]/25 bg-black/45 text-[#E8C46A]",
  elite: "border-[#C8A24A]/35 bg-[#C8A24A]/10 text-[#E8C46A]",
  online: "border-[#4CAF85]/35 bg-[#4CAF85]/10 text-[#4CAF85]",
  premium: "border-[#C8A24A]/35 bg-black/45 text-[#C8A24A]",
  verified: "border-[#4CAF85]/35 bg-black/45 text-[#4CAF85]",
};

const badgeLabel: Record<StatusBadgeType, string> = {
  boosted: "Boosted",
  elite: "Elite",
  online: "Online",
  premium: "Premium",
  verified: "Verified",
};

export function getVisibleStatusBadges(
  badges: Array<StatusBadgeItem | false | null | undefined>,
  limit = 2,
) {
  return badges
    .filter((badge): badge is StatusBadgeItem => Boolean(badge))
    .sort((left, right) => badgeRank[left.type] - badgeRank[right.type])
    .slice(0, limit);
}

export function StatusBadge({
  className = "",
  level,
  size = "normal",
  type,
}: {
  className?: string;
  level?: number;
  size?: StatusBadgeSize;
  type: StatusBadgeType;
}) {
  const sizeClass =
    size === "compact"
      ? "px-2 py-0.5 text-[10px]"
      : "px-3 py-1 text-xs";
  const label = type === "elite" && level ? `Elite ${level}` : badgeLabel[type];

  return (
    <span
      className={`inline-flex max-w-full items-center rounded-full border font-black backdrop-blur ${badgeTone[type]} ${sizeClass} ${className}`}
    >
      {label}
    </span>
  );
}
