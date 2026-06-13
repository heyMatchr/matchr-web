export type PremiumWindow = {
  created_at: string;
  expires_at: string | null;
  status: string;
};

export type PremiumCharge = {
  created_at: string;
  gold_cost: number | null;
};

export type PremiumValueRecap = {
  daysActiveThisMonth: number;
  discountedMessagesThisMonth: number;
  goldSavedLifetime: number;
  goldSavedRecent: number;
  goldSavedThisMonth: number;
};

export type PremiumRenewalState =
  | "active"
  | "expired"
  | "one_day"
  | "seven_days"
  | "three_days";

const DAY_MS = 24 * 60 * 60 * 1000;

function overlapsWindow(timestamp: number, window: PremiumWindow) {
  if (window.status !== "active") {
    return false;
  }

  const startsAt = new Date(window.created_at).getTime();
  const expiresAt = window.expires_at
    ? new Date(window.expires_at).getTime()
    : Number.POSITIVE_INFINITY;

  return timestamp >= startsAt && timestamp <= expiresAt;
}

function overlapDays(startMs: number, endMs: number, window: PremiumWindow) {
  if (window.status !== "active") {
    return 0;
  }

  const startsAt = Math.max(startMs, new Date(window.created_at).getTime());
  const expiresAt = Math.min(
    endMs,
    window.expires_at
      ? new Date(window.expires_at).getTime()
      : Number.POSITIVE_INFINITY,
  );

  if (expiresAt <= startsAt) {
    return 0;
  }

  return Math.ceil((expiresAt - startsAt) / DAY_MS);
}

export function calculatePremiumValueRecap({
  charges,
  monthStartMs,
  nowMs,
  premiumWindows,
  recentStartMs,
  standardMessageCost,
}: {
  charges: PremiumCharge[];
  monthStartMs: number;
  nowMs: number;
  premiumWindows: PremiumWindow[];
  recentStartMs: number;
  standardMessageCost: number;
}): PremiumValueRecap {
  const activeWindows = premiumWindows.filter((window) => window.status === "active");
  const recap = charges.reduce(
    (totals, charge) => {
      const chargedAt = new Date(charge.created_at).getTime();
      const happenedDuringPremium = activeWindows.some((window) =>
        overlapsWindow(chargedAt, window),
      );

      if (!happenedDuringPremium) {
        return totals;
      }

      const saved = Math.max(0, standardMessageCost - Number(charge.gold_cost ?? 0));

      return {
        discountedMessagesThisMonth:
          chargedAt >= monthStartMs && saved > 0
            ? totals.discountedMessagesThisMonth + 1
            : totals.discountedMessagesThisMonth,
        goldSavedLifetime: totals.goldSavedLifetime + saved,
        goldSavedRecent:
          chargedAt >= recentStartMs
            ? totals.goldSavedRecent + saved
            : totals.goldSavedRecent,
        goldSavedThisMonth:
          chargedAt >= monthStartMs
            ? totals.goldSavedThisMonth + saved
            : totals.goldSavedThisMonth,
      };
    },
    {
      discountedMessagesThisMonth: 0,
      goldSavedLifetime: 0,
      goldSavedRecent: 0,
      goldSavedThisMonth: 0,
    },
  );
  const daysActiveThisMonth = activeWindows.reduce(
    (total, window) => total + overlapDays(monthStartMs, nowMs, window),
    0,
  );

  return {
    ...recap,
    daysActiveThisMonth,
  };
}

export function getPremiumRenewalState(
  expiresAt: string | null | undefined,
  nowMs: number,
): PremiumRenewalState {
  if (!expiresAt) {
    return "active";
  }

  const remainingMs = new Date(expiresAt).getTime() - nowMs;

  if (remainingMs <= 0) {
    return "expired";
  }

  const remainingDays = Math.ceil(remainingMs / DAY_MS);

  if (remainingDays <= 1) {
    return "one_day";
  }

  if (remainingDays <= 3) {
    return "three_days";
  }

  if (remainingDays <= 7) {
    return "seven_days";
  }

  return "active";
}

export function getPremiumRenewalCopy(state: PremiumRenewalState) {
  const copy: Record<
    PremiumRenewalState,
    { body: string; cta: string; title: string }
  > = {
    active: {
      body: "Your discounts and status are active.",
      cta: "Manage Premium",
      title: "Premium Active",
    },
    expired: {
      body: "Restore Premium to keep message discounts and status active.",
      cta: "Restore Premium",
      title: "Premium ended",
    },
    one_day: {
      body: "Renew today to keep discounted messages uninterrupted.",
      cta: "Keep Premium Active",
      title: "Premium ends tomorrow",
    },
    seven_days: {
      body: "Your Premium value stays active this week.",
      cta: "Review Premium",
      title: "Premium renews soon",
    },
    three_days: {
      body: "Keep your discounts, badge, and priority visibility active.",
      cta: "Keep Premium Active",
      title: "Premium ends soon",
    },
  };

  return copy[state];
}
