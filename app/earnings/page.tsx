import { redirect } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/app/_components/app-shell";
import { CreatorDailyActionCard } from "@/app/_components/creator-daily-action-card";
import { DailyAttentionDigest } from "@/app/_components/daily-attention-digest";
import { getVisibleStatusBadges, StatusBadge } from "@/app/_components/status-badge";
import {
  calculateCreatorContentStreak,
  getCreatorHabitAction,
  getCreatorGoalProgress,
  getCreatorMilestones,
  hasLowCreatorActivity,
  type CreatorHabitSignals,
} from "@/lib/creator-habits";
import { getEconomyConfig, getGiftCatalog } from "@/lib/economy";
import { calculateEliteStatusesForUsers } from "@/lib/elite-status";
import { getProfileHref } from "@/lib/profile-public-id";
import {
  getTodayStartIso,
  type DailyAttentionDigestCounts,
} from "@/lib/retention";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requestWithdrawal } from "./actions";

function formatDiamonds(value: number) {
  return `${Math.round(value).toLocaleString()} Diamonds`;
}

function formatCurrency(value: number) {
  return `$${value.toLocaleString(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}`;
}

function formatDate(value?: string | null) {
  if (!value) {
    return "Recent";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Recent";
  }

  return date.toLocaleString([], {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
  });
}

