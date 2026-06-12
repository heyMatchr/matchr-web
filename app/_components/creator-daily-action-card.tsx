import Link from "next/link";
import type { CreatorHabitAction } from "@/lib/creator-habits";

type CreatorDailyActionCardProps = {
  action: CreatorHabitAction;
  className?: string;
  quiet?: boolean;
};

export function CreatorDailyActionCard({
  action,
  className = "",
  quiet = false,
}: CreatorDailyActionCardProps) {
  return (
    <section
      className={`rounded-2xl border p-3 ${
        quiet
          ? "border-amber-300/20 bg-amber-300/[0.07]"
          : "border-[#8B2FC9]/25 bg-[#8B2FC9]/10"
      } ${className}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p
            className={`text-xs uppercase tracking-[0.22em] ${
              quiet ? "text-amber-100/75" : "text-[#B06EEE]"
            }`}
          >
            {quiet ? "Quiet lately" : "Today"}
          </p>
          <p className="mt-1 text-sm font-black text-white">{action.label}</p>
          <p className="mt-0.5 text-xs text-neutral-400">{action.note}</p>
        </div>
        <Link
          href={action.href}
          className="rounded-full bg-white px-4 py-2 text-sm font-black text-black transition-opacity hover:opacity-90"
        >
          {action.label}
        </Link>
      </div>
    </section>
  );
}
