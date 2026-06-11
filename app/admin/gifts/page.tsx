import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell } from "@/app/_components/app-shell";
import { requireAdmin } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type GiftCatalogRow = {
  active: boolean;
  category: string;
  gold_cost: number;
  id: string;
  name: string;
  sort_order: number;
};

type GiftTransactionRow = {
  client_request_id: string | null;
  created_at: string;
  gift_type: string;
  gold_cost: number | null;
  receiver_id: string;
  sender_id: string;
};

type GiftMetric = {
  category: string;
  goldCost: number;
  id: string;
  name: string;
  repeatRate: number;
  repeatSends: number;
  revenue: number;
  sends: number;
};

type BarChartRow = {
  label: string;
  secondary?: string;
  value: number;
};

const PRICE_BANDS = [
  { label: "1-25 Gold", max: 25, min: 1 },
  { label: "26-100 Gold", max: 100, min: 26 },
  { label: "101-500 Gold", max: 500, min: 101 },
  { label: "501-2500 Gold", max: 2500, min: 501 },
  { label: "2500+ Gold", max: Number.POSITIVE_INFINITY, min: 2501 },
];

function formatNumber(value: number) {
  return Math.round(value).toLocaleString();
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function logAdminGiftQueryError(
  label: string,
  error: { message?: string } | null | undefined,
) {
  if (error) {
    console.error(`[Admin Gifts] ${label} query failed`, error.message ?? error);
  }
}

function isValidGiftTransaction(
  gift: Partial<GiftTransactionRow>,
): gift is GiftTransactionRow {
  return Boolean(gift.sender_id && gift.receiver_id && gift.gift_type);
}

function getPriceBand(cost: number) {
  return PRICE_BANDS.find((band) => cost >= band.min && cost <= band.max) ?? PRICE_BANDS[0];
}

function formatShortDate(value: Date) {
  return value.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
  });
}

function getGiftActivityTrendRows(gifts: GiftTransactionRow[]) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const days = Array.from({ length: 10 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (9 - index));

    return date;
  });
  const countsByDay = new Map(days.map((date) => [date.toISOString().slice(0, 10), 0]));

  gifts.forEach((gift) => {
    const date = new Date(gift.created_at);

    if (Number.isNaN(date.getTime())) {
      return;
    }

    const key = date.toISOString().slice(0, 10);

    if (countsByDay.has(key)) {
      countsByDay.set(key, (countsByDay.get(key) ?? 0) + 1);
    }
  });

  return days.map((date) => ({
    label: formatShortDate(date),
    value: countsByDay.get(date.toISOString().slice(0, 10)) ?? 0,
  }));
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-2xl border border-neutral-800 bg-white/[0.03] p-5">
      <p className="text-sm font-medium text-neutral-400">{label}</p>
      <p className="mt-3 text-3xl font-black tracking-tight text-white">{value}</p>
    </article>
  );
}

function MetricTable({
  empty,
  rows,
  title,
}: {
  empty: string;
  rows: GiftMetric[];
  title: string;
}) {
  return (
    <section className="rounded-3xl border border-neutral-800 bg-black/50 p-5">
      <h2 className="text-xl font-black">{title}</h2>
      <div className="mt-5 grid gap-2">
        {rows.length ? (
          rows.map((gift) => (
            <div
              key={`${title}-${gift.id}`}
              className="grid gap-3 rounded-2xl border border-neutral-800 bg-white/[0.03] p-4 text-sm text-neutral-300 md:grid-cols-[1fr_auto_auto_auto]"
            >
              <div>
                <p className="font-black text-white">{gift.name}</p>
                <p className="mt-1 text-xs text-neutral-500">
                  {gift.category} · {gift.goldCost} Gold
                </p>
              </div>
              <p>{formatNumber(gift.sends)} sends</p>
              <p>{formatNumber(gift.revenue)} Gold</p>
              <p>{formatPercent(gift.repeatRate)} repeat</p>
            </div>
          ))
        ) : (
          <p className="rounded-2xl border border-neutral-800 bg-white/[0.03] p-4 text-sm text-neutral-400">
            {empty}
          </p>
        )}
      </div>
    </section>
  );
}

