import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell } from "@/app/_components/app-shell";
import { DailyAttentionDigest } from "@/app/_components/daily-attention-digest";
import {
  DEFAULT_MESSAGE_RULES,
  getEconomyConfig,
  getEconomyNumberConfig,
} from "@/lib/economy";
import { getAvailablePaymentProviders } from "@/lib/payment-providers";
import { isActivePremiumSubscription } from "@/lib/premium";
import {
  getTodayStartIso,
  type DailyAttentionDigestCounts,
} from "@/lib/retention";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { activateProfileBoost, startPremiumCheckout } from "./actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PREMIUM_USD_TO_CONTRIBUTION_GOLD = 100;

type WalletPageProps = {
  searchParams?: Promise<{
    boost?: string | string[];
    payment?: string | string[];
    panel?: string | string[];
  }>;
};

function getSearchValue(
  params: Awaited<NonNullable<WalletPageProps["searchParams"]>> | undefined,
  key: "boost" | "payment" | "panel",
) {
  const value = params?.[key];

  return Array.isArray(value) ? value[0] : value;
}

export default async function WalletPage({ searchParams }: WalletPageProps) {
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/wallet");
  }

  const { data: currentProfile } = await supabase
    .from("profiles")
    .select("id, public_id, country, onboarding_completed")
    .eq("id", user.id)
    .maybeSingle();

  if (!currentProfile?.onboarding_completed) {
    redirect("/onboarding");
  }

  const todayStartIso = getTodayStartIso();
  const now = new Date();
  const nowMs = now.getTime();
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const [
    walletResult,
    packagesResult,
    walletTransactionsResult,
    incomingGiftsResult,
    outgoingGiftsResult,
    messageChargesResult,
    messageChargesSavingsResult,
    premiumSubscriptionsResult,
    premiumSubscriptionsHistoryResult,
    paymentOrdersResult,
    activeBoostResult,
    premiumPlansResult,
    eliteLevelsResult,
    lifetimeGiftSpendResult,
    lifetimeBoostSpendResult,
    lifetimePaidOrdersResult,
    priorityMessageCost,
    profileBoostCost,
    messageRules,
    availableProviders,
    profileViewsTodayResult,
    storyReactionsTodayResult,
    giftsTodayResult,
    messagesTodayResult,
  ] = await Promise.all([
    supabase.from("user_wallets").select("gold_balance").eq("user_id", user.id).maybeSingle(),
    supabase
      .from("gold_packages")
      .select("id, name, gold_amount, bonus_gold, usd_price, price_usd")
      .eq("active", true)
      .order("sort_order", { ascending: true })
      .order("usd_price", { ascending: true }),
    supabase.from("wallet_transactions").select("transaction_type, gold_delta, reference_type, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
    supabase.from("gift_transactions").select("gift_type, gold_cost, created_at").eq("receiver_id", user.id).order("created_at", { ascending: false }).limit(10),
    supabase.from("gift_transactions").select("gift_type, gold_cost, created_at").eq("sender_id", user.id).order("created_at", { ascending: false }).limit(10),
    supabase.from("message_charges").select("gold_cost, created_at").eq("sender_id", user.id).order("created_at", { ascending: false }).limit(10),
    supabase
      .from("message_charges")
      .select("gold_cost, created_at")
      .eq("sender_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1000),
    supabase
      .from("premium_subscriptions")
      .select("plan_name, status, price_usd, interval, expires_at")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("expires_at", { ascending: false })
      .limit(5),
    supabase
      .from("premium_subscriptions")
      .select("plan_name, status, created_at, expires_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("payment_orders").select("provider, order_type, status, amount, amount_usd, currency, gold_amount, metadata, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10),
    supabase
      .from("profile_boosts")
      .select("id, gold_cost, expires_at, status")
      .eq("user_id", user.id)
      .eq("status", "active")
      .gt("expires_at", new Date().toISOString())
      .order("expires_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("premium_plans")
      .select("id, name, plan_name, duration_days, price_usd, description")
      .eq("active", true)
      .order("price_usd", { ascending: true }),
    supabase
      .from("elite_levels")
      .select("level, monthly_gold_requirement, badge, benefits_json")
      .order("level", { ascending: true }),
    supabase
      .from("gift_transactions")
      .select("gold_cost")
      .eq("sender_id", user.id)
      .limit(1000),
    supabase
      .from("profile_boosts")
      .select("gold_cost")
      .eq("user_id", user.id)
      .limit(1000),
    supabase
      .from("payment_orders")
      .select("order_type, status, amount, amount_usd, gold_amount")
      .eq("user_id", user.id)
      .eq("status", "paid")
      .limit(1000),
    getEconomyNumberConfig(supabase, "priority_message_cost", 15),
    getEconomyNumberConfig(supabase, "profile_boost_cost", 50),
    getEconomyConfig<typeof DEFAULT_MESSAGE_RULES>(supabase, "message_rules"),
    getAvailablePaymentProviders(supabase, currentProfile.country, "USD"),
    supabase
      .from("profile_views")
      .select("id", { count: "exact", head: true })
      .eq("viewed_user_id", user.id)
      .gte("created_at", todayStartIso),
    supabase
      .from("story_reactions")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", user.id)
      .gte("created_at", todayStartIso),
    supabase
      .from("gift_transactions")
      .select("id", { count: "exact", head: true })
      .eq("receiver_id", user.id)
      .gte("created_at", todayStartIso),
    supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("receiver_id", user.id)
      .gte("created_at", todayStartIso),
  ]);
  const defaultProvider = availableProviders[0]?.provider_key ?? "";
  const paymentState = getSearchValue(params, "payment") ?? "";
  const boostState = getSearchValue(params, "boost") ?? "";
  const activePanel = getSearchValue(params, "panel") ?? "";
  const activeBoost = activeBoostResult.data;
  const activePremium = (premiumSubscriptionsResult.data ?? []).find((subscription) =>
    isActivePremiumSubscription(subscription),
  );
  const normalizedMessageRules = { ...DEFAULT_MESSAGE_RULES, ...messageRules };
  const standardMessageCost = Math.max(
    0,
    Number(
      normalizedMessageRules.male_message_cost ??
        normalizedMessageRules.male_to_female ??
        5,
    ),
  );
  const paidPremiumWindows = (premiumSubscriptionsHistoryResult.data ?? []).filter(
    (subscription) => subscription.status === "active",
  );
  const premiumMessageSavings = (messageChargesSavingsResult.data ?? []).reduce(
    (totals, charge) => {
      const chargedAt = new Date(charge.created_at).getTime();
      const happenedDuringPremium = paidPremiumWindows.some((subscription) => {
        const startsAt = new Date(subscription.created_at).getTime();
        const expiresAt = subscription.expires_at
          ? new Date(subscription.expires_at).getTime()
          : Number.POSITIVE_INFINITY;

        return chargedAt >= startsAt && chargedAt <= expiresAt;
      });

      if (!happenedDuringPremium) {
        return totals;
      }

      const saved = Math.max(0, standardMessageCost - Number(charge.gold_cost ?? 0));

      return {
        lifetime: totals.lifetime + saved,
        recent:
          chargedAt >= sevenDaysAgo.getTime()
            ? totals.recent + saved
            : totals.recent,
      };
    },
    { lifetime: 0, recent: 0 },
  );
  const premiumExpiresSoon =
    Boolean(activePremium?.expires_at) &&
    new Date(activePremium?.expires_at ?? 0).getTime() - nowMs <= 3 * 24 * 60 * 60 * 1000;
  const latestPaidPaymentOrder = (paymentOrdersResult.data ?? []).find(
    (order) => order.status === "paid",
  );
  const paymentSuccessMessage = getPaymentSuccessMessage(
    latestPaidPaymentOrder?.order_type ?? null,
  );
  const activityRows = {
    giftsIn: (incomingGiftsResult.data ?? []).map((row) => `${row.gift_type} · Diamonds credited`),
    giftsOut: (outgoingGiftsResult.data ?? []).map((row) => `${row.gift_type} · -${row.gold_cost ?? 0}`),
    messages: (messageChargesResult.data ?? []).map((row) => `Message · -${row.gold_cost}`),
    payments: (paymentOrdersResult.data ?? []).map((row) => {
      const amount = row.amount ?? row.amount_usd ?? 0;
      const currency = row.currency ?? "USD";
      const gold = row.gold_amount ? ` · ${row.gold_amount} Gold` : "";

      return `${formatPaymentType(row.order_type)} · ${formatPaymentStatus(row.status)} · ${currency} ${amount}${gold}${row.provider ? ` · ${row.provider}` : ""}`;
    }),
    transactions: (walletTransactionsResult.data ?? []).map(formatWalletTransaction),
  };
  const recentActivityPreview = [
    ...activityRows.transactions,
    ...activityRows.payments,
    ...activityRows.giftsOut,
    ...activityRows.messages,
  ].slice(0, 3);
  const lifetimeGiftGold = sumGold(
    (lifetimeGiftSpendResult.data ?? []).map((row) => row.gold_cost),
  );
  const lifetimeBoostGold = sumGold(
    (lifetimeBoostSpendResult.data ?? []).map((row) => row.gold_cost),
  );
  const paidOrders = lifetimePaidOrdersResult.data ?? [];
  const lifetimeGoldPurchased = paidOrders.reduce((total, order) => {
    if (order.order_type !== "gold_purchase") {
      return total;
    }

    return total + Math.max(0, Number(order.gold_amount ?? 0));
  }, 0);
  const lifetimePremiumContribution = paidOrders.reduce((total, order) => {
    if (order.order_type !== "premium_subscription") {
      return total;
    }

    const amount = Number(order.amount_usd ?? order.amount ?? 0);
    return total + Math.round(Math.max(0, amount) * PREMIUM_USD_TO_CONTRIBUTION_GOLD);
  }, 0);
  const lifetimeGiftPurchaseContribution = paidOrders.reduce((total, order) => {
    if (order.order_type !== "gift_purchase") {
      return total;
    }

    const amount = Number(order.gold_amount ?? 0);
    const usdFallback = Number(order.amount_usd ?? order.amount ?? 0);

    return (
      total +
      (amount > 0
        ? amount
        : Math.round(Math.max(0, usdFallback) * PREMIUM_USD_TO_CONTRIBUTION_GOLD))
    );
  }, 0);
  const lifetimeContributionGold =
    lifetimeGiftGold +
    lifetimeBoostGold +
    lifetimeGoldPurchased +
    lifetimePremiumContribution +
    lifetimeGiftPurchaseContribution;
  const eliteProgress = getEliteProgress(
    lifetimeContributionGold,
    eliteLevelsResult.data ?? [],
  );
  const milestones = getSpendingMilestones({
    hasGifted: lifetimeGiftGold > 0,
    lifetimeContributionGold,
  });
  const dailyDigestCounts: DailyAttentionDigestCounts = {
    gifts: giftsTodayResult.count ?? 0,
    messages: messagesTodayResult.count ?? 0,
    profileViews: profileViewsTodayResult.count ?? 0,
    storyReactions: storyReactionsTodayResult.count ?? 0,
  };

  return (
    <AppShell currentUserId={user.id} profileId={currentProfile.public_id ?? currentProfile.id} title="Wallet">
      <div className="mt-6 grid min-w-0 max-w-full gap-4 overflow-x-hidden pb-6 md:mt-8 md:gap-5 md:pb-0">
        <section className="min-w-0 max-w-full rounded-2xl border border-emerald-300/15 bg-emerald-300/10 p-4 sm:rounded-3xl sm:p-7">
          <p className="text-sm uppercase tracking-[0.22em] text-emerald-100/70">Gold balance</p>
          <p className="mt-2 break-words text-4xl font-black sm:text-5xl">{walletResult.data?.gold_balance ?? 0}</p>
          <p className="mt-3 text-[15px] leading-6 text-neutral-300">Chat · Gifts · Access</p>
          {paymentState === "success" ? (
            <p className="mt-3 rounded-2xl border border-emerald-300/25 bg-emerald-300/10 px-4 py-3 text-sm leading-6 text-emerald-50">
              {paymentSuccessMessage}
            </p>
          ) : null}
          {paymentState === "processing" ? (
            <p className="mt-3 rounded-2xl border border-emerald-300/20 bg-black/25 px-4 py-3 text-sm leading-6 text-emerald-50">
              Processing. Your Gold will appear shortly.
            </p>
          ) : null}
          {["failed", "missing-reference"].includes(paymentState) ? (
            <p className="mt-3 rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm leading-6 text-amber-50">
              Let&apos;s keep going. Try another method.
            </p>
          ) : null}
          {boostState === "success" ? (
            <p className="mt-3 rounded-2xl border border-emerald-300/25 bg-emerald-300/10 px-4 py-3 text-sm leading-6 text-emerald-50">
              Profile boosted for 24 hours.
            </p>
          ) : null}
          {boostState === "insufficient" ? (
            <p className="mt-3 rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm leading-6 text-amber-50">
              Top up Gold to boost.
            </p>
          ) : null}
          {boostState === "failed" ? (
            <p className="mt-3 rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm leading-6 text-amber-50">
              Boost could not start. Try again.
            </p>
          ) : null}
          <div className="mt-5 flex min-w-0 flex-wrap gap-2">
            <a href="#gold-packages" className="rounded-full bg-white px-5 py-2.5 text-sm font-medium text-black">Buy Gold</a>
            {!activePremium ? (
              <a href="#premium" className="rounded-full border border-emerald-200/30 px-5 py-2.5 text-sm text-emerald-100">Premium</a>
            ) : null}
          </div>
        </section>

        <DailyAttentionDigest counts={dailyDigestCounts} />

        <section className="grid min-w-0 max-w-full gap-3 sm:grid-cols-2">
          <div className="min-w-0 rounded-2xl border border-[#D4AF37]/25 bg-[#D4AF37]/10 p-4 sm:rounded-3xl sm:p-5">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-[0.24em] text-[#E8C46A]">
                  Premium savings
                </p>
                <h2 className="mt-2 text-xl font-black text-white">
                  Gold saved
                </h2>
              </div>
              <span className="rounded-full border border-[#D4AF37]/35 bg-black/25 px-3 py-1 text-xs text-[#E8C46A]">
                Messages
              </span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-2xl border border-[#D4AF37]/20 bg-black/25 p-3">
                <p className="text-2xl font-black text-white">
                  {premiumMessageSavings.lifetime.toLocaleString()}
                </p>
                <p className="mt-1 text-xs text-[#E8C46A]/70">Lifetime</p>
              </div>
              <div className="rounded-2xl border border-[#D4AF37]/20 bg-black/25 p-3">
                <p className="text-2xl font-black text-white">
                  {premiumMessageSavings.recent.toLocaleString()}
                </p>
                <p className="mt-1 text-xs text-[#E8C46A]/70">Last 7 days</p>
              </div>
            </div>
          </div>

          <div className="min-w-0 rounded-2xl border border-[#8B2FC9]/25 bg-[#8B2FC9]/10 p-4 sm:rounded-3xl sm:p-5">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-[0.24em] text-[#B06EEE]">
                  Premium value
                </p>
                <h2 className="mt-2 text-xl font-black text-white">
                  {activePremium ? "Premium Active" : "Premium available"}
                </h2>
              </div>
              {activePremium ? <PremiumPill /> : null}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {[
                "Discounted Messages",
                "Priority Visibility",
                activePremium
                  ? formatPremiumDays(activePremium.expires_at, nowMs)
                  : "Upgrade ready",
              ].map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-white/10 bg-black/25 px-3 py-1.5 text-sm text-neutral-100"
                >
                  {item}
                </span>
              ))}
            </div>
            {premiumExpiresSoon ? (
              <a
                href="#premium"
                className="mt-4 inline-flex rounded-full bg-white px-4 py-2 text-sm font-black text-black"
              >
                Keep Premium Active
              </a>
            ) : null}
          </div>
        </section>

        <section className="min-w-0 max-w-full rounded-2xl border border-[#D4AF37]/25 bg-[#D4AF37]/10 p-4 sm:rounded-3xl sm:p-6">
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-3 sm:gap-4">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-[0.24em] text-[#E8C46A]">
                Private recognition
              </p>
              <h2 className="mt-2 text-xl font-black text-white">
                Elite Progress
              </h2>
            </div>
            <span className="rounded-full border border-[#D4AF37]/35 bg-black/25 px-3 py-1 text-xs font-medium text-[#E8C46A]">
              {eliteProgress.currentLabel}
            </span>
          </div>

          <div className="mt-4 grid min-w-0 gap-2.5 sm:mt-5 sm:grid-cols-3 sm:gap-3">
            <div className="min-w-0 rounded-2xl border border-[#D4AF37]/20 bg-black/25 p-3.5 sm:p-4">
              <p className="text-sm text-[#E8C46A]/80">Lifetime Contribution</p>
              <p className="mt-2 break-words text-2xl font-black text-white sm:text-3xl">
                {lifetimeContributionGold.toLocaleString()}
              </p>
              <p className="mt-1 text-xs text-[#E8C46A]/65">Gold-equivalent</p>
            </div>
            <div className="min-w-0 rounded-2xl border border-[#D4AF37]/20 bg-black/25 p-3.5 sm:p-4">
              <p className="text-sm text-[#E8C46A]/80">Current level</p>
              <p className="mt-2 break-words text-2xl font-black text-white sm:text-3xl">
                {eliteProgress.currentLevelText}
              </p>
              <p className="mt-1 text-xs text-[#E8C46A]/65">
                {eliteProgress.currentBadge}
              </p>
            </div>
            <div className="min-w-0 rounded-2xl border border-[#D4AF37]/20 bg-black/25 p-3.5 sm:p-4">
              <p className="text-sm text-[#E8C46A]/80">Next level</p>
              <p className="mt-2 break-words text-2xl font-black text-white sm:text-3xl">
                {eliteProgress.nextLevelText}
              </p>
              <p className="mt-1 text-xs text-[#E8C46A]/65">
                {eliteProgress.remainingGold > 0
                  ? `${eliteProgress.remainingGold.toLocaleString()} remaining`
                  : "Elite reached"}
              </p>
            </div>
          </div>

          <div className="mt-4 min-w-0 rounded-2xl border border-[#D4AF37]/20 bg-black/25 p-3.5 sm:mt-5 sm:p-4">
            <div className="flex min-w-0 items-center justify-between gap-3">
              <p className="min-w-0 text-sm font-medium text-[#E8C46A]">
                {eliteProgress.progressCopy}
              </p>
              <p className="text-sm font-black text-white">
                {eliteProgress.progressPercent}%
              </p>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/55">
              <div
                className="h-full rounded-full bg-[#D4AF37]"
                style={{ width: `${eliteProgress.progressPercent}%` }}
              />
            </div>
            {eliteProgress.isNearNextLevel ? (
              <p className="mt-3 rounded-xl border border-[#D4AF37]/25 bg-[#D4AF37]/10 px-3 py-2 text-sm font-medium text-[#E8C46A]">
                {eliteProgress.remainingGold.toLocaleString()} Gold to{" "}
                {eliteProgress.nextLevelText}
              </p>
            ) : null}
          </div>
        </section>

        <section className="grid min-w-0 max-w-full gap-3 sm:gap-4 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="min-w-0 rounded-2xl border border-neutral-800 bg-black/50 p-4 sm:rounded-3xl sm:p-5">
            <p className="text-xs uppercase tracking-[0.24em] text-[#E8C46A]">
              Elite Benefits
            </p>
            <h2 className="mt-2 text-xl font-black">Private status</h2>
            <p className="mt-2 text-sm leading-6 text-neutral-400">
              Recognition stays private while your status grows.
            </p>
            <div className="mt-4 flex min-w-0 flex-wrap gap-2">
              {eliteProgress.benefits.length ? (
                eliteProgress.benefits.map((benefit) => (
                  <span
                    key={benefit}
                    className="max-w-full rounded-full border border-[#D4AF37]/20 bg-[#D4AF37]/10 px-3 py-1.5 text-sm text-[#E8C46A]"
                  >
                    {benefit}
                  </span>
                ))
              ) : (
                <span className="rounded-full border border-neutral-800 bg-white/[0.03] px-3 py-1.5 text-sm text-neutral-400">
                  Benefits unlock with Elite levels
                </span>
              )}
            </div>
          </div>

          <div className="min-w-0 rounded-2xl border border-neutral-800 bg-black/50 p-4 sm:rounded-3xl sm:p-5">
            <p className="text-xs uppercase tracking-[0.24em] text-[#E8C46A]">
              Milestones
            </p>
            <h2 className="mt-2 text-xl font-black">Spending Milestones</h2>
            <div className="mt-4 grid min-w-0 gap-2 sm:grid-cols-2">
              {milestones.map((milestone) => (
                <div
                  key={milestone.label}
                  className={`min-w-0 rounded-2xl border p-3 ${
                    milestone.reached
                      ? "border-[#D4AF37]/25 bg-[#D4AF37]/10"
                      : "border-neutral-800 bg-white/[0.03]"
                  }`}
                >
                  <div className="flex min-w-0 items-center justify-between gap-3">
                    <p className="min-w-0 text-sm font-medium text-white">
                      {milestone.label}
                    </p>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs ${
                        milestone.reached
                          ? "bg-[#D4AF37]/15 text-[#E8C46A]"
                          : "bg-black/35 text-neutral-500"
                      }`}
                    >
                      {milestone.reached ? "Reached" : "Private"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-neutral-500">
                    {milestone.copy}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="min-w-0 max-w-full rounded-2xl border border-neutral-800 bg-black/50 p-4 sm:rounded-3xl sm:p-5">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <h2 className="text-lg font-black">Quick Actions</h2>
            {activeBoost ? (
              <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs text-emerald-100">
                Boost active
              </span>
            ) : null}
          </div>
          <div className="mt-3 grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4">
            <a href="#premium" className="block min-w-0">
              <ActionCard
                icon="♛"
                label={activePremium ? "Premium Active" : "Premium"}
                sublabel={activePremium ? formatPremiumExpiry(activePremium.expires_at, nowMs) : "More access"}
              />
            </a>
            <form action={activateProfileBoost} className="min-w-0">
              <button
                className="h-full w-full min-w-0 rounded-2xl border border-emerald-300/30 bg-emerald-300/10 px-3 py-3 text-left transition-colors hover:border-emerald-300/50 hover:bg-emerald-300/15 disabled:cursor-not-allowed disabled:opacity-75"
                disabled={Boolean(activeBoost)}
                type="submit"
              >
                <p className="text-lg leading-none text-emerald-100">↟</p>
                <p className="mt-2 truncate text-sm font-black text-white">
                  {activeBoost ? "Boost active" : "Boost profile"}
                </p>
                <p className="mt-0.5 truncate text-xs text-emerald-50/75">
                  {activeBoost
                    ? `Ends in ${formatTimeRemaining(activeBoost.expires_at, nowMs)}`
                    : `${profileBoostCost} Gold · 24h`}
                </p>
              </button>
            </form>
            <a href="#elite" className="block min-w-0">
              <ActionCard icon="◇" label="Elite" sublabel="Levels" />
            </a>
            <a href="/earnings" className="block min-w-0">
              <ActionCard icon="◆" label="Gifts" sublabel="Earnings" />
            </a>
          </div>
        </section>

        <section id="gold-packages" className="grid min-w-0 max-w-full gap-3 rounded-2xl border border-neutral-800 bg-black/50 p-4 sm:rounded-3xl sm:p-6">
          <div>
            <h2 className="text-lg font-black">Gold packages</h2>
            <p className="mt-1 text-sm text-neutral-400">Choose a package, then pick a payment method.</p>
          </div>
          {(packagesResult.data ?? []).map((pack, index) => (
            <details
              key={`${pack.id}-${pack.name}-${pack.gold_amount}-${pack.price_usd}-${index}`}
              className="group min-w-0 rounded-2xl border border-neutral-800 bg-white/[0.03] p-3.5 transition-colors open:border-emerald-300/30 sm:p-5"
            >
              <summary className="flex min-w-0 cursor-pointer list-none flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="min-w-0">
                  <span className="block truncate font-black">{pack.name}</span>
                  <span className="mt-1.5 block text-[15px] leading-6 text-neutral-300">
                    {pack.gold_amount + (pack.bonus_gold ?? 0)} Gold
                    {pack.bonus_gold ? ` · ${pack.bonus_gold} bonus` : ""} · $
                    {pack.usd_price ?? pack.price_usd}
                  </span>
                </span>
                <span className="w-full rounded-full bg-white px-4 py-2.5 text-center text-sm font-medium text-black sm:w-fit sm:px-5">
                  Select Package
                </span>
              </summary>
              <form
                action="/wallet/checkout"
                className="mt-4 min-w-0 rounded-2xl border border-emerald-300/15 bg-emerald-300/10 p-3"
                data-wallet-checkout-form="gold"
                method="post"
              >
                <input type="hidden" name="package_id" value={pack.id} />
                <p className="text-sm font-black text-emerald-50">
                  Pay With
                </p>
                <div className="mt-3 flex min-w-0 flex-wrap gap-2">
                  {availableProviders.length ? (
                    availableProviders.map((provider, providerIndex) => (
                      <label
                        key={`${pack.id}-${provider.provider_key}`}
                        className="max-w-full rounded-full border border-neutral-700 bg-black/30 px-3 py-1.5 text-xs text-neutral-300"
                      >
                        <input
                          className="mr-1 accent-emerald-300"
                          defaultChecked={providerIndex === 0}
                          name="provider_key"
                          type="radio"
                          value={provider.provider_key}
                        />
                        {provider.name}
                      </label>
                    ))
                  ) : (
                    <span className="text-sm text-neutral-400">No payment options right now.</span>
                  )}
                </div>
                <button disabled={!availableProviders.length} className="mt-4 w-full rounded-full bg-white px-5 py-2.5 text-sm font-medium text-black disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">
                  Complete Purchase
                </button>
              </form>
            </details>
          ))}
        </section>

        <section id="premium" className="min-w-0 max-w-full rounded-2xl border border-neutral-800 bg-black/50 p-4 sm:rounded-3xl sm:p-5">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h2 className="text-lg font-black">Premium</h2>
            {activePremium ? <PremiumPill /> : null}
          </div>
          <p className="mt-2 text-[15px] leading-6 text-neutral-300">
            {activePremium
              ? `${activePremium.plan_name} · ${formatPremiumExpiry(activePremium.expires_at, nowMs)}`
              : "Inactive"}
          </p>
          <div className="mt-3 flex min-w-0 flex-wrap gap-2">
            {["Priority", "Insights", "Discounts", "Badge"].map((benefit) => (
              <span
                key={benefit}
                className="rounded-full border border-emerald-300/15 bg-emerald-300/10 px-3 py-1.5 text-sm text-emerald-50"
              >
                {benefit}
              </span>
            ))}
          </div>
          {!activePremium || premiumExpiresSoon ? (
            <details className="mt-4 min-w-0 rounded-2xl border border-neutral-800 bg-white/[0.03] p-3.5 sm:p-4">
              <summary className="cursor-pointer list-none text-sm font-black text-white">
                Premium plans
              </summary>
              <div className="mt-3 grid min-w-0 gap-2 sm:grid-cols-2">
                {(premiumPlansResult.data ?? []).length ? (
                  (premiumPlansResult.data ?? []).map((plan) => (
                    <form key={plan.id} action={startPremiumCheckout} className="min-w-0">
                      <input type="hidden" name="plan_id" value={plan.id} />
                      <input type="hidden" name="provider_key" value={defaultProvider} />
                      <button className="h-full w-full min-w-0 rounded-2xl border border-neutral-800 bg-black/30 p-3.5 text-left text-[15px] leading-6 text-neutral-200 transition-colors hover:border-emerald-300/30 sm:p-4">
                        <span className="block truncate font-black text-white">
                          {plan.name ?? plan.plan_name}
                        </span>
                        <span className="mt-1 block text-neutral-300">
                          ${plan.price_usd} · {plan.duration_days} days
                        </span>
                      </button>
                    </form>
                  ))
                ) : (
                  <div className="rounded-2xl border border-neutral-800 bg-black/30 p-4 text-[15px] leading-6 text-neutral-200">
                    Premium unavailable
                  </div>
                )}
              </div>
            </details>
          ) : null}
        </section>

        <section className="min-w-0 max-w-full rounded-2xl border border-neutral-800 bg-black/50 p-4 sm:rounded-3xl sm:p-5">
          <a
            href="/wallet?panel=payment-methods"
            className="flex min-w-0 items-center justify-between gap-4"
          >
            <span className="min-w-0">
              <span className="block text-lg font-black">Payment Options</span>
              <span className="mt-1 block text-sm text-neutral-400">
                {availableProviders.length} available
              </span>
            </span>
            <span className="rounded-full border border-neutral-700 px-3 py-1 text-sm text-neutral-300">
              View
            </span>
          </a>
        </section>

        <section id="elite" className="min-w-0 max-w-full overflow-hidden rounded-2xl border border-neutral-800 bg-black/50 p-4 sm:rounded-3xl sm:p-5">
          <h2 className="text-lg font-black">Elite levels</h2>
          <div className="mt-3 flex max-w-full gap-2 overflow-x-auto overscroll-x-contain pb-1">
            {(eliteLevelsResult.data ?? []).map((level) => (
              <div
                key={level.level}
                className="w-32 shrink-0 rounded-2xl border border-neutral-800 bg-white/[0.03] p-3 text-sm text-neutral-200 sm:w-36"
              >
                <p className="truncate font-black text-white">
                  L{level.level} · {level.badge}
                </p>
                <p className="mt-1 truncate text-neutral-400">
                  {level.monthly_gold_requirement.toLocaleString()} Gold/mo
                </p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-neutral-500">
            Priority {priorityMessageCost} · Boost {profileBoostCost}
          </p>
        </section>

        <section className="min-w-0 max-w-full rounded-2xl border border-neutral-800 bg-black/50 p-4 sm:rounded-3xl sm:p-5">
          <a
            href="/wallet?panel=activity"
            className="flex min-w-0 items-center justify-between gap-4"
          >
            <span className="min-w-0">
              <span className="block text-lg font-black">Recent Activity</span>
              <span className="mt-1 block truncate text-sm text-neutral-400">
                {recentActivityPreview[0] ?? "No purchases yet"}
              </span>
            </span>
            <span className="rounded-full border border-neutral-700 px-3 py-1 text-sm text-neutral-300">
              View
            </span>
          </a>
        </section>

        {activePanel === "payment-methods" ? (
          <WalletPanel title="Payment Options">
            <p className="text-sm leading-6 text-neutral-400">
              Available here: {currentProfile.country ?? "your region"}.
            </p>
            <div className="mt-4 grid min-w-0 gap-2 sm:grid-cols-2">
              {availableProviders.length ? (
                availableProviders.map((provider) => (
                  <div
                    key={provider.provider_key}
                    className="min-w-0 rounded-2xl border border-neutral-800 bg-white/[0.03] p-3.5 text-[15px] leading-6 text-neutral-200 sm:p-4"
                  >
                    <p className="truncate font-black text-white">{provider.name}</p>
                    <p className="mt-1 break-words text-sm text-neutral-500">
                      {provider.supported_currencies.join(", ")}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-neutral-400">
                  No payment methods are available right now.
                </p>
              )}
            </div>
          </WalletPanel>
        ) : null}

        {activePanel === "activity" ? (
          <WalletPanel title="Recent Activity">
            <History actionHref="#gold-packages" actionLabel="Buy Gold" emptyText="No purchases yet" title="Transactions" rows={activityRows.transactions} />
            <History title="Payments" rows={activityRows.payments} />
            <History actionHref="/earnings" actionLabel="Earnings" emptyText="No gift earnings yet" title="Gift earnings" rows={activityRows.giftsIn} />
            <History title="Gifts out" rows={activityRows.giftsOut} />
            <History title="Messages" rows={activityRows.messages} />
          </WalletPanel>
        ) : null}
      </div>
    </AppShell>
  );
}

function formatWalletTransaction(row: {
  created_at: string;
  gold_delta: number;
  reference_type: string | null;
  transaction_type: string;
}) {
  if (row.transaction_type === "gift_received") {
    return "Gift received · creator earnings";
  }

  const labels: Record<string, string> = {
    adjustment:
      row.reference_type === "Starter Gold Bonus"
        ? "Starter Gold Bonus"
        : "Wallet adjustment",
    gift_received: "Gift received",
    gift_sent: "Gift sent",
    message_charge: "Message charge",
    profile_boost: "Profile boost",
    top_up: "Gold top-up",
  };
  const sign = row.gold_delta > 0 ? "+" : "";

  return `${labels[row.transaction_type] ?? row.transaction_type} · ${sign}${row.gold_delta} Gold`;
}

function sumGold(values: (number | null)[]): number {
  let total = 0;

  values.forEach((value) => {
    total += Math.max(0, Number(value ?? 0));
  });

  return total;
}

function formatBenefitKey(key: string) {
  return key
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatBenefitValue(value: unknown) {
  if (value === true) {
    return "";
  }

  if (typeof value === "string") {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  if (typeof value === "number") {
    return value.toLocaleString();
  }

  return "";
}

function formatEliteBenefits(benefitsJson: Record<string, unknown> | null) {
  if (!benefitsJson) {
    return [];
  }

  return Object.entries(benefitsJson)
    .filter(([, value]) => Boolean(value))
    .map(([key, value]) => {
      const label = formatBenefitKey(key);
      const detail = formatBenefitValue(value);

      return detail ? `${label}: ${detail}` : label;
    });
}

function getEliteProgress(
  lifetimeContributionGold: number,
  levels: {
    badge: string;
    benefits_json: Record<string, unknown>;
    level: number;
    monthly_gold_requirement: number;
  }[],
) {
  const sortedLevels = [...levels].sort(
    (left, right) => left.monthly_gold_requirement - right.monthly_gold_requirement,
  );
  const reachedLevel = [...sortedLevels]
    .reverse()
    .find((level) => lifetimeContributionGold >= level.monthly_gold_requirement);
  const nextLevel = sortedLevels.find(
    (level) => lifetimeContributionGold < level.monthly_gold_requirement,
  );
  const previousRequirement = reachedLevel?.monthly_gold_requirement ?? 0;
  const nextRequirement = nextLevel?.monthly_gold_requirement ?? previousRequirement;
  const progressRange = Math.max(1, nextRequirement - previousRequirement);
  const progressValue = nextLevel
    ? lifetimeContributionGold - previousRequirement
    : progressRange;
  const progressPercent = nextLevel
    ? Math.max(0, Math.min(100, Math.round((progressValue / progressRange) * 100)))
    : 100;
  const currentLabel = reachedLevel
    ? `Elite ${reachedLevel.level}`
    : "Private";
  const currentLevelText = reachedLevel ? `L${reachedLevel.level}` : "Base";
  const currentBadge = reachedLevel?.badge ?? "Private";
  const nextLevelText = nextLevel ? `L${nextLevel.level}` : "Max";
  const remainingGold = nextLevel
    ? Math.max(0, nextLevel.monthly_gold_requirement - lifetimeContributionGold)
    : 0;
  const progressCopy = nextLevel
    ? `${remainingGold.toLocaleString()} to ${nextLevel.badge}`
    : "Elite reached";
  const isNearNextLevel =
    Boolean(nextLevel) && progressPercent >= 80 && remainingGold > 0;

  return {
    benefits: formatEliteBenefits(
      reachedLevel?.benefits_json ?? nextLevel?.benefits_json ?? null,
    ),
    currentBadge,
    currentLabel,
    currentLevelText,
    nextLevelText,
    isNearNextLevel,
    progressCopy,
    progressPercent,
    remainingGold,
  };
}

function getSpendingMilestones({
  hasGifted,
  lifetimeContributionGold,
}: {
  hasGifted: boolean;
  lifetimeContributionGold: number;
}) {
  return [
    {
      copy: hasGifted ? "Milestone reached." : "Send your first gift.",
      label: "First gift",
      reached: hasGifted,
    },
    ...[100, 1000, 5000].map((amount) => ({
      copy:
        lifetimeContributionGold >= amount
          ? "Milestone reached."
          : `${(amount - lifetimeContributionGold).toLocaleString()} remaining.`,
      label: `${amount.toLocaleString()} Gold`,
      reached: lifetimeContributionGold >= amount,
    })),
  ];
}

function formatPaymentStatus(status: string | null) {
  const labels: Record<string, string> = {
    cancelled: "Cancelled",
    failed: "Failed",
    paid: "Paid",
    pending: "Processing",
  };

  return labels[status ?? ""] ?? "Processing";
}

function formatPaymentType(type: string | null) {
  const labels: Record<string, string> = {
    boost_purchase: "Boost",
    gift_purchase: "Gift purchase",
    gold_purchase: "Gold purchase",
    premium_subscription: "Premium",
  };

  return labels[type ?? ""] ?? "Purchase";
}

function getPaymentSuccessMessage(type: string | null) {
  const labels: Record<string, string> = {
    boost_purchase: "Boost activated successfully.",
    gold_purchase: "Payment successful. Gold has been added.",
    premium_subscription: "Premium activated successfully.",
  };

  return labels[type ?? ""] ?? "Payment successful.";
}

function formatTimeRemaining(expiresAt: string, nowMs: number) {
  const milliseconds = new Date(expiresAt).getTime() - nowMs;

  if (milliseconds <= 0) {
    return "soon";
  }

  const hours = Math.floor(milliseconds / 36e5);
  const minutes = Math.max(1, Math.floor((milliseconds % 36e5) / 60000));

  if (hours >= 1) {
    return `${hours}h`;
  }

  return `${minutes}m`;
}

function formatPremiumExpiry(expiresAt: string | null, nowMs: number) {
  if (!expiresAt) {
    return "Active";
  }

  return `Ends in ${formatTimeRemaining(expiresAt, nowMs)}`;
}

function formatPremiumDays(expiresAt: string | null, nowMs: number) {
  if (!expiresAt) {
    return "Active";
  }

  const milliseconds = new Date(expiresAt).getTime() - nowMs;

  if (milliseconds <= 0) {
    return "Ends soon";
  }

  const days = Math.ceil(milliseconds / (24 * 60 * 60 * 1000));
  return `Ends in ${days} day${days === 1 ? "" : "s"}`;
}

function ActionCard({
  icon,
  label,
  sublabel,
}: {
  icon: string;
  label: string;
  sublabel: string;
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-emerald-300/15 bg-black/25 px-3 py-3">
      <p className="text-lg leading-none text-emerald-100">{icon}</p>
      <p className="mt-2 truncate text-sm font-black text-white">{label}</p>
      <p className="mt-0.5 truncate text-xs text-emerald-50/65">{sublabel}</p>
    </div>
  );
}

function WalletPanel({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <div className="fixed inset-0 z-[80] overflow-hidden bg-black/75 px-3 py-[calc(env(safe-area-inset-top)+0.75rem)] pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur-sm sm:px-4 sm:py-5">
      <section className="mx-auto flex max-h-full w-full max-w-2xl min-w-0 flex-col overflow-hidden rounded-2xl border border-neutral-800 bg-black p-4 shadow-[0_0_70px_rgba(0,0,0,0.45)] sm:rounded-3xl sm:p-5">
        <div className="flex min-w-0 shrink-0 items-center justify-between gap-4">
          <h2 className="min-w-0 truncate text-xl font-black">{title}</h2>
          <a
            href="/wallet"
            className="shrink-0 rounded-full border border-neutral-700 px-4 py-2 text-sm text-neutral-300"
          >
            Close
          </a>
        </div>
        <div className="mt-5 grid min-h-0 min-w-0 gap-4 overflow-y-auto overscroll-contain pr-1">{children}</div>
      </section>
    </div>
  );
}

function PremiumPill() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-[#D4AF37]/50 bg-[#D4AF37]/10 px-2.5 py-1 text-xs font-black text-[#D4AF37]">
      <span aria-hidden="true">✦</span>
      Premium
    </span>
  );
}

function History({
  actionHref,
  actionLabel,
  emptyText = "No activity yet.",
  rows,
  title,
}: {
  actionHref?: string;
  actionLabel?: string;
  emptyText?: string;
  rows: string[];
  title: string;
}) {
  return (
    <section className="min-w-0 rounded-2xl border border-neutral-800 bg-black/50 p-4 sm:rounded-3xl sm:p-6">
      <h2 className="text-lg font-black">{title}</h2>
      <div className="mt-4 grid min-w-0 gap-2.5">
        {rows.length ? rows.map((row, index) => (
          <div key={`${row}-${index}`} className="min-w-0 break-words rounded-2xl border border-neutral-800 bg-white/[0.03] p-3.5 text-[15px] leading-6 text-neutral-200 sm:p-4">{row}</div>
        )) : (
          <div className="min-w-0 rounded-2xl border border-neutral-800 bg-white/[0.03] p-3.5 sm:p-4">
            <p className="text-sm leading-6 text-neutral-400">{emptyText}</p>
            {actionHref && actionLabel ? (
              <a
                href={actionHref}
                className="mt-3 inline-flex rounded-full bg-white px-4 py-2 text-sm font-medium text-black"
              >
                {actionLabel}
              </a>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
