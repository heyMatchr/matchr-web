import Link from "next/link";
import type { CreatorHabitAction } from "@/lib/creator-habits";
import type { DailyAttentionDigestCounts } from "@/lib/retention";

type DailyAttentionDigestProps = {
  counts: DailyAttentionDigestCounts;
  className?: string;
  nextAction?: CreatorHabitAction;
};

export function DailyAttentionDigest({
  className = "",
  counts,
  nextAction,
}: DailyAttentionDigestProps) {
  const items = [
    { label: "Views", value: counts.profileViews },
    { label: "Story reactions", value: counts.storyReactions },
    { label: "Gifts", value: counts.gifts },
    { label: "Messages", value: counts.messages },
  ];
  const total = items.reduce((sum, item) => sum + item.value, 0);

  return (
    <section
      className={`rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.06] p-3 ${className}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-emerald-100/70">
            Today
          </p>
          <p className="mt-1 text-sm font-black text-white">
            {total > 0 ? "Attention is moving" : "Quiet so far"}
          </p>
        </div>
        <span className="rounded-full border border-emerald-300/20 bg-black/30 px-3 py-1 text-xs font-medium text-emerald-50">
          {total} total
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {items.map((item) => (
          <div
            key={item.label}
            className="rounded-xl border border-white/10 bg-black/25 px-3 py-2"
          >
            <p className="text-lg font-black tabular-nums text-white">
              {item.value}
            </p>
            <p className="mt-0.5 truncate text-[11px] text-neutral-500">
              {item.label}
            </p>
          </div>
        ))}
      </div>
      {nextAction ? (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/25 px-3 py-2">
          <p className="min-w-0 truncate text-xs text-neutral-400">
            Next:{" "}
            <span className="font-black text-white">{nextAction.label}</span>
          </p>
          <Link
            href={nextAction.href}
            className="shrink-0 rounded-full border border-white/15 px-3 py-1 text-xs font-black text-white transition-colors hover:bg-white/10"
          >
            Go
          </Link>
        </div>
      ) : null}
    </section>
  );
}