function ChartFrame({
  children,
  empty,
  title,
}: {
  children: ReactNode;
  empty: string;
  title: string;
}) {
  return (
    <section className="min-w-0 rounded-3xl border border-neutral-800 bg-black/50 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-white">{title}</h2>
          <p className="mt-1 text-xs text-neutral-500">{empty}</p>
        </div>
        <span className="rounded-full border border-[#C8A24A]/25 bg-[#C8A24A]/10 px-3 py-1 text-xs font-bold text-[#E8C46A]">
          Gifts
        </span>
      </div>
      <div className="relative mt-4 overflow-hidden rounded-2xl border border-neutral-900 bg-black/60">
        {children}
      </div>
    </section>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="grid h-[300px] place-items-center px-5 text-center text-sm text-neutral-400">
      {message}
    </div>
  );
}

function VerticalBarChart({
  empty,
  formatter = formatNumber,
  rows,
  title,
}: {
  empty: string;
  formatter?: (value: number) => string;
  rows: BarChartRow[];
  title: string;
}) {
  const chartRows = rows.slice(0, 8);
  const width = 720;
  const height = 260;
  const pad = { bottom: 48, left: 44, right: 20, top: 18 };
  const maxValue = Math.max(1, ...chartRows.map((row) => row.value));
  const chartWidth = width - pad.left - pad.right;
  const barWidth = Math.max(18, chartWidth / Math.max(1, chartRows.length) - 12);
  const xFor = (index: number) =>
    pad.left + (index + 0.5) * (chartWidth / Math.max(1, chartRows.length));
  const yFor = (value: number) =>
    height - pad.bottom - (value / maxValue) * (height - pad.top - pad.bottom);

  return (
    <ChartFrame empty={empty} title={title}>
      {chartRows.length ? (
        <svg className="h-[300px] w-full" role="img" viewBox={`0 0 ${width} ${height}`}>
          {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
            const y = pad.top + tick * (height - pad.top - pad.bottom);

            return (
              <g key={tick}>
                <line
                  stroke="rgba(255,255,255,0.07)"
                  x1={pad.left}
                  x2={width - pad.right}
                  y1={y}
                  y2={y}
                />
                <text fill="rgba(255,255,255,0.38)" fontSize="10" x="4" y={y + 3}>
                  {formatter(maxValue * (1 - tick))}
                </text>
              </g>
            );
          })}
          {chartRows.map((row, index) => {
            const x = xFor(index) - barWidth / 2;
            const y = yFor(row.value);
            const barHeight = height - pad.bottom - y;

            return (
              <g key={`${title}-${row.label}`}>
                <rect
                  fill="#C8A24A"
                  height={barHeight}
                  opacity="0.9"
                  rx="6"
                  width={barWidth}
                  x={x}
                  y={y}
                />
                <text
                  fill="#E8C46A"
                  fontSize="11"
                  fontWeight="700"
                  textAnchor="middle"
                  x={xFor(index)}
                  y={Math.max(13, y - 7)}
                >
                  {formatter(row.value)}
                </text>
                <text
                  fill="rgba(255,255,255,0.48)"
                  fontSize="10"
                  textAnchor="middle"
                  x={xFor(index)}
                  y={height - 24}
                >
                  {row.label.length > 10 ? `${row.label.slice(0, 10)}…` : row.label}
                </text>
              </g>
            );
          })}
        </svg>
      ) : (
        <EmptyChart message={empty} />
      )}
    </ChartFrame>
  );
}

