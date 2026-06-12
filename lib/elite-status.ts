import type { Database } from "@/lib/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";

const PREMIUM_USD_TO_CONTRIBUTION_GOLD = 100;

type EconomyClient = SupabaseClient<Database>;

type EliteLevel = {
  level: number;
  monthly_gold_requirement: number;
};

type PaidOrder = {
  amount: number | null;
  amount_usd?: number | null;
  gold_amount: number | null;
  order_type: string;
};

function sumGold(values: (number | null)[]) {
  return values.reduce<number>(
    (total, value) => total + Math.max(0, Number(value ?? 0)),
    0,
  );
}

export function calculateEliteStatus({
  levels,
  lifetimeContributionGold,
}: {
  levels: EliteLevel[];
  lifetimeContributionGold: number;
}) {
  const sortedLevels = [...levels].sort(
    (left, right) => left.monthly_gold_requirement - right.monthly_gold_requirement,
  );
  const currentLevel =
    [...sortedLevels]
      .reverse()
      .find((level) => lifetimeContributionGold >= level.monthly_gold_requirement)
      ?.level ?? 0;
  const remainingByLevel = Object.fromEntries(
    sortedLevels.map((level) => [
      level.level,
      Math.max(0, level.monthly_gold_requirement - lifetimeContributionGold),
    ]),
  );

  return {
    currentLevel,
    lifetimeContributionGold,
    remainingByLevel,
  };
}

export function calculateContributionFromPaidOrders(orders: PaidOrder[]) {
  return orders.reduce((total, order) => {
    if (order.order_type === "gold_purchase") {
      return total + Math.max(0, Number(order.gold_amount ?? 0));
    }

    if (order.order_type === "premium_subscription") {
      const amount = Number(order.amount_usd ?? order.amount ?? 0);
      return total + Math.round(Math.max(0, amount) * PREMIUM_USD_TO_CONTRIBUTION_GOLD);
    }

    if (order.order_type === "gift_purchase") {
      const amount = Number(order.gold_amount ?? 0);
      const usdFallback = Number(order.amount_usd ?? order.amount ?? 0);
      return (
        total +
        (amount > 0
          ? amount
          : Math.round(Math.max(0, usdFallback) * PREMIUM_USD_TO_CONTRIBUTION_GOLD))
      );
    }

    return total;
  }, 0);
}

export async function getUserEliteStatus(
  supabase: EconomyClient,
  userId: string,
) {
  const [
    eliteLevelsResult,
    giftSpendResult,
    boostSpendResult,
    paidOrdersResult,
  ] = await Promise.all([
    supabase
      .from("elite_levels")
      .select("level, monthly_gold_requirement")
      .order("level", { ascending: true }),
    supabase
      .from("gift_transactions")
      .select("gold_cost")
      .eq("sender_id", userId)
      .limit(1000),
    supabase
      .from("profile_boosts")
      .select("gold_cost")
      .eq("user_id", userId)
      .limit(1000),
    supabase
      .from("payment_orders")
      .select("order_type, status, amount, amount_usd, gold_amount")
      .eq("user_id", userId)
      .eq("status", "paid")
      .limit(1000),
  ]);

  const lifetimeContributionGold =
    sumGold((giftSpendResult.data ?? []).map((row) => row.gold_cost)) +
    sumGold((boostSpendResult.data ?? []).map((row) => row.gold_cost)) +
    calculateContributionFromPaidOrders(paidOrdersResult.data ?? []);

  return calculateEliteStatus({
    levels: eliteLevelsResult.data ?? [],
    lifetimeContributionGold,
  });
}

export function calculateEliteStatusesForUsers({
  boostSpendByUser,
  giftSpendByUser,
  levels,
  paidOrdersByUser,
  userIds,
}: {
  boostSpendByUser: Map<string, number>;
  giftSpendByUser: Map<string, number>;
  levels: EliteLevel[];
  paidOrdersByUser: Map<string, PaidOrder[]>;
  userIds: string[];
}) {
  return new Map(
    userIds.map((userId) => {
      const lifetimeContributionGold =
        (giftSpendByUser.get(userId) ?? 0) +
        (boostSpendByUser.get(userId) ?? 0) +
        calculateContributionFromPaidOrders(paidOrdersByUser.get(userId) ?? []);

      return [
        userId,
        calculateEliteStatus({
          levels,
          lifetimeContributionGold,
        }),
      ];
    }),
  );
}
