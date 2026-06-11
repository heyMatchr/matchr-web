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

type ChartDatum = {
  label: string;
  sublabel?: string;
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

function ChartCard({
  children,
  description,
  title,
}: {
  children: ReactNode;
  description: string;
  title: string;
}) {
  return (
    <section className="min-w-0 rounded-3xl border border-neutral-800 bg-black/50 p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-black text-white">{title}</h2>
        <p className="text-sm leading-6 text-neutral-400">{description}</p>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function VerticalBarChart({
  empty,
  rows,
  valueLabel,
}: {
  empty: string;
  rows: ChartDatum[];
  valueLabel: string;
}) {
  const chartRows = rows.slice(0, 8);
  const maxValue = Math.max(1, ...chartRows.map((row) => row.value));

  if (!chartRows.length) {
    return (
      <p className="rounded-2xl border border-neutral-800 bg-white/[0.03] p-4 text-sm text-neutral-400">
        {empty}
      </p>
    );
  }

  return (
    <div className="min-w-0 overflow-hidden rounded-2xl border border-neutral-900 bg-black/55 p-4">
      <div
        className="grid h-56 min-w-0 items-end gap-2"
        style={{
          gridTemplateColumns: `repeat(${chartRows.length}, minmax(0, 1fr))`,
        }}
      >
        {chartRows.map((row) => {
          const height = Math.max(8, Math.round((row.value / maxValue) * 100));

          return (
            <div
              key={`${row.label}-${row.value}`}
              className="flex min-w-0 flex-col items-center justify-end gap-2"
            >
              <span className="text-[11px] font-black text-[#E8C46A]">
                {formatNumber(row.value)}
              </span>
              <div className="flex h-36 w-full items-end rounded-full bg-white/[0.04] p-1">
                <div
                  aria-label={`${row.label}: ${formatNumber(row.value)} ${valueLabel}`}
                  className="w-full rounded-full bg-[#C8A24A] shadow-[0_0_22px_rgba(200,162,74,0.20)]"
                  style={{ height: `${height}%` }}
                />
              </div>
              <span className="line-clamp-2 min-h-8 max-w-full text-center text-[11px] leading-4 text-neutral-400">
                {row.label}
              </span>
            </div>
          );
        })}
      </div>
      <p className="mt-4 text-xs text-neutral-500">{valueLabel}</p>
    </div>
  );
}

function HorizontalProgressChart({
  empty,
  rows,
  valueFormatter = formatNumber,
}: {
  empty: string;
  rows: ChartDatum[];
  valueFormatter?: (value: number) => string;
}) {
  const chartRows = rows.slice(0, 8);
  const maxValue = Math.max(1, ...chartRows.map((row) => row.value));

  if (!chartRows.length) {
    return (
      <p className="rounded-2xl border border-neutral-800 bg-white/[0.03] p-4 text-sm text-neutral-400">
        {empty}
      </p>
    );
  }

  return (
    <div className="grid min-w-0 gap-3">
      {chartRows.map((row) => {
        const width = Math.max(3, Math.round((row.value / maxValue) * 100));

        return (
          <div
            key={`${row.label}-${row.value}`}
            className="min-w-0 rounded-2xl border border-neutral-800 bg-white/[0.03] p-3"
          >
            <div className="flex min-w-0 items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-white">{row.label}</p>
                {row.sublabel ? (
                  <p className="truncate text-xs text-neutral-500">{row.sublabel}</p>
                ) : null}
              </div>
              <p className="shrink-0 text-sm font-black text-[#E8C46A]">
                {valueFormatter(row.value)}
              </p>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/60">
              <div
                className="h-full rounded-full bg-[#C8A24A]"
                style={{ width: `${width}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ReadinessSplitChart({
  premiumCount,
  retireCount,
  upgradeCount,
}: {
  premiumCount: number;
  retireCount: number;
  upgradeCount: number;
}) {
  const total = retireCount + upgradeCount + premiumCount;
  const segments = [
    {
      className: "bg-rose-300/70",
      label: "Retire",
      value: retireCount,
    },
    {
      className: "bg-amber-300/80",
      label: "Upgrade",
      value: upgradeCount,
    },
    {
      className: "bg-[#C8A24A]",
      label: "Premium",
      value: premiumCount,
    },
  ];

  if (!total) {
    return (
      <p className="rounded-2xl border border-neutral-800 bg-white/[0.03] p-4 text-sm text-neutral-400">
        Not enough gift data yet.
      </p>
    );
  }

  return (
    <div className="rounded-2xl border border-neutral-900 bg-black/55 p-4">
      <div className="flex h-4 overflow-hidden rounded-full bg-white/[0.04]">
        {segments.map((segment) =>
          segment.value > 0 ? (
            <div
              key={segment.label}
              className={segment.className}
              style={{ width: `${(segment.value / total) * 100}%` }}
            />
          ) : null,
        )}
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {segments.map((segment) => (
          <div
            key={segment.label}
            className="rounded-2xl border border-neutral-800 bg-white/[0.03] p-3"
          >
            <p className="text-sm font-black text-white">{segment.label}</p>
            <p className="mt-1 text-xs text-neutral-500">
              {formatNumber(segment.value)} candidates
            </p>
          </div>
        ))}
      </div>
    </div>
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
  const giftSendChartRows = [...sentMetrics]
    .sort((left, right) => right.sends - left.sends)
    .slice(0, 8)
    .map((gift) => ({
      label: gift.name,
      value: gift.sends,
    }));
  const giftRevenueChartRows = [...sentMetrics]
    .sort((left, right) => right.revenue - left.revenue)
    .slice(0, 8)
    .map((gift) => ({
      label: gift.name,
      value: gift.revenue,
    }));
  const repeatRateChartRows = [...sentMetrics]
    .filter((gift) => gift.repeatRate > 0)
    .sort((left, right) => right.repeatRate - left.repeatRate || right.sends - left.sends)
    .slice(0, 8)
    .map((gift) => ({
      label: gift.name,
      sublabel: `${formatNumber(gift.sends)} sends`,
      value: gift.repeatRate,
    }));
  const priceBandRevenueChartRows = priceBandMetrics.map((band) => ({
    label: band.label,
    value: band.revenue,
  }));

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

      <section className="mt-6 grid min-w-0 gap-6 lg:grid-cols-2">
        <ChartCard
          description="Which gifts are moving most often."
          title="Gift Sends by Gift"
        >
          <VerticalBarChart
            empty="Not enough gift data yet."
            rows={giftSendChartRows}
            valueLabel="Sends"
          />
        </ChartCard>
        <ChartCard
          description="Which gifts create the strongest Gold movement."
          title="Gold Generated by Gift"
        >
          <VerticalBarChart
            empty="Not enough gift revenue yet."
            rows={giftRevenueChartRows}
            valueLabel="Gold generated"
          />
        </ChartCard>
        <ChartCard
          description="Price bands that carry gift activity."
          title="Price Band Performance"
        >
          <VerticalBarChart
            empty="Not enough price band data yet."
            rows={priceBandRevenueChartRows}
            valueLabel="Gold generated"
          />
        </ChartCard>
        <ChartCard
          description="Repeat behavior by gift type."
          title="Repeat Rate by Gift"
        >
          <HorizontalProgressChart
            empty="Not enough repeat gift data yet."
            rows={repeatRateChartRows}
            valueFormatter={formatPercent}
          />
        </ChartCard>
      </section>

      <div className="mt-6">
        <ChartCard
          description="Catalog readiness signals for Gift Catalog 2.0."
          title="Catalog Readiness Split"
        >
          <ReadinessSplitChart
            premiumCount={premiumCandidates.length}
            retireCount={retireCandidates.length}
            upgradeCount={upgradeCandidates.length}
          />
        </ChartCard>
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