function HorizontalBarChart({
  empty,
  formatter = formatNumber,
  rows,
  title,
}: {
  empty: string;
  formatter?: (value: number) => string;
  rows: BarChartRow[];
  title: string;
}) {
  const chartRows = rows.slice(0, 7);
  const width = 720;
  const height = 260;
  const pad = { bottom: 24, left: 150, right: 78, top: 18 };
  const rowGap = 10;
  const rowHeight = Math.max(
    18,
    (height - pad.top - pad.bottom - rowGap * Math.max(0, chartRows.length - 1)) /
      Math.max(1, chartRows.length),
  );
  const maxValue = Math.max(1, ...chartRows.map((row) => row.value));
  const chartWidth = width - pad.left - pad.right;

  return (
    <ChartFrame empty={empty} title={title}>
      {chartRows.length ? (
        <svg className="h-[300px] w-full" role="img" viewBox={`0 0 ${width} ${height}`}>
          {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
            const x = pad.left + tick * chartWidth;

            return (
              <line
                key={tick}
                stroke="rgba(255,255,255,0.07)"
                x1={x}
                x2={x}
                y1={pad.top}
                y2={height - pad.bottom}
              />
            );
          })}
          {chartRows.map((row, index) => {
            const y = pad.top + index * (rowHeight + rowGap);
            const barWidth = Math.max(4, (row.value / maxValue) * chartWidth);

            return (
              <g key={`${title}-${row.label}`}>
                <text
                  fill="rgba(255,255,255,0.72)"
                  fontSize="12"
                  fontWeight="700"
                  textAnchor="end"
                  x={pad.left - 10}
                  y={y + rowHeight / 2 + 4}
                >
                  {row.label.length > 18 ? `${row.label.slice(0, 18)}…` : row.label}
                </text>
                <rect
                  fill="rgba(255,255,255,0.05)"
                  height={rowHeight}
                  rx="6"
                  width={chartWidth}
                  x={pad.left}
                  y={y}
                />
                <rect
                  fill="#C8A24A"
                  height={rowHeight}
                  rx="6"
                  width={barWidth}
                  x={pad.left}
                  y={y}
                />
                <text
                  fill="#E8C46A"
                  fontSize="12"
                  fontWeight="700"
                  x={pad.left + barWidth + 8}
                  y={y + rowHeight / 2 + 4}
                >
                  {formatter(row.value)}
                </text>
              </g>
            );
          })}
        </svg>
      ) : (
        <EmptyChart message={empty} />
      )}
    </ChartFrame>
  );
}

