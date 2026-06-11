import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { AppShell } from "@/app/_components/app-shell";
import { getEconomyConfig, getGiftCatalog } from "@/lib/economy";
import { getProfileHref } from "@/lib/profile-public-id";
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

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-3xl border border-neutral-800 bg-black/50 p-5">
      <p className="text-sm font-medium text-neutral-400">{label}</p>
      <p className="mt-3 text-3xl font-black tracking-tight text-white">{value}</p>
    </article>
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

  const [
    walletResult,
    withdrawalsResult,
    recentSupportResult,
    weeklyGiftsResult,
    aggregateGiftsResult,
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
      .select("gift_type, gold_cost, created_at")
      .eq("receiver_id", user.id)
      .gte("created_at", sevenDaysAgo.toISOString())
      .order("created_at", { ascending: false }),
    supabase
      .from("gift_transactions")
      .select("sender_id, gift_type, gold_cost, created_at")
      .eq("receiver_id", user.id)
      .order("created_at", { ascending: false })
      .limit(500),
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
  logEarningsQueryError("aggregate gifts", aggregateGiftsResult.error);
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
  const creatorGoalDiamonds = 5000;
  const goalPercent = Math.min(
    100,
    Math.round((wallet.diamonds_balance / creatorGoalDiamonds) * 100),
  );
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
    .map(([supporterId]) => supporterId);
  const recentSupporterIds = recentSupportRows.map((gift) => gift.sender_id);
  const supporterLookupIds = [
    ...new Set([...topSupporterIds, ...recentSupporterIds]),
  ];
  const { data: supporterProfiles } = supporterLookupIds.length
    ? await supabase
        .from("profiles")
        .select("id, public_id, display_name, avatar_url")
        .in("id", supporterLookupIds)
    : { data: [] };
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
            latestGiftAt: stats.latestGiftAt,
          },
        ]
      : [];
  });
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
      };
    }) ?? [];
  const categoryBreakdown = [...categoryStats.entries()]
    .map(([category, stats]) => ({
      category,
      ...stats,
    }))
    .sort((left, right) => right.gold - left.gold || right.gifts - left.gifts);

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
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-black/45">
              <div
                className="h-full rounded-full bg-[#C8A24A]"
                style={{ width: `${goalPercent}%` }}
              />
            </div>
            <p className="mt-3 text-xs text-amber-100/70">
              {formatDiamonds(wallet.diamonds_balance)} available
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
              topSupporters.map((supporter, index) => (
                <Link
                  key={supporter.id}
                  href={getProfileHref(supporter)}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-neutral-800 bg-white/[0.03] p-3 transition-colors hover:border-neutral-600"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-neutral-950">
                      {supporter.avatar_url ? (
                        <Image
                          src={supporter.avatar_url}
                          alt={supporter.display_name ?? "Supporter"}
                          width={44}
                          height={44}
                          sizes="44px"
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
                    </span>
                  </span>
                  <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-2.5 py-1 text-xs text-amber-100">
                    #{index + 1}
                  </span>
                </Link>
              ))
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
            recentSupport.map((gift, index) => (
              <div
                key={`${gift.giftName}-${gift.createdAt}-${index}`}
                className="rounded-2xl border border-neutral-800 bg-white/[0.03] p-4"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-neutral-950">
                    {gift.sender?.avatar_url ? (
                      <Image
                        src={gift.sender.avatar_url}
                        alt={gift.sender.display_name ?? "Supporter"}
                        width={40}
                        height={40}
                        sizes="40px"
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
            ))
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
