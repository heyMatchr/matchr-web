"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { NotificationTone } from "@/lib/notification-priority";
import type { OpportunityCard } from "@/lib/opportunities";

const toneClass: Record<NotificationTone, string> = {
  creator: "border-[#8B2FC9]/30 bg-[#8B2FC9]/10",
  elite: "border-[#D4AF37]/30 bg-[#D4AF37]/10",
  gift: "border-[#C8A24A]/35 bg-[#C8A24A]/10",
  match: "border-emerald-300/30 bg-emerald-300/10",
  message: "border-[#8B2FC9]/30 bg-[#8B2FC9]/10",
  neutral: "border-neutral-800 bg-black/50",
  premium: "border-emerald-300/25 bg-emerald-300/[0.06]",
  referral: "border-[#C8A24A]/30 bg-[#C8A24A]/10",
  reply: "border-sky-300/25 bg-sky-300/10",
  visitor: "border-sky-300/25 bg-sky-300/10",
};

export function OpportunityCards({
  cards,
  className = "",
}: {
  cards: OpportunityCard[];
  className?: string;
}) {
  // In-memory dismissal only (read-only V3): a dismissed card hides for the
  // rest of this page view and reappears on reload. No persistence, so there
  // is no SSR/hydration risk.
  const [dismissed, setDismissed] = useState<string[]>([]);

  const visible = useMemo(() => {
    const dismissedSet = new Set(dismissed);
    return cards.filter((card) => !dismissedSet.has(card.id));
  }, [cards, dismissed]);

  function dismiss(id: string) {
    setDismissed((current) => [...current, id]);
  }

  if (visible.length === 0) {
    return null;
  }

  return (
    <div className={`mt-6 grid gap-3 ${className}`}>
      {visible.map((card) => (
        <div
          key={card.id}
          className={`flex items-center gap-3 rounded-2xl border p-3 sm:p-4 ${
            toneClass[card.tone] ?? toneClass.neutral
          }`}
        >
          <Link href={card.href} className="min-w-0 flex-1">
            <p className="text-[11px] uppercase tracking-[0.2em] text-white/55">
              {card.title}
            </p>
            <p className="mt-0.5 text-sm font-semibold text-white">
              {card.body}
            </p>
          </Link>
          <Link
            href={card.href}
            className="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-black text-black"
          >
            {card.cta}
          </Link>
          <button
            type="button"
            onClick={() => dismiss(card.id)}
            aria-label="Dismiss"
            className="shrink-0 rounded-full border border-white/15 px-2 py-1 text-xs text-white/50 transition-colors hover:text-white/80"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