function ReadinessSummary({
  premiumCount,
  retireCount,
  upgradeCount,
}: {
  premiumCount: number;
  retireCount: number;
  upgradeCount: number;
}) {
  const rows = [
    {
      label: "Retire",
      tone: "text-rose-100",
      value: retireCount,
    },
    {
      label: "Upgrade",
      tone: "text-amber-100",
      value: upgradeCount,
    },
    {
      label: "Premium",
      tone: "text-[#E8C46A]",
      value: premiumCount,
    },
  ];

  return (
    <section className="rounded-3xl border border-neutral-800 bg-black/50 p-5">
      <h2 className="text-xl font-black">Catalog Readiness</h2>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {rows.map((row) => (
          <article
            key={row.label}
            className="rounded-2xl border border-neutral-800 bg-white/[0.03] p-4"
          >
            <p className="text-sm text-neutral-400">{row.label}</p>
            <p className={`mt-2 text-3xl font-black ${row.tone}`}>
              {formatNumber(row.value)}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

export default async function AdminGiftAnalyticsPage() {
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

  const [catalogResult, giftsResult, streaksResult] = await Promise.all([
    supabase
      .from("gift_catalog")
      .select("id, name, category, gold_cost, active, sort_order")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("gift_transactions")
      .select("sender_id, receiver_id, gift_type, gold_cost, client_request_id, created_at")
      .order("created_at", { ascending: false })
      .limit(50000),
    supabase
      .from("gift_streaks")
      .select("sender_id, receiver_id, current_streak, best_streak, last_gift_at")
      .order("current_streak", { ascending: false })
      .limit(50000),
  ]);
  logAdminGiftQueryError("gift catalog", catalogResult.error);
  logAdminGiftQueryError("gift transactions", giftsResult.error);
  logAdminGiftQueryError("gift streaks", streaksResult.error);

  const catalog = catalogResult.error ? [] : ((catalogResult.data ?? []) as GiftCatalogRow[]);
  const gifts = giftsResult.error
    ? []
    : ((giftsResult.data ?? []) as GiftTransactionRow[]).filter(isValidGiftTransaction);
  const streaks = streaksResult.error ? [] : (streaksResult.data ?? []);
  const catalogById = new Map(catalog.map((gift) => [gift.id, gift]));
  const pairGiftCounts = new Map<string, number>();

  gifts.forEach((gift) => {
    const key = `${gift.sender_id}:${gift.receiver_id}:${gift.gift_type}`;
    pairGiftCounts.set(key, (pairGiftCounts.get(key) ?? 0) + 1);
  });

  const repeatedPairGiftCounts = new Map<string, number>();
  pairGiftCounts.forEach((count, key) => {
    if (count <= 1) {
      return;
    }

    const giftType = key.split(":")[2] ?? "";
    repeatedPairGiftCounts.set(
      giftType,
      (repeatedPairGiftCounts.get(giftType) ?? 0) + count - 1,
    );
  });

  const metricByGift = new Map<string, GiftMetric>();

  catalog.forEach((gift) => {
    metricByGift.set(gift.id, {
      category: gift.category,
      goldCost: gift.gold_cost,
      id: gift.id,
      name: gift.name,
      repeatRate: 0,
      repeatSends: 0,
      revenue: 0,
      sends: 0,
    });
  });

  gifts.forEach((gift) => {
    const catalogGift = catalogById.get(gift.gift_type);
    const current =
      metricByGift.get(gift.gift_type) ??
      {
        category: catalogGift?.category ?? "uncategorized",
        goldCost: catalogGift?.gold_cost ?? gift.gold_cost ?? 0,
        id: gift.gift_type,
        name: catalogGift?.name ?? gift.gift_type,
        repeatRate: 0,
        repeatSends: 0,
        revenue: 0,
        sends: 0,
      };

    metricByGift.set(gift.gift_type, {
      ...current,
      revenue: current.revenue + Math.max(0, Number(gift.gold_cost ?? current.goldCost)),
      sends: current.sends + 1,
    });
  });

  repeatedPairGiftCounts.forEach((repeatSends, giftType) => {
    const current = metricByGift.get(giftType);

    if (!current) {
      return;
    }

    metricByGift.set(giftType, {
      ...current,
      repeatRate: current.sends ? repeatSends / current.sends : 0,
      repeatSends,
    });
  });

  const metrics = [...metricByGift.values()];
  const sentMetrics = metrics.filter((metric) => metric.sends > 0);
  const totalSends = gifts.length;
  const totalRevenue = gifts.reduce(
    (total, gift) => total + Math.max(0, Number(gift.gold_cost ?? 0)),
    0,
  );
  const repeatSends = sentMetrics.reduce((total, gift) => total + gift.repeatSends, 0);
  const idempotencyCoverage = gifts.length
    ? gifts.filter((gift) => Boolean(gift.client_request_id)).length / gifts.length
    : 0;
  const activeStreaks =
    streaks.filter((streak) => (streak.current_streak ?? 0) > 1).length ?? 0;
  const repeatPairs = [...pairGiftCounts.values()].filter((count) => count > 1).length;
  const priceBandMetrics = PRICE_BANDS.map((band) => {
    const bandGifts = gifts.filter((gift) => {
      const catalogGift = catalogById.get(gift.gift_type);
      const cost = Number(gift.gold_cost ?? catalogGift?.gold_cost ?? 0);

      return cost >= band.min && cost <= band.max;
    });
    const repeatCount = bandGifts.filter((gift) => {
      const pairGiftKey = `${gift.sender_id}:${gift.receiver_id}:${gift.gift_type}`;
      return (pairGiftCounts.get(pairGiftKey) ?? 0) > 1;
    }).length;

    return {
      label: band.label,
      repeatRate: bandGifts.length ? repeatCount / bandGifts.length : 0,
      revenue: bandGifts.reduce(
        (total, gift) => total + Math.max(0, Number(gift.gold_cost ?? 0)),
        0,
      ),
      sends: bandGifts.length,
    };
  });
  const retireCandidates = metrics
    .filter((gift) => gift.sends <= 1)
    .sort((left, right) => left.sends - right.sends || left.goldCost - right.goldCost)
    .slice(0, 8);
  const upgradeCandidates = sentMetrics
    .filter((gift) => gift.repeatRate >= 0.2 || gift.sends >= 10)
    .sort((left, right) => right.repeatRate - left.repeatRate || right.sends - left.sends)
    .slice(0, 8);
  const premiumCandidates = sentMetrics
    .filter((gift) => gift.revenue >= 500 || getPriceBand(gift.goldCost).min >= 101)
    .sort((left, right) => right.revenue - left.revenue)
    .slice(0, 8);
  const mostSentRows = [...sentMetrics]
    .sort((left, right) => right.sends - left.sends)
    .slice(0, 8)
    .map((gift) => ({
      label: gift.name,
      secondary: `${gift.category} · ${gift.goldCost} Gold`,
      value: gift.sends,
    }));
  const highestRevenueRows = [...sentMetrics]
    .sort((left, right) => right.revenue - left.revenue)
    .slice(0, 8)
    .map((gift) => ({
      label: gift.name,
      secondary: `${formatNumber(gift.sends)} sends`,
      value: gift.revenue,
    }));
  const priceBandRows = totalSends
    ? priceBandMetrics.map((band) => ({
        label: band.label,
        secondary: `${formatNumber(band.sends)} sends · ${formatPercent(band.repeatRate)} repeat`,
        value: band.revenue,
      }))
    : [];
  const repeatRateRows = [...sentMetrics]
    .filter((gift) => gift.repeatRate > 0)
    .sort((left, right) => right.repeatRate - left.repeatRate || right.repeatSends - left.repeatSends)
    .slice(0, 8)
    .map((gift) => ({
      label: gift.name,
      secondary: `${formatNumber(gift.repeatSends)} repeat sends`,
      value: gift.repeatRate,
    }));
  const activityTrendRows = totalSends ? getGiftActivityTrendRows(gifts) : [];

  return (
    <AppShell
      currentUserId={admin.id}
      maxWidth="max-w-7xl"
      profileId={currentProfile.public_id ?? currentProfile.id}
      title="Gift Analytics"
    >
      <div className="mt-6 rounded-3xl border border-amber-300/20 bg-amber-300/10 p-5">
        <p className="text-xs uppercase tracking-[0.24em] text-amber-100">
          Catalog readiness
        </p>
        <h1 className="mt-2 text-2xl font-black text-white">
          Gift Analytics Layer V1
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-amber-50/75">
          Read-only gift behavior metrics before Gift Catalog 2.0. No pricing,
          naming, or catalog changes are applied here.
        </p>
      </div>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Gift sends" value={formatNumber(totalSends)} />
        <StatCard label="Gold generated" value={formatNumber(totalRevenue)} />
        <StatCard label="Repeat sends" value={formatNumber(repeatSends)} />
        <StatCard label="Active streaks" value={formatNumber(activeStreaks)} />
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <VerticalBarChart
          empty="No sent gifts yet."
          rows={mostSentRows}
          title="Gift Sends by Gift"
        />
        <VerticalBarChart
          empty="No Gold revenue yet."
          rows={highestRevenueRows}
          title="Gold Generated by Gift"
        />
        <VerticalBarChart
          empty="No price band revenue yet."
          rows={priceBandRows}
          title="Price Band Performance"
        />
        <VerticalBarChart
          empty="Not enough gift activity yet."
          rows={activityTrendRows}
          title="Gift Activity Trend"
        />
        <HorizontalBarChart
          empty="No repeat gift behavior yet."
          formatter={formatPercent}
          rows={repeatRateRows}
          title="Repeat Behavior"
        />
      </section>

      <div className="mt-6">
        <ReadinessSummary
          premiumCount={premiumCandidates.length}
          retireCount={retireCandidates.length}
          upgradeCount={upgradeCandidates.length}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <MetricTable
          empty="No sent gifts yet."
          rows={[...sentMetrics].sort((left, right) => right.sends - left.sends).slice(0, 10)}
          title="Most Sent Gifts"
        />
        <MetricTable
          empty="No Gold revenue yet."
          rows={[...sentMetrics].sort((left, right) => right.revenue - left.revenue).slice(0, 10)}
          title="Highest Gold Revenue"
        />
        <MetricTable
          empty="No repeat gift behavior yet."
          rows={[...sentMetrics].sort((left, right) => right.repeatSends - left.repeatSends).slice(0, 10)}
          title="Most Repeated Gifts"
        />
        <MetricTable
          empty="Every catalog gift has usage."
          rows={[...metrics].sort((left, right) => left.sends - right.sends).slice(0, 10)}
          title="Least Used Gifts"
        />
      </div>

      <section className="mt-6 rounded-3xl border border-neutral-800 bg-black/50 p-5">
        <h2 className="text-xl font-black">Price Band Analysis</h2>
        <div className="mt-5 grid gap-3 md:grid-cols-5">
          {priceBandMetrics.map((band) => (
            <article
              key={band.label}
              className="rounded-2xl border border-neutral-800 bg-white/[0.03] p-4"
            >
              <p className="font-black text-white">{band.label}</p>
              <p className="mt-3 text-sm text-neutral-400">
                {formatNumber(band.sends)} sends
              </p>
              <p className="mt-1 text-sm text-neutral-400">
                {formatNumber(band.revenue)} Gold
              </p>
              <p className="mt-1 text-sm text-neutral-400">
                {formatPercent(band.repeatRate)} repeat
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-3">
        <ReadinessCard
          copy="Low or unused gifts. Review before Catalog 2.0."
          rows={retireCandidates}
          title="Retire candidates"
        />
        <ReadinessCard
          copy="Strong repeat or high send behavior. Consider better visuals or placement."
          rows={upgradeCandidates}
          title="Upgrade candidates"
        />
        <ReadinessCard
          copy="High revenue or high-price gifts. Consider premium treatment."
          rows={premiumCandidates}
          title="Premium candidates"
        />
      </section>

      <section className="mt-6 rounded-3xl border border-neutral-800 bg-black/50 p-5">
        <h2 className="text-xl font-black">Repeat Gift Analytics</h2>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <StatCard label="Repeat gifting pairs" value={formatNumber(repeatPairs)} />
          <StatCard label="Send ID coverage" value={formatPercent(idempotencyCoverage)} />
          <StatCard label="Streak usage" value={formatNumber(activeStreaks)} />
        </div>
        <p className="mt-4 text-sm leading-6 text-neutral-400">
          Send Again does not yet write a distinct analytics source. V1 infers
          repeat behavior from repeated sender, receiver, and gift combinations.
        </p>
      </section>
    </AppShell>
  );
}

function ReadinessCard({
  copy,
  rows,
  title,
}: {
  copy: string;
  rows: GiftMetric[];
  title: string;
}) {
  return (
    <section className="rounded-3xl border border-neutral-800 bg-black/50 p-5">
      <h2 className="text-xl font-black">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-neutral-400">{copy}</p>
      <div className="mt-5 grid gap-2">
        {rows.length ? (
          rows.map((gift) => (
            <div
              key={`${title}-${gift.id}`}
              className="rounded-2xl border border-neutral-800 bg-white/[0.03] p-4"
            >
              <p className="font-black text-white">{gift.name}</p>
              <p className="mt-1 text-sm text-neutral-400">
                {formatNumber(gift.sends)} sends · {formatNumber(gift.revenue)} Gold ·{" "}
                {formatPercent(gift.repeatRate)} repeat
              </p>
            </div>
          ))
        ) : (
          <p className="rounded-2xl border border-neutral-800 bg-white/[0.03] p-4 text-sm text-neutral-400">
            No candidates yet.
          </p>
        )}
      </div>
    </section>
  );
}