function formatGiftName(giftType?: string | null) {
  if (!giftType) {
    return "Gift";
  }

  return giftType
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function initialFor(name?: string | null) {
  return name?.trim().charAt(0).toUpperCase() || "M";
}

function giftCategoryFor(gift: unknown) {
  if (
    typeof gift === "object" &&
    gift !== null &&
    "category" in gift &&
    typeof gift.category === "string"
  ) {
    return gift.category.trim() || "classic";
  }

  return "classic";
}

function logEarningsQueryError(
  label: string,
  error: { message?: string } | null | undefined,
) {
  if (error) {
    console.error(`[Earnings] ${label} query failed`, error.message ?? error);
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function countBy<T>(items: T[], getKey: (item: T) => string | null | undefined) {
  const counts = new Map<string, number>();

  items.forEach((item) => {
    const key = getKey(item);

    if (key) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  });

  return counts;
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-3xl border border-neutral-800 bg-black/50 p-5">
      <p className="text-sm font-medium text-neutral-400">{label}</p>
      <p className="mt-3 text-3xl font-black tracking-tight text-white">{value}</p>
    </article>
  );
}

function formatRecapChange(current: number, previous: number) {
  if (current === 0 && previous === 0) {
    return "Stable";
  }

  if (previous === 0) {
    return `+${current.toLocaleString()}`;
  }

  const change = Math.round(((current - previous) / previous) * 100);

  if (change === 0) {
    return "Stable";
  }

  return `${change > 0 ? "+" : ""}${change}%`;
}

function RecapMetric({
  change,
  label,
  value,
}: {
  change: string;
  label: string;
  value: string;
}) {
  const positive = change.startsWith("+");
  const negative = change.startsWith("-");

  return (
    <div className="rounded-2xl border border-neutral-800 bg-white/[0.03] p-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium text-neutral-500">{label}</p>
        <span
          className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
            positive
              ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-100"
              : negative
                ? "border-rose-300/20 bg-rose-300/10 text-rose-100"
                : "border-amber-300/20 bg-amber-300/10 text-amber-100"
          }`}
        >
          {change}
        </span>
      </div>
      <p className="mt-2 text-2xl font-black tabular-nums text-white">
        {value}
      </p>
    </div>
  );
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-black/45">
      <div
        className="h-full rounded-full bg-[#C8A24A]"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

export default async function EarningsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/earnings");
  }

  const { data: currentProfile } = await supabase
    .from("profiles")
    .select("id, public_id, onboarding_completed")
    .eq("id", user.id)
    .maybeSingle();

  if (!currentProfile?.onboarding_completed) {
    redirect("/onboarding");
  }

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
  const todayStartIso = getTodayStartIso();

  const [
    walletResult,
    withdrawalsResult,
    recentSupportResult,
    weeklyGiftsResult,
    previousWeeklyGiftsResult,
    weeklyProfileViewsResult,
    previousWeeklyProfileViewsResult,
    weeklyFollowersResult,
    previousWeeklyFollowersResult,
    weeklyStoriesResult,
    previousWeeklyStoriesResult,
    weeklyMomentsResult,
    previousWeeklyMomentsResult,
    aggregateGiftsResult,
    todayProfileViewsResult,
    todayStoryReactionsResult,
    todayGiftsResult,
    todayMessagesResult,
    todayStoriesResult,
    todayMomentsResult,
    recentStoriesResult,
    recentMomentsResult,
    recentSupportCountResult,
    allProfileViewsResult,
    allStoriesResult,
    allMomentsResult,
    storyTimelineResult,
    momentTimelineResult,
    giftCatalog,
    diamondConversionRate,
    minimumWithdrawal,
    creatorTierResult,
  ] = await Promise.all([
    supabase
      .from("creator_wallets")
      .select("diamonds_balance, diamonds_lifetime, diamonds_pending, diamonds_withdrawn")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("withdrawal_requests")
      .select("id, diamonds_amount, cash_estimate, status, payout_method, created_at, processed_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("gift_transactions")
      .select("sender_id, gift_type, gold_cost, created_at")
      .eq("receiver_id", user.id)
      .order("created_at", { ascending: false })
      .limit(12),
    supabase
      .from("gift_transactions")
      .select("sender_id, gift_type, gold_cost, created_at")
      .eq("receiver_id", user.id)
      .gte("created_at", sevenDaysAgo.toISOString())
      .order("created_at", { ascending: false }),
    supabase
      .from("gift_transactions")
      .select("sender_id, gift_type, gold_cost, created_at")
      .eq("receiver_id", user.id)
      .gte("created_at", fourteenDaysAgo.toISOString())
      .lt("created_at", sevenDaysAgo.toISOString())
      .order("created_at", { ascending: false }),
    supabase
      .from("profile_views")
      .select("id", { count: "exact", head: true })
      .eq("viewed_user_id", user.id)
      .gte("created_at", sevenDaysAgo.toISOString()),
    supabase
      .from("profile_views")
      .select("id", { count: "exact", head: true })
      .eq("viewed_user_id", user.id)
      .gte("created_at", fourteenDaysAgo.toISOString())
      .lt("created_at", sevenDaysAgo.toISOString()),
    supabase
      .from("follows")
      .select("id", { count: "exact", head: true })
      .eq("following_id", user.id)
      .gte("created_at", sevenDaysAgo.toISOString()),
    supabase
      .from("follows")
      .select("id", { count: "exact", head: true })
      .eq("following_id", user.id)
      .gte("created_at", fourteenDaysAgo.toISOString())
      .lt("created_at", sevenDaysAgo.toISOString()),
    supabase
      .from("stories")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", sevenDaysAgo.toISOString()),
    supabase
      .from("stories")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", fourteenDaysAgo.toISOString())
      .lt("created_at", sevenDaysAgo.toISOString()),
    supabase
      .from("moments")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", sevenDaysAgo.toISOString()),
    supabase
      .from("moments")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", fourteenDaysAgo.toISOString())
      .lt("created_at", sevenDaysAgo.toISOString()),
    supabase
      .from("gift_transactions")
      .select("sender_id, gift_type, gold_cost, created_at")
      .eq("receiver_id", user.id)
      .order("created_at", { ascending: false })
      .limit(500),
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
    supabase
      .from("stories")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", todayStartIso),
    supabase
      .from("moments")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", todayStartIso),
    supabase
      .from("stories")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", threeDaysAgo.toISOString()),
    supabase
      .from("moments")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", threeDaysAgo.toISOString()),
    supabase
      .from("gift_transactions")
      .select("id", { count: "exact", head: true })
      .eq("receiver_id", user.id)
      .gte("created_at", threeDaysAgo.toISOString()),
    supabase
      .from("profile_views")
      .select("id", { count: "exact", head: true })
      .eq("viewed_user_id", user.id),
    supabase
      .from("stories")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
    supabase
      .from("moments")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
    supabase
      .from("stories")
      .select("id, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(90),
    supabase
      .from("moments")
      .select("id, created_at, media_type")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(90),
    getGiftCatalog(supabase),
    getEconomyConfig<number>(supabase, "diamond_conversion_rate"),
    getEconomyConfig<number>(supabase, "minimum_withdrawal"),
    supabase
      .from("creator_tiers")
      .select("name, creator_percentage")
      .eq("active", true)
      .order("sort_order", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);
  logEarningsQueryError("creator wallet", walletResult.error);
  logEarningsQueryError("withdrawals", withdrawalsResult.error);
  logEarningsQueryError("recent support", recentSupportResult.error);
  logEarningsQueryError("weekly gifts", weeklyGiftsResult.error);
  logEarningsQueryError("previous weekly gifts", previousWeeklyGiftsResult.error);
  logEarningsQueryError("weekly profile views", weeklyProfileViewsResult.error);
  logEarningsQueryError(
    "previous weekly profile views",
    previousWeeklyProfileViewsResult.error,
  );
  logEarningsQueryError("weekly followers", weeklyFollowersResult.error);
  logEarningsQueryError("previous weekly followers", previousWeeklyFollowersResult.error);
  logEarningsQueryError("weekly stories", weeklyStoriesResult.error);
  logEarningsQueryError("previous weekly stories", previousWeeklyStoriesResult.error);
  logEarningsQueryError("weekly moments", weeklyMomentsResult.error);
  logEarningsQueryError("previous weekly moments", previousWeeklyMomentsResult.error);
  logEarningsQueryError("aggregate gifts", aggregateGiftsResult.error);
  logEarningsQueryError("today profile views", todayProfileViewsResult.error);
  logEarningsQueryError("today story reactions", todayStoryReactionsResult.error);
  logEarningsQueryError("today gifts", todayGiftsResult.error);
  logEarningsQueryError("today messages", todayMessagesResult.error);
  logEarningsQueryError("today stories", todayStoriesResult.error);
  logEarningsQueryError("today moments", todayMomentsResult.error);
  logEarningsQueryError("recent stories", recentStoriesResult.error);
  logEarningsQueryError("recent moments", recentMomentsResult.error);
  logEarningsQueryError("recent support count", recentSupportCountResult.error);
  logEarningsQueryError("all profile views", allProfileViewsResult.error);
  logEarningsQueryError("all stories", allStoriesResult.error);
  logEarningsQueryError("all moments", allMomentsResult.error);
  logEarningsQueryError("story timeline", storyTimelineResult.error);
  logEarningsQueryError("moment timeline", momentTimelineResult.error);
  logEarningsQueryError("creator tier", creatorTierResult.error);

  const withdrawalRows = withdrawalsResult.error
    ? []
    : (withdrawalsResult.data ?? []);
  const recentSupportRows = recentSupportResult.error
    ? []
    : (recentSupportResult.data ?? []);
  const weeklyGiftRows = weeklyGiftsResult.error
    ? []
    : (weeklyGiftsResult.data ?? []);
  const previousWeeklyGiftRows = previousWeeklyGiftsResult.error
    ? []
    : (previousWeeklyGiftsResult.data ?? []);
  const aggregateGiftRows = aggregateGiftsResult.error
    ? []
    : (aggregateGiftsResult.data ?? []);
  const creatorTier = creatorTierResult.error ? null : creatorTierResult.data;

  const wallet = walletResult.error || !walletResult.data ? {
    diamonds_balance: 0,
    diamonds_lifetime: 0,
    diamonds_pending: 0,
    diamonds_withdrawn: 0,
  } : walletResult.data;
  const diamondsPerUsd = Math.max(1, Number(diamondConversionRate ?? 100));
  const cashEstimate = wallet.diamonds_balance / diamondsPerUsd;
  const creatorPercentage = Math.max(
    0,
    Math.min(100, Number(creatorTier?.creator_percentage ?? 50)),
  );
  const giftByType = new Map(giftCatalog.map((gift) => [gift.type, gift]));
  const diamondsFromGold = (goldCost: number | null) =>
    Math.floor(Math.max(0, Number(goldCost ?? 0)) * (creatorPercentage / 100));
  const weeklyDiamonds =
    weeklyGiftRows.reduce(
      (total, gift) => total + diamondsFromGold(gift.gold_cost),
      0,
    );
  const previousWeeklyDiamonds =
    previousWeeklyGiftRows.reduce(
      (total, gift) => total + diamondsFromGold(gift.gold_cost),
      0,
    );
  const weeklyProfileViews = weeklyProfileViewsResult.error
    ? 0
    : (weeklyProfileViewsResult.count ?? 0);
  const previousWeeklyProfileViews = previousWeeklyProfileViewsResult.error
    ? 0
    : (previousWeeklyProfileViewsResult.count ?? 0);
  const weeklyFollowers = weeklyFollowersResult.error
    ? 0
    : (weeklyFollowersResult.count ?? 0);
  const previousWeeklyFollowers = previousWeeklyFollowersResult.error
    ? 0
    : (previousWeeklyFollowersResult.count ?? 0);
  const weeklyStories = weeklyStoriesResult.error
    ? 0
    : (weeklyStoriesResult.count ?? 0);
  const previousWeeklyStories = previousWeeklyStoriesResult.error
    ? 0
    : (previousWeeklyStoriesResult.count ?? 0);
  const weeklyMoments = weeklyMomentsResult.error
    ? 0
    : (weeklyMomentsResult.count ?? 0);
  const previousWeeklyMoments = previousWeeklyMomentsResult.error
    ? 0
    : (previousWeeklyMomentsResult.count ?? 0);
  const dailyDigestCounts: DailyAttentionDigestCounts = {
    gifts: todayGiftsResult.error ? 0 : (todayGiftsResult.count ?? 0),
    messages: todayMessagesResult.error ? 0 : (todayMessagesResult.count ?? 0),
    profileViews: todayProfileViewsResult.error
      ? 0
      : (todayProfileViewsResult.count ?? 0),
    storyReactions: todayStoryReactionsResult.error
      ? 0
      : (todayStoryReactionsResult.count ?? 0),
  };
  const creatorHabitSignals: CreatorHabitSignals = {
    momentsLast3Days: recentMomentsResult.error
      ? 0
      : (recentMomentsResult.count ?? 0),
    momentsToday: todayMomentsResult.error ? 0 : (todayMomentsResult.count ?? 0),
    profileViewsToday: dailyDigestCounts.profileViews,
    storyReactionsToday: dailyDigestCounts.storyReactions,
    storiesLast3Days: recentStoriesResult.error
      ? 0
      : (recentStoriesResult.count ?? 0),
    storiesToday: todayStoriesResult.error ? 0 : (todayStoriesResult.count ?? 0),
    supportLast3Days: recentSupportCountResult.error
      ? 0
      : (recentSupportCountResult.count ?? 0),
    supportToday: dailyDigestCounts.gifts,
  };
  const creatorHabitAction = getCreatorHabitAction(creatorHabitSignals);
  const creatorQuietLately = hasLowCreatorActivity(creatorHabitSignals);
  const creatorGoalDiamonds = 5000;
  const goalProgress = getCreatorGoalProgress({
    goal: creatorGoalDiamonds,
    value: wallet.diamonds_balance,
    weeklyDiamonds,
  });
  const goalPercent = goalProgress.percent;
  const storyTimelineRows = storyTimelineResult.error
    ? []
    : (storyTimelineResult.data ?? []);
  const momentTimelineRows = momentTimelineResult.error
    ? []
    : (momentTimelineResult.data ?? []);
  const storyStreak = calculateCreatorContentStreak(storyTimelineRows);
  const momentStreak = calculateCreatorContentStreak(momentTimelineRows);
  const giftCounts = new Map<
    string,
    {
      count: number;
      gold: number;
    }
  >();
  const supporterStats = new Map<
    string,
    {
      count: number;
      gold: number;
      latestGiftAt: string;
    }
  >();
  const weeklyGiftCounts = new Map<
    string,
    {
      count: number;
      gold: number;
    }
  >();
  const weeklySupporterStats = new Map<
    string,
    {
      count: number;
      gold: number;
      latestGiftAt: string;
    }
  >();
  const categoryStats = new Map<
    string,
    {
      diamonds: number;
      gifts: number;
      gold: number;
    }
  >();
  let totalGiftsReceived = 0;
  let totalGoldGenerated = 0;
  let totalDiamondsGenerated = 0;

  weeklyGiftRows.forEach((gift) => {
    const giftGold = Math.max(0, Number(gift.gold_cost ?? 0));
    const currentGift = weeklyGiftCounts.get(gift.gift_type) ?? {
      count: 0,
      gold: 0,
    };
    weeklyGiftCounts.set(gift.gift_type, {
      count: currentGift.count + 1,
      gold: currentGift.gold + giftGold,
    });

    const currentSupporter = weeklySupporterStats.get(gift.sender_id) ?? {
      count: 0,
      gold: 0,
      latestGiftAt: gift.created_at,
    };
    weeklySupporterStats.set(gift.sender_id, {
      count: currentSupporter.count + 1,
      gold: currentSupporter.gold + giftGold,
      latestGiftAt:
        new Date(gift.created_at).getTime() >
        new Date(currentSupporter.latestGiftAt).getTime()
          ? gift.created_at
          : currentSupporter.latestGiftAt,
    });
  });

  aggregateGiftRows.forEach((gift) => {
    const giftGold = Math.max(0, Number(gift.gold_cost ?? 0));
    const giftDiamonds = diamondsFromGold(gift.gold_cost);
    const giftCategory = giftCategoryFor(giftByType.get(gift.gift_type));
    const currentCategory = categoryStats.get(giftCategory) ?? {
      diamonds: 0,
      gifts: 0,
      gold: 0,
    };

    totalGiftsReceived += 1;
    totalGoldGenerated += giftGold;
    totalDiamondsGenerated += giftDiamonds;
    categoryStats.set(giftCategory, {
      diamonds: currentCategory.diamonds + giftDiamonds,
      gifts: currentCategory.gifts + 1,
      gold: currentCategory.gold + giftGold,
    });

    const currentGift = giftCounts.get(gift.gift_type) ?? { count: 0, gold: 0 };
    giftCounts.set(gift.gift_type, {
      count: currentGift.count + 1,
      gold: currentGift.gold + giftGold,
    });

    const currentSupporter = supporterStats.get(gift.sender_id) ?? {
      count: 0,
      gold: 0,
      latestGiftAt: gift.created_at,
    };
    supporterStats.set(gift.sender_id, {
      count: currentSupporter.count + 1,
      gold: currentSupporter.gold + giftGold,
      latestGiftAt:
        new Date(gift.created_at).getTime() >
        new Date(currentSupporter.latestGiftAt).getTime()
          ? gift.created_at
          : currentSupporter.latestGiftAt,
    });
  });

  const mostReceivedGift = [...giftCounts.entries()]
    .sort(([, left], [, right]) => right.count - left.count || right.gold - left.gold)
    .map(([giftType, stats]) => ({
      count: stats.count,
      name: giftByType.get(giftType)?.name ?? formatGiftName(giftType),
    }))[0];
  const topSupporterIds = [...supporterStats.entries()]
    .sort(([, left], [, right]) => right.count - left.count || right.gold - left.gold)
    .slice(0, 5)
    .map(([supporterId]) => supporterId)
    .filter(isNonEmptyString);
  const weeklyTopGift = [...weeklyGiftCounts.entries()]
    .sort(([, left], [, right]) => right.count - left.count || right.gold - left.gold)
    .map(([giftType, stats]) => ({
      count: stats.count,
      name: giftByType.get(giftType)?.name ?? formatGiftName(giftType),
    }))[0];
  const weeklyTopSupporterId = [...weeklySupporterStats.entries()]
    .sort(([, left], [, right]) => right.count - left.count || right.gold - left.gold)
    .map(([supporterId]) => supporterId)
    .find(isNonEmptyString);
  const recentSupporterIds = recentSupportRows
    .map((gift) => gift.sender_id)
    .filter(isNonEmptyString);
  const supporterLookupIds = [
    ...new Set(
      [...topSupporterIds, weeklyTopSupporterId, ...recentSupporterIds]
        .filter(isNonEmptyString),
    ),
  ];
  const [
    { data: supporterProfiles },
    supporterPremiumResult,
    supporterEliteLevelsResult,
    supporterGiftSpendResult,
    supporterBoostSpendResult,
    supporterPaidOrdersResult,
  ] = supporterLookupIds.length
    ? await Promise.all([
        supabase
          .from("profiles")
          .select("id, public_id, display_name, avatar_url")
          .in("id", supporterLookupIds),
        supabase
          .from("premium_subscriptions")
          .select("user_id, status, expires_at")
          .eq("status", "active")
          .in("user_id", supporterLookupIds),
        supabase
          .from("elite_levels")
          .select("level, monthly_gold_requirement")
          .order("level", { ascending: true }),
        supabase
          .from("gift_transactions")
          .select("sender_id, gold_cost")
          .in("sender_id", supporterLookupIds)
          .limit(1000),
        supabase
          .from("profile_boosts")
          .select("user_id, gold_cost")
          .in("user_id", supporterLookupIds)
          .limit(1000),
        supabase
          .from("payment_orders")
          .select("user_id, order_type, status, amount, amount_usd, gold_amount")
          .eq("status", "paid")
          .in("user_id", supporterLookupIds)
          .limit(1000),
      ])
    : [
        { data: [] },
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
      ];
  logEarningsQueryError("supporter premium status", supporterPremiumResult.error);
  logEarningsQueryError("supporter elite levels", supporterEliteLevelsResult.error);
  logEarningsQueryError("supporter gift spend", supporterGiftSpendResult.error);
  logEarningsQueryError("supporter boost spend", supporterBoostSpendResult.error);
  logEarningsQueryError("supporter paid orders", supporterPaidOrdersResult.error);
  const activePremiumSupporterIds = new Set(
    (supporterPremiumResult.data ?? [])
      .filter(
        (subscription) =>
          !subscription.expires_at ||
          new Date(subscription.expires_at) > new Date(),
      )
      .map((subscription) => subscription.user_id),
  );
  const supporterGiftSpendByUser = new Map<string, number>();
  (supporterGiftSpendResult.data ?? []).forEach((row) => {
    supporterGiftSpendByUser.set(
      row.sender_id,
      (supporterGiftSpendByUser.get(row.sender_id) ?? 0) +
        Math.max(0, Number(row.gold_cost ?? 0)),
    );
  });
  const supporterBoostSpendByUser = new Map<string, number>();
  (supporterBoostSpendResult.data ?? []).forEach((row) => {
    supporterBoostSpendByUser.set(
      row.user_id,
      (supporterBoostSpendByUser.get(row.user_id) ?? 0) +
        Math.max(0, Number(row.gold_cost ?? 0)),
    );
  });
  const supporterPaidOrdersByUser = new Map<
    string,
    {
      amount: number | null;
      amount_usd?: number | null;
      gold_amount: number | null;
      order_type: string;
    }[]
  >();
  (supporterPaidOrdersResult.data ?? []).forEach((order) => {
    supporterPaidOrdersByUser.set(order.user_id, [
      ...(supporterPaidOrdersByUser.get(order.user_id) ?? []),
      order,
    ]);
  });
  const supporterEliteStatusByUser = calculateEliteStatusesForUsers({
    boostSpendByUser: supporterBoostSpendByUser,
    giftSpendByUser: supporterGiftSpendByUser,
    levels: supporterEliteLevelsResult.data ?? [],
    paidOrdersByUser: supporterPaidOrdersByUser,
    userIds: supporterLookupIds,
  });
  const supporterProfileById = new Map(
    supporterProfiles?.map((profile) => [profile.id, profile]) ?? [],
  );
  const topSupporters = topSupporterIds.flatMap((supporterId) => {
    const profile = supporterProfileById.get(supporterId);
    const stats = supporterStats.get(supporterId);

    return profile && stats
      ? [
                  {
                    ...profile,
                    giftCount: stats.count,
                    eliteLevel:
                      supporterEliteStatusByUser.get(supporterId)?.currentLevel ?? 0,
                    hasPremium: activePremiumSupporterIds.has(supporterId),
                    latestGiftAt: stats.latestGiftAt,
                  },
        ]
      : [];
  });
  const weeklyTopSupporter =
    weeklyTopSupporterId && supporterProfileById.get(weeklyTopSupporterId)
      ? {
          ...supporterProfileById.get(weeklyTopSupporterId),
          giftCount: weeklySupporterStats.get(weeklyTopSupporterId)?.count ?? 0,
        }
      : null;
  const recentSupport =
    recentSupportRows.map((gift) => {
      const catalogGift = giftByType.get(gift.gift_type);
      const supporter = supporterProfileById.get(gift.sender_id);

      return {
        createdAt: gift.created_at,
        diamonds: diamondsFromGold(gift.gold_cost),
        giftName: catalogGift?.name ?? formatGiftName(gift.gift_type),
        goldCost: gift.gold_cost ?? catalogGift?.coinPrice ?? 0,
      sender: supporter ?? null,
      senderEliteLevel: supporter
        ? supporterEliteStatusByUser.get(supporter.id)?.currentLevel ?? 0
        : 0,
      senderHasPremium: supporter
        ? activePremiumSupporterIds.has(supporter.id)
        : false,
    };
  }) ?? [];
  const categoryBreakdown = [...categoryStats.entries()]
    .map(([category, stats]) => ({
      category,
      ...stats,
    }))
    .sort((left, right) => right.gold - left.gold || right.gifts - left.gifts);
  const weeklyRecapTotal =
    weeklyGiftRows.length +
    weeklyProfileViews +
    weeklyFollowers +
    weeklyStories +
    weeklyMoments;
  const momentumCta =
    weeklyStories === 0
      ? {
          href: "/discover",
          label: "Post story",
          note: "Stories keep attention warm.",
        }
      : weeklyMoments === 0
        ? {
            href: "/moments",
            label: "Share moment",
            note: "Moments give supporters a reason to return.",
          }
        : weeklyGiftRows.length === 0
          ? {
              href: "/profile",
              label: "Add support prompts",
              note: "Make support easy to start.",
            }
          : {
              href: "/discover",
              label: "Keep momentum",
              note: "Attention is already moving.",
            };
  const creatorMilestones = getCreatorMilestones({
    lifetimeDiamonds: wallet.diamonds_lifetime,
    momentCount: allMomentsResult.error ? 0 : (allMomentsResult.count ?? 0),
    profileViews: allProfileViewsResult.error
      ? 0
      : (allProfileViewsResult.count ?? 0),
    storyCount: allStoriesResult.error ? 0 : (allStoriesResult.count ?? 0),
    supporterCount: supporterStats.size,
    totalGifts: totalGiftsReceived,
  });
  const reachedMilestones = creatorMilestones.filter(
    (milestone) => milestone.reached,
  ).length;
  const recentStoryIds = storyTimelineRows.slice(0, 12).map((story) => story.id);
  const recentMomentIds = momentTimelineRows.slice(0, 12).map((moment) => moment.id);
  const [
    storyViewsResult,
    storyReactionsResult,
    storyRepliesResult,
    storyGiftsResult,
    momentLikesResult,
    momentCommentsResult,
    momentGiftsResult,
  ] = await Promise.all([
    recentStoryIds.length
      ? supabase
          .from("story_views")
          .select("story_id")
          .in("story_id", recentStoryIds)
      : Promise.resolve({ data: [], error: null }),
    recentStoryIds.length
      ? supabase
          .from("story_reactions")
          .select("story_id")
          .in("story_id", recentStoryIds)
      : Promise.resolve({ data: [], error: null }),
    recentStoryIds.length
      ? supabase
          .from("story_replies")
          .select("story_id")
          .in("story_id", recentStoryIds)
      : Promise.resolve({ data: [], error: null }),
    recentStoryIds.length
      ? supabase
          .from("story_gifts")
          .select("story_id")
          .in("story_id", recentStoryIds)
      : Promise.resolve({ data: [], error: null }),
    recentMomentIds.length
      ? supabase
          .from("moment_likes")
          .select("moment_id")
          .in("moment_id", recentMomentIds)
      : Promise.resolve({ data: [], error: null }),
    recentMomentIds.length
      ? supabase
          .from("moment_comments")
          .select("moment_id")
          .in("moment_id", recentMomentIds)
      : Promise.resolve({ data: [], error: null }),
    recentMomentIds.length
      ? supabase
          .from("moment_gifts")
          .select("moment_id")
          .in("moment_id", recentMomentIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  logEarningsQueryError("story views insight", storyViewsResult.error);
  logEarningsQueryError("story reactions insight", storyReactionsResult.error);
  logEarningsQueryError("story replies insight", storyRepliesResult.error);
  logEarningsQueryError("story gifts insight", storyGiftsResult.error);
  logEarningsQueryError("moment likes insight", momentLikesResult.error);
  logEarningsQueryError("moment comments insight", momentCommentsResult.error);
  logEarningsQueryError("moment gifts insight", momentGiftsResult.error);

  const storyViewCounts = countBy(
    storyViewsResult.data ?? [],
    (item) => item.story_id,
  );
  const storyReactionCounts = countBy(
    storyReactionsResult.data ?? [],
    (item) => item.story_id,
  );
  const storyReplyCounts = countBy(
    storyRepliesResult.data ?? [],
    (item) => item.story_id,
  );
  const storyGiftCounts = countBy(
    storyGiftsResult.data ?? [],
    (item) => item.story_id,
  );
  const momentLikeCounts = countBy(
    momentLikesResult.data ?? [],
    (item) => item.moment_id,
  );
  const momentCommentCounts = countBy(
    momentCommentsResult.data ?? [],
    (item) => item.moment_id,
  );
  const momentGiftCounts = countBy(
    momentGiftsResult.data ?? [],
    (item) => item.moment_id,
  );
  const bestContent = [
    ...storyTimelineRows.slice(0, 12).map((story) => {
      const views = storyViewCounts.get(story.id) ?? 0;
      const reactions = storyReactionCounts.get(story.id) ?? 0;
      const replies = storyReplyCounts.get(story.id) ?? 0;
      const gifts = storyGiftCounts.get(story.id) ?? 0;

      return {
        createdAt: story.created_at,
        detail: `${views} views · ${reactions + replies} responses · ${gifts} gifts`,
        label: "Story",
        score: views + reactions * 2 + replies * 3 + gifts * 5,
      };
    }),
    ...momentTimelineRows.slice(0, 12).map((moment) => {
      const likes = momentLikeCounts.get(moment.id) ?? 0;
      const comments = momentCommentCounts.get(moment.id) ?? 0;
      const gifts = momentGiftCounts.get(moment.id) ?? 0;

      return {
        createdAt: moment.created_at,
        detail: `${likes} likes · ${comments} comments · ${gifts} gifts`,
        label: "Moment",
        score: likes + comments * 3 + gifts * 5,
      };
    }),
  ].sort(
    (left, right) =>
      right.score - left.score ||
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  )[0];

  return (
    <AppShell
      currentUserId={user.id}
      profileId={currentProfile.public_id ?? currentProfile.id}
      title="Creator Earnings"
    >
      <div className="mt-6 rounded-3xl border border-emerald-300/15 bg-emerald-300/10 p-5 text-sm leading-6 text-emerald-50">
        Earn what your attention is worth.
      </div>

      <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Diamonds" value={formatDiamonds(wallet.diamonds_balance)} />
        <StatCard label="Est. cash" value={formatCurrency(cashEstimate)} />
        <StatCard label="Lifetime" value={formatDiamonds(wallet.diamonds_lifetime)} />
        <StatCard label="Pending" value={formatDiamonds(wallet.diamonds_pending)} />
        <StatCard label="Withdrawn" value={formatDiamonds(wallet.diamonds_withdrawn)} />
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-[1fr_0.85fr]">
        <DailyAttentionDigest
          counts={dailyDigestCounts}
          nextAction={creatorHabitAction}
        />
        <CreatorDailyActionCard
          action={creatorHabitAction}
          quiet={creatorQuietLately}
        />
      </section>

      <section className="mt-6 rounded-3xl border border-[#8B2FC9]/20 bg-[#8B2FC9]/10 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-[#B06EEE]">
              Habit layer
            </p>
            <h2 className="mt-2 text-xl font-black text-white">
              Creator progress
            </h2>
          </div>
          <span className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-xs text-neutral-300">
            Private
          </span>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-neutral-800 bg-black/35 p-4">
            <p className="text-sm text-neutral-400">Story streak</p>
            <p className="mt-2 text-3xl font-black text-white">
              {storyStreak}
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              {storyStreak > 0 ? "Active streak" : "Post today to start"}
            </p>
          </div>
          <div className="rounded-2xl border border-neutral-800 bg-black/35 p-4">
            <p className="text-sm text-neutral-400">Moment streak</p>
            <p className="mt-2 text-3xl font-black text-white">
              {momentStreak}
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              {momentStreak > 0 ? "Active streak" : "Share today to start"}
            </p>
          </div>
          <div className="rounded-2xl border border-neutral-800 bg-black/35 p-4">
            <p className="text-sm text-neutral-400">Best content</p>
            <p className="mt-2 truncate text-2xl font-black text-white">
              {bestContent?.label ?? "No signal yet"}
            </p>
            <p className="mt-1 truncate text-xs text-neutral-500">
              {bestContent?.detail ?? "Post to unlock insight"}
            </p>
          </div>
          <div className="rounded-2xl border border-[#D4AF37]/20 bg-[#D4AF37]/10 p-4">
            <p className="text-sm text-[#E8C46A]/80">Goal progress</p>
            <p className="mt-2 text-3xl font-black text-white">
              {goalProgress.percent}%
            </p>
            <p className="mt-1 text-xs text-[#E8C46A]/70">
              {goalProgress.remaining.toLocaleString()} Diamonds left
            </p>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-neutral-800 bg-black/30 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-black text-white">
                Creator milestones
              </p>
              <p className="mt-1 text-xs text-neutral-500">
                {reachedMilestones}/{creatorMilestones.length} reached
              </p>
            </div>
            <span className="rounded-full border border-[#D4AF37]/20 bg-[#D4AF37]/10 px-3 py-1 text-xs text-[#E8C46A]">
              Private
            </span>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {creatorMilestones.map((milestone) => (
              <div
                key={milestone.label}
                className={`rounded-xl border px-3 py-2 ${
                  milestone.reached
                    ? "border-[#D4AF37]/25 bg-[#D4AF37]/10"
                    : "border-white/10 bg-white/[0.03]"
                }`}
              >
                <p className="text-sm font-black text-white">
                  {milestone.label}
                </p>
                <p className="mt-0.5 text-xs text-neutral-500">
                  {milestone.copy}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-3xl border border-amber-300/15 bg-black/50 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-amber-100">
              Weekly Recap
            </p>
            <h2 className="mt-2 text-xl font-black text-white">
              {weeklyRecapTotal > 0 ? "Attention moved this week" : "Quiet week"}
            </h2>
            <p className="mt-1 text-sm text-neutral-500">
              Last 7 days · creator-only
            </p>
          </div>
          <Link
            href={momentumCta.href}
            className="w-fit rounded-full bg-white px-4 py-2 text-sm font-black text-black transition-opacity hover:opacity-90"
          >
            {momentumCta.label}
          </Link>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <RecapMetric
            change={formatRecapChange(weeklyDiamonds, previousWeeklyDiamonds)}
            label="Diamonds earned"
            value={weeklyDiamonds.toLocaleString()}
          />
          <RecapMetric
            change={formatRecapChange(
              weeklyGiftRows.length,
              previousWeeklyGiftRows.length,
            )}
            label="Gifts received"
            value={weeklyGiftRows.length.toLocaleString()}
          />
          <RecapMetric
            change={formatRecapChange(
              weeklyProfileViews,
              previousWeeklyProfileViews,
            )}
            label="Profile views"
            value={weeklyProfileViews.toLocaleString()}
          />
          <RecapMetric
            change={formatRecapChange(weeklyFollowers, previousWeeklyFollowers)}
            label="Followers gained"
            value={weeklyFollowers.toLocaleString()}
          />
          <RecapMetric
            change={formatRecapChange(weeklyStories, previousWeeklyStories)}
            label="Stories posted"
            value={weeklyStories.toLocaleString()}
          />
          <RecapMetric
            change={formatRecapChange(weeklyMoments, previousWeeklyMoments)}
            label="Moments posted"
            value={weeklyMoments.toLocaleString()}
          />
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_1.2fr]">
          <div className="rounded-2xl border border-neutral-800 bg-white/[0.03] p-4">
            <p className="text-xs font-medium text-neutral-500">Top gift</p>
            <p className="mt-2 truncate text-lg font-black text-white">
              {weeklyTopGift?.name ?? "No gifts yet"}
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              {weeklyTopGift
                ? `${weeklyTopGift.count} this week`
                : "Support will appear here."}
            </p>
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-white/[0.03] p-4">
            <p className="text-xs font-medium text-neutral-500">Top supporter</p>
            <p className="mt-2 truncate text-lg font-black text-white">
              {weeklyTopSupporter?.display_name ?? "No supporter yet"}
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              {weeklyTopSupporter
                ? `${weeklyTopSupporter.giftCount} gifts this week`
                : "Creator-only recognition."}
            </p>
          </div>

          <div className="rounded-2xl border border-amber-300/15 bg-amber-300/10 p-4">
            <p className="text-xs font-medium text-amber-100/70">Next move</p>
            <p className="mt-2 text-lg font-black text-amber-50">
              {momentumCta.label}
            </p>
            <p className="mt-1 text-sm leading-6 text-amber-100/70">
              {momentumCta.note}
            </p>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="rounded-3xl border border-neutral-800 bg-black/50 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-amber-100">
                Progress
              </p>
              <h2 className="mt-2 text-xl font-black">Creator momentum</h2>
            </div>
            <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1 text-xs font-medium text-amber-100">
              Private
            </span>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-neutral-800 bg-white/[0.03] p-4">
              <p className="text-sm text-neutral-400">Weekly Diamonds</p>
              <p className="mt-2 text-2xl font-black text-white">
                {weeklyDiamonds.toLocaleString()}
              </p>
              <p className="mt-1 text-xs text-neutral-500">Last 7 days</p>
            </div>
            <div className="rounded-2xl border border-neutral-800 bg-white/[0.03] p-4">
              <p className="text-sm text-neutral-400">Most received</p>
              <p className="mt-2 truncate text-2xl font-black text-white">
                {mostReceivedGift?.name ?? "No gifts yet"}
              </p>
              {mostReceivedGift ? (
                <p className="mt-1 text-xs text-neutral-500">
                  {mostReceivedGift.count} received
                </p>
              ) : (
                <p className="mt-1 text-xs text-neutral-500">
                  Gifts will appear here.
                </p>
              )}
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-amber-300/15 bg-amber-300/10 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-amber-50">
                  Creator goal
                </p>
                <p className="mt-1 text-xs text-amber-100/70">
                  {formatDiamonds(creatorGoalDiamonds)}
                </p>
              </div>
              <p className="text-sm font-black text-amber-50">{goalPercent}%</p>
            </div>
            <div className="mt-4">
              <ProgressBar value={goalPercent} />
            </div>
            <p className="mt-3 text-xs text-amber-100/70">
              {goalProgress.remaining > 0
                ? `${formatDiamonds(goalProgress.remaining)} remaining · ${goalProgress.status}`
                : goalProgress.status}
            </p>
          </div>
        </div>

        <div className="rounded-3xl border border-neutral-800 bg-black/50 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-amber-100">
                Supporters
              </p>
              <h2 className="mt-2 text-xl font-black">Top Supporters</h2>
            </div>
            <span className="text-xs text-neutral-500">
              Creator-only
            </span>
          </div>

          <div className="mt-5 space-y-3">
            {topSupporters.length ? (
              topSupporters.map((supporter, index) => {
                const visibleBadges = getVisibleStatusBadges([
                  supporter.hasPremium ? { type: "premium" } : null,
                  supporter.eliteLevel > 0
                    ? { level: supporter.eliteLevel, type: "elite" }
                    : null,
                ]);

                return (
                <Link
                  key={supporter.id}
                  href={getProfileHref(supporter)}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-neutral-800 bg-white/[0.03] p-3 transition-colors hover:border-neutral-600"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-neutral-950">
                      {supporter.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={supporter.avatar_url}
                          alt={supporter.display_name ?? "Supporter"}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="text-sm font-black text-neutral-600">
                          {initialFor(supporter.display_name)}
                        </span>
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-white">
                        {supporter.display_name ?? "Supporter"}
                      </span>
                      <span className="block text-xs text-neutral-500">
                        {supporter.giftCount} gifts
                      </span>
                      <span className="mt-1 flex flex-wrap gap-1">
                        {visibleBadges.map((badge) => (
                          <StatusBadge
                            key={badge.type}
                            level={badge.level}
                            size="compact"
                            type={badge.type}
                          />
                        ))}
                      </span>
                    </span>
                  </span>
                  <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-2.5 py-1 text-xs text-amber-100">
                    #{index + 1}
                  </span>
                </Link>
                );
              })
            ) : (
              <p className="rounded-2xl border border-neutral-800 bg-white/[0.03] p-4 text-sm text-neutral-400">
                Supporters will appear after gifts arrive.
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-3xl border border-neutral-800 bg-black/50 p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-amber-100">
              Gift analytics
            </p>
            <h2 className="mt-2 text-xl font-black">Creator Gift Performance</h2>
          </div>
          <span className="w-fit rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-xs text-amber-100">
            Creator-only
          </span>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-neutral-800 bg-white/[0.03] p-4">
            <p className="text-sm text-neutral-400">Gifts received</p>
            <p className="mt-2 text-2xl font-black text-white">
              {totalGiftsReceived.toLocaleString()}
            </p>
          </div>
          <div className="rounded-2xl border border-neutral-800 bg-white/[0.03] p-4">
            <p className="text-sm text-neutral-400">Gold generated</p>
            <p className="mt-2 text-2xl font-black text-white">
              {totalGoldGenerated.toLocaleString()}
            </p>
          </div>
          <div className="rounded-2xl border border-neutral-800 bg-white/[0.03] p-4">
            <p className="text-sm text-neutral-400">Diamonds generated</p>
            <p className="mt-2 text-2xl font-black text-white">
              {totalDiamondsGenerated.toLocaleString()}
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-2">
          {categoryBreakdown.length ? (
            categoryBreakdown.map((category) => (
              <div
                key={category.category}
                className="grid gap-3 rounded-2xl border border-neutral-800 bg-white/[0.03] p-4 text-sm text-neutral-300 sm:grid-cols-[1fr_auto_auto_auto]"
              >
                <p className="font-black text-white">{category.category}</p>
                <p>{category.gifts.toLocaleString()} gifts</p>
                <p>{category.gold.toLocaleString()} Gold</p>
                <p>{category.diamonds.toLocaleString()} Diamonds</p>
              </div>
            ))
          ) : (
            <p className="rounded-2xl border border-neutral-800 bg-white/[0.03] p-4 text-sm text-neutral-400">
              Category performance will appear after gifts arrive.
            </p>
          )}
        </div>
      </section>

      <section className="mt-6 rounded-3xl border border-neutral-800 bg-black/50 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-amber-100">
              Latest
            </p>
            <h2 className="mt-2 text-xl font-black">Recent Support</h2>
          </div>
          <span className="text-xs text-neutral-500">
            {recentSupport.length} latest
          </span>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {recentSupport.length ? (
            recentSupport.map((gift, index) => {
              const visibleBadges = getVisibleStatusBadges([
                gift.senderHasPremium ? { type: "premium" } : null,
                gift.senderEliteLevel > 0
                  ? { level: gift.senderEliteLevel, type: "elite" }
                  : null,
              ]);

              return (
              <div
                key={`${gift.giftName}-${gift.createdAt}-${index}`}
                className="rounded-2xl border border-neutral-800 bg-white/[0.03] p-4"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-neutral-950">
                    {gift.sender?.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={gift.sender.avatar_url}
                        alt={gift.sender.display_name ?? "Supporter"}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="text-xs font-black text-neutral-600">
                        {initialFor(gift.sender?.display_name)}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white">
                      {gift.sender?.display_name ?? "Supporter"}
                    </p>
                    <p className="truncate text-xs text-neutral-500">
                      {formatDate(gift.createdAt)}
                    </p>
                    {visibleBadges.length ? (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {visibleBadges.map((badge) => (
                          <StatusBadge
                            key={badge.type}
                            level={badge.level}
                            size="compact"
                            type={badge.type}
                          />
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-white">{gift.giftName}</p>
                    <p className="mt-1 text-xs text-neutral-500">
                      {gift.goldCost} Gold
                    </p>
                  </div>
                  <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-xs font-medium text-amber-100">
                    +{gift.diamonds} Diamonds
                  </span>
                </div>
              </div>
              );
            })
          ) : (
            <p className="rounded-2xl border border-neutral-800 bg-white/[0.03] p-4 text-sm text-neutral-400 md:col-span-2 xl:col-span-3">
              Recent support will appear here.
            </p>
          )}
        </div>
      </section>

      <section className="mt-6 rounded-3xl border border-neutral-800 bg-black/50 p-5">
        <h2 className="text-xl font-black">Withdraw</h2>
        <p className="mt-2 text-sm leading-6 text-neutral-400">
          Min: {formatDiamonds(minimumWithdrawal ?? 5000)} · {diamondsPerUsd} = $1
        </p>
        <p className="mt-2 text-sm leading-6 text-neutral-500">
          Tier: {creatorTier?.name ?? "Standard"} ·{" "}
          {creatorTier?.creator_percentage ?? 50}%
        </p>
        <form action={requestWithdrawal} className="mt-5 grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]">
          <input
            name="diamonds_amount"
            placeholder="Diamonds amount"
            type="number"
            className="rounded-2xl border border-neutral-800 bg-black px-4 py-3 text-sm text-white placeholder:text-neutral-500"
          />
          <select
            name="payout_method"
            className="rounded-2xl border border-neutral-800 bg-black px-4 py-3 text-sm text-white"
          >
            <option value="bank_transfer">Bank transfer</option>
            <option value="paystack">Paystack</option>
            <option value="stripe">Stripe</option>
            <option value="usdt">USDT</option>
          </select>
          <input
            name="payout_handle"
            placeholder="Payout details"
            className="rounded-2xl border border-neutral-800 bg-black px-4 py-3 text-sm text-white placeholder:text-neutral-500"
          />
          <button
            type="submit"
            className="rounded-full bg-white px-5 py-3 text-sm font-black text-black"
          >
            Request
          </button>
        </form>
      </section>

      <div className="mt-6">
        <section className="rounded-3xl border border-neutral-800 bg-black/50 p-5">
          <h2 className="text-xl font-black">Withdrawals</h2>
          <div className="mt-5 space-y-3">
            {withdrawalRows.length ? (
              withdrawalRows.map((request) => (
                <div
                  key={request.id}
                  className="rounded-2xl border border-neutral-800 bg-white/[0.03] p-4 text-sm"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-black text-white">
                      {formatDiamonds(request.diamonds_amount)}
                    </p>
                    <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1 text-xs text-amber-100">
                      {request.status}
                    </span>
                  </div>
                  <p className="mt-1 text-neutral-400">
                    {formatCurrency(request.cash_estimate)} · {request.payout_method} ·{" "}
                    {formatDate(request.created_at)}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-neutral-400">No withdrawals yet</p>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
