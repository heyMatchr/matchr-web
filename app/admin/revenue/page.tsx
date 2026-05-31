import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/app/_components/app-shell";
import { requireAdmin } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { adminUserHref } from "../admin-shared";

type ProfileSummary = {
  avatar_url: string | null;
  display_name: string;
  id: string;
  public_id: string | null;
};

type WalletTransaction = {
  created_at: string;
  gold_delta: number;
  reference_type: string | null;
  transaction_type: string;
  user_id: string;
};

type GiftTransaction = {
  created_at: string;
  gift_type: string;
  gold_cost: number | null;
  receiver_id: string;
  sender_id: string;
};

type MessageCharge = {
  created_at: string;
  gold_cost: number;
  sender_id: string;
};

type RankedRow = {
  label: string;
  profile?: ProfileSummary | null;
  secondary?: string;
  total: number;
};

type SeriesPoint = {
  date: string;
  label: string;
  value: number;
};

function formatNumber(value: number) {
  return Math.round(value).toLocaleString();
}

function formatCurrency(value: number) {
  return `$${value.toLocaleString(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString([], {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
  });
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function dateKey(date: Date | string) {
  return new Date(date).toISOString().slice(0, 10);
}

function buildDateKeys(days: number) {
  const today = startOfDay(new Date());
  return Array.from({ length: days }, (_, index) =>
    dateKey(addDays(today, index - days + 1)),
  );
}

function formatShortDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString([], {
    day: "numeric",
    month: "short",
  });
}

function seriesByDay<T>(
  rows: T[],
  days: number,
  getDate: (row: T) => string,
  getValue: (row: T) => number = () => 1,
) {
  const keys = buildDateKeys(days);
  const totals = new Map(keys.map((key) => [key, 0]));

  rows.forEach((row) => {
    const key = dateKey(getDate(row));
    if (!totals.has(key)) {
      return;
    }
    totals.set(key, (totals.get(key) ?? 0) + getValue(row));
  });

  return keys.map<SeriesPoint>((key) => ({
    date: key,
    label: formatShortDate(key),
    value: totals.get(key) ?? 0,
  }));
}

function sumBy<T>(rows: T[], getValue: (row: T) => number) {
  return rows.reduce((total, row) => total + getValue(row), 0);
}

function rankBy<T>(
  rows: T[],
  getKey: (row: T) => string,
  getValue: (row: T) => number,
) {
  const totals = new Map<string, number>();
  rows.forEach((row) => {
    const key = getKey(row);
    if (!key) {
      return;
    }
    totals.set(key, (totals.get(key) ?? 0) + getValue(row));
  });

  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
}

function MetricCard({
  label,
  tone = "emerald",
  value,
}: {
  label: string;
  tone?: "amber" | "emerald" | "rose";
  value: string | number;
}) {
  const toneClass =
    tone === "amber"
      ? "border-amber-300/25 bg-amber-300/10 text-amber-100"
      : tone === "rose"
        ? "border-rose-300/25 bg-rose-300/10 text-rose-100"
        : "border-emerald-300/25 bg-emerald-300/10 text-emerald-100";

  return (
    <article className="rounded-2xl border border-neutral-800 bg-black/50 p-5">
      <p className="text-sm font-medium text-neutral-400">{label}</p>
      <p className="mt-3 text-3xl font-black tracking-tight text-white">
        {typeof value === "number" ? formatNumber(value) : value}
      </p>
      <div className={`mt-4 h-1.5 rounded-full border ${toneClass}`} />
    </article>
  );
}

function BarChart({
  color = "#fbbf24",
  series,
  title,
}: {
  color?: string;
  series: SeriesPoint[];
  title: string;
}) {
  const maxValue = Math.max(1, ...series.map((point) => point.value));

  return (
    <section className="rounded-2xl border border-neutral-800 bg-black/50 p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-black text-white">{title}</h2>
        <span className="rounded-full border border-neutral-800 px-3 py-1 text-xs text-neutral-400">
          30 days
        </span>
      </div>
      <div className="mt-5 flex h-56 items-end gap-1.5 rounded-2xl border border-neutral-900 bg-black/40 p-3">
        {series.map((point) => (
          <div key={point.date} className="flex min-w-0 flex-1 flex-col items-center gap-2">
            <div
              className="w-full rounded-t-md"
              style={{
                backgroundColor: color,
                height: `${Math.max(6, (point.value / maxValue) * 180)}px`,
              }}
              title={`${point.label}: ${formatNumber(point.value)}`}
            />
            <span className="hidden text-[10px] text-neutral-600 sm:block">
              {point.label.split(" ")[1] ?? point.label}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function RankingTable({
  emptyLabel,
  rows,
  title,
}: {
  emptyLabel: string;
  rows: RankedRow[];
  title: string;
}) {
  return (
    <section className="rounded-2xl border border-neutral-800 bg-black/50 p-5">
      <h2 className="text-xl font-black text-white">{title}</h2>
      <div className="mt-5 space-y-3">
        {rows.length ? (
          rows.map((row) => {
            const href = row.profile ? adminUserHref(row.profile) : null;
            const content = (
              <>
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-white">{row.label}</p>
                  {row.secondary ? (
                    <p className="truncate text-xs text-neutral-500">{row.secondary}</p>
                  ) : null}
                </div>
                <p className="shrink-0 rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1 text-sm font-black text-amber-100">
                  {formatNumber(row.total)}
                </p>
              </>
            );

            return href ? (
              <Link
                key={`${title}-${row.label}`}
                href={href}
                className="flex items-center justify-between gap-3 rounded-2xl border border-neutral-800 bg-white/[0.03] p-3 transition-colors hover:border-emerald-300/30"
              >
                {content}
              </Link>
            ) : (
              <div
                key={`${title}-${row.label}`}
                className="flex items-center justify-between gap-3 rounded-2xl border border-neutral-800 bg-white/[0.03] p-3"
              >
                {content}
              </div>
            );
          })
        ) : (
          <p className="rounded-2xl border border-neutral-800 bg-white/[0.03] p-4 text-sm text-neutral-400">
            {emptyLabel}
          </p>
        )}
      </div>
    </section>
  );
}

export default async function AdminRevenuePage() {
  const admin = await requireAdmin();
  const supabase = createSupabaseAdminClient();
  const { data: currentProfile } = await supabase
    .from("profiles")
    .select("id, public_id, onboarding_completed")
    .eq("id", admin.id)
    .maybeSingle();

  if (!currentProfile?.onboarding_completed) {
    redirect("/onboarding");
  }

  const now = new Date();
  const todayStart = startOfDay(now).toISOString();
  const sevenDaysAgo = addDays(startOfDay(now), -6).toISOString();
  const thirtyDaysAgo = addDays(startOfDay(now), -29).toISOString();

  const [
    walletsResult,
    walletTransactionsResult,
    giftsResult,
    messageChargesResult,
    premiumResult,
    latestTransactionsResult,
  ] = await Promise.all([
    supabase.from("user_wallets").select("user_id, gold_balance").limit(50000),
    supabase
      .from("wallet_transactions")
      .select("user_id, transaction_type, gold_delta, reference_type, created_at")
      .order("created_at", { ascending: false })
      .limit(50000),
    supabase
      .from("gift_transactions")
      .select("sender_id, receiver_id, gift_type, gold_cost, created_at")
      .order("created_at", { ascending: false })
      .limit(50000),
    supabase
      .from("message_charges")
      .select("sender_id, gold_cost, created_at")
      .order("created_at", { ascending: false })
      .limit(50000),
    supabase
      .from("premium_subscriptions")
      .select("user_id, plan_name, status, price_usd, interval, created_at")
      .order("created_at", { ascending: false })
      .limit(50000),
    supabase
      .from("wallet_transactions")
      .select("user_id, transaction_type, gold_delta, reference_type, created_at")
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  const firstError = [
    walletsResult,
    walletTransactionsResult,
    giftsResult,
    messageChargesResult,
    premiumResult,
    latestTransactionsResult,
  ].find((result) => result.error)?.error;

  if (firstError) {
    throw new Error(firstError.message);
  }

  const wallets = walletsResult.data ?? [];
  const walletTransactions = (walletTransactionsResult.data ?? []) as WalletTransaction[];
  const gifts = (giftsResult.data ?? []) as GiftTransaction[];
  const messageCharges = (messageChargesResult.data ?? []) as MessageCharge[];
  const premiumRows = premiumResult.data ?? [];
  const latestTransactions = (latestTransactionsResult.data ?? []) as WalletTransaction[];
  const currentGoldHeld = sumBy(wallets, (row) => row.gold_balance ?? 0);
  const totalGoldIssued = sumBy(
    walletTransactions.filter((row) => row.gold_delta > 0),
    (row) => row.gold_delta,
  );
  const totalGoldSpent = Math.abs(
    sumBy(
      walletTransactions.filter((row) => row.gold_delta < 0),
      (row) => row.gold_delta,
    ),
  );
  const starterGoldIssued = sumBy(
    walletTransactions.filter((row) => row.reference_type === "Starter Gold Bonus"),
    (row) => row.gold_delta,
  );
  const messageChargeGold = sumBy(messageCharges, (row) => row.gold_cost);
  const giftSpendGold = sumBy(gifts, (row) => row.gold_cost ?? 0);
  const giftsToday = gifts.filter((row) => row.created_at >= todayStart).length;
  const giftsSeven = gifts.filter((row) => row.created_at >= sevenDaysAgo).length;
  const giftsThirty = gifts.filter((row) => row.created_at >= thirtyDaysAgo).length;
  const activePremiumUsers = premiumRows.filter((row) => row.status === "active");
  const projectedWeeklyPremiumRevenue = sumBy(activePremiumUsers, (row) =>
    Number(row.price_usd ?? 0),
  );
  const projectedMonthlyPremiumRevenue = projectedWeeklyPremiumRevenue * 4.33;
  const profileIds = [
    ...new Set([
      ...gifts.flatMap((row) => [row.sender_id, row.receiver_id]),
      ...walletTransactions.map((row) => row.user_id),
      ...latestTransactions.map((row) => row.user_id),
    ]),
  ].filter((id): id is string => Boolean(id));
  const { data: profiles, error: profileError } = profileIds.length
    ? await supabase
        .from("profiles")
        .select("id, public_id, display_name, avatar_url")
        .in("id", profileIds)
    : { data: [], error: null };

  if (profileError) {
    throw new Error(profileError.message);
  }

  const profilesById = new Map(
    (profiles ?? []).map((profile) => [profile.id, profile as ProfileSummary]),
  );
  const mostSentGifts = rankBy(gifts, (row) => row.gift_type, () => 1).map(
    ([giftType, total]) => ({
      label: giftType.replaceAll("_", " "),
      secondary: "gifts sent",
      total,
    }),
  );
  const topGifters = rankBy(
    gifts,
    (row) => row.sender_id,
    (row) => row.gold_cost ?? 0,
  ).map(([userId, total]) => ({
    label: profilesById.get(userId)?.display_name ?? "Unknown user",
    profile: profilesById.get(userId) ?? null,
    secondary: profilesById.get(userId)?.public_id ?? userId,
    total,
  }));
  const topEarners = rankBy(
    walletTransactions.filter(
      (row) => row.transaction_type === "gift_received" && row.gold_delta > 0,
    ),
    (row) => row.user_id,
    (row) => row.gold_delta,
  ).map(([userId, total]) => ({
    label: profilesById.get(userId)?.display_name ?? "Unknown user",
    profile: profilesById.get(userId) ?? null,
    secondary: profilesById.get(userId)?.public_id ?? userId,
    total,
  }));
  const goldSpentSeries = seriesByDay(
    walletTransactions.filter((row) => row.gold_delta < 0),
    30,
    (row) => row.created_at,
    (row) => Math.abs(row.gold_delta),
  );
  const giftsSeries = seriesByDay(gifts, 30, (row) => row.created_at);
  const topGiftSeries = mostSentGifts.slice(0, 8).map((row) => ({
    date: row.label,
    label: row.label,
    value: row.total,
  }));

  return (
    <AppShell
      currentUserId={admin.id}
      maxWidth="max-w-7xl"
      profileId={currentProfile.public_id ?? currentProfile.id}
      title="Admin Revenue"
    >
      <div className="mt-6 flex flex-col gap-4 rounded-2xl border border-neutral-800 bg-black/50 p-5 md:flex-row md:items-end md:justify-between">
        <div>
          <Link href="/admin" className="text-sm font-medium text-emerald-100">
            Back to admin
          </Link>
          <h2 className="mt-3 text-2xl font-black tracking-tight text-white">
            Revenue dashboard
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-neutral-400">
            Gold movement, gift behavior, premium readiness, and latest economy
            transactions before payment integration goes live.
          </p>
        </div>
        <Link
          href="/admin/analytics"
          className="w-fit rounded-full border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 transition-colors hover:border-emerald-300/40 hover:bg-emerald-300/10"
        >
          Platform analytics
        </Link>
      </div>

      <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total Gold issued" tone="amber" value={totalGoldIssued} />
        <MetricCard label="Total Gold spent" tone="rose" value={totalGoldSpent} />
        <MetricCard label="Gold held by users" value={currentGoldHeld} />
        <MetricCard label="Starter Gold issued" tone="amber" value={starterGoldIssued} />
        <MetricCard label="Message charges" tone="rose" value={messageChargeGold} />
        <MetricCard label="Gift spend" tone="amber" value={giftSpendGold} />
        <MetricCard label="Total gifts sent" tone="amber" value={gifts.length} />
        <MetricCard label="Active premium users" value={activePremiumUsers.length} />
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-3">
        <MetricCard label="Gifts today" tone="amber" value={giftsToday} />
        <MetricCard label="Gifts last 7 days" tone="amber" value={giftsSeven} />
        <MetricCard label="Gifts last 30 days" tone="amber" value={giftsThirty} />
      </section>

      <section className="mt-6 rounded-2xl border border-neutral-800 bg-black/50 p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-black text-white">Premium prep</h2>
            <p className="mt-1 text-sm leading-6 text-neutral-400">
              Placeholder revenue model based on active subscription rows.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-4">
              <p className="text-sm text-emerald-100">Projected weekly</p>
              <p className="mt-1 text-2xl font-black text-white">
                {formatCurrency(projectedWeeklyPremiumRevenue)}
              </p>
            </div>
            <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4">
              <p className="text-sm text-amber-100">Projected monthly</p>
              <p className="mt-1 text-2xl font-black text-white">
                {formatCurrency(projectedMonthlyPremiumRevenue)}
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <BarChart color="#fbbf24" series={goldSpentSeries} title="Gold Spent Over Time" />
        <BarChart color="#34d399" series={giftsSeries} title="Gifts Sent Over Time" />
        <BarChart color="#a78bfa" series={topGiftSeries} title="Top Gifts" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <RankingTable
          emptyLabel="No gifts sent yet."
          rows={mostSentGifts}
          title="Most Sent Gifts"
        />
        <RankingTable
          emptyLabel="No gift spend yet."
          rows={topGifters}
          title="Top Gifters"
        />
        <RankingTable
          emptyLabel="No gift earnings yet."
          rows={topEarners}
          title="Top Earners"
        />
      </div>

      <section className="mt-6 rounded-2xl border border-neutral-800 bg-black/50 p-5">
        <h2 className="text-xl font-black text-white">Latest Transactions</h2>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="text-xs uppercase text-neutral-500">
              <tr>
                <th className="pb-3 pr-4">User</th>
                <th className="pb-3 pr-4">Type</th>
                <th className="pb-3 pr-4">Amount</th>
                <th className="pb-3 pr-4">Reference</th>
                <th className="pb-3">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-900">
              {latestTransactions.map((transaction) => {
                const profile = profilesById.get(transaction.user_id);
                return (
                  <tr key={`${transaction.user_id}-${transaction.created_at}`}>
                    <td className="py-3 pr-4">
                      {profile ? (
                        <Link
                          href={adminUserHref(profile)}
                          className="font-medium text-emerald-100"
                        >
                          {profile.public_id ?? profile.display_name}
                        </Link>
                      ) : (
                        <span className="text-neutral-400">{transaction.user_id}</span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-neutral-300">
                      {transaction.transaction_type}
                    </td>
                    <td
                      className={`py-3 pr-4 font-black ${
                        transaction.gold_delta >= 0 ? "text-emerald-100" : "text-rose-100"
                      }`}
                    >
                      {transaction.gold_delta > 0 ? "+" : ""}
                      {formatNumber(transaction.gold_delta)} Gold
                    </td>
                    <td className="py-3 pr-4 text-neutral-500">
                      {transaction.reference_type ?? "—"}
                    </td>
                    <td className="py-3 text-neutral-400">
                      {formatDate(transaction.created_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}
