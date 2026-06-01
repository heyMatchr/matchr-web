"use client";

import Link from "next/link";
import {
  type PointerEvent,
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { adminUserHref } from "../admin-shared";

type RangeKey = "today" | "7d" | "30d" | "all";
type Tone = "amber" | "emerald" | "rose" | "violet";

type ProfileSummary = {
  avatar_url: string | null;
  display_name: string;
  id: string;
  public_id: string | null;
};

type WalletRow = {
  gold_balance: number;
  user_id: string;
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

type PremiumSubscription = {
  created_at: string;
  interval: string | null;
  plan_name: string | null;
  price_usd: number | null;
  status: string;
  user_id: string;
};

type PaymentOrder = {
  amount: number | null;
  amount_usd: number | null;
  created_at: string;
  currency: string;
  gold_amount: number | null;
  order_type: string;
  paid_at: string | null;
  provider: string;
  status: string;
  user_id: string;
};

type CreatorWallet = {
  created_at: string;
  diamonds_balance: number;
  diamonds_lifetime: number;
  diamonds_pending: number;
  diamonds_withdrawn: number;
  updated_at: string;
  user_id: string;
};

type WithdrawalRequest = {
  cash_estimate: number;
  created_at: string;
  diamonds_amount: number;
  id: string;
  paid_at?: string | null;
  payout_method: string;
  processed_at: string | null;
  status: string;
  user_id: string;
};

type SeriesPoint = {
  date: string;
  label: string;
  previous: number;
  value: number;
};

type Dataset = {
  color: Tone;
  id: string;
  label: string;
  points: SeriesPoint[];
};

type Kpi = {
  change: number | null;
  color: Tone;
  label: string;
  periodValue: number;
  previousValue: number;
  subtitle: string;
};

type RankedRow = {
  label: string;
  profile?: ProfileSummary | null;
  secondary?: string;
  total: number;
};

type RevenueDashboardClientProps = {
  creatorWallets: CreatorWallet[];
  gifts: GiftTransaction[];
  messageCharges: MessageCharge[];
  paymentOrders: PaymentOrder[];
  premiumSubscriptions: PremiumSubscription[];
  profiles: ProfileSummary[];
  walletTransactions: WalletTransaction[];
  wallets: WalletRow[];
  withdrawalRequests: WithdrawalRequest[];
};

const rangeOptions: Array<{ key: RangeKey; label: string }> = [
  { key: "today", label: "Today" },
  { key: "7d", label: "Last 7 Days" },
  { key: "30d", label: "Last 30 Days" },
  { key: "all", label: "All Time" },
];

const palette: Record<Tone, { accent: string; bg: string; border: string; fill: string }> = {
  amber: {
    accent: "text-amber-100",
    bg: "bg-amber-300/10",
    border: "border-amber-300/25",
    fill: "#fbbf24",
  },
  emerald: {
    accent: "text-emerald-100",
    bg: "bg-emerald-300/10",
    border: "border-emerald-300/25",
    fill: "#34d399",
  },
  rose: {
    accent: "text-rose-100",
    bg: "bg-rose-300/10",
    border: "border-rose-300/25",
    fill: "#fb7185",
  },
  violet: {
    accent: "text-violet-100",
    bg: "bg-violet-300/10",
    border: "border-violet-300/25",
    fill: "#a78bfa",
  },
};

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

function rangeDays(range: RangeKey) {
  if (range === "today") return 1;
  if (range === "7d") return 7;
  if (range === "30d") return 30;
  return 30;
}

function rangeStart(range: RangeKey) {
  if (range === "all") return null;
  const today = startOfDay(new Date());
  return addDays(today, -rangeDays(range) + 1).toISOString();
}

function dateKeys(days: number) {
  const today = startOfDay(new Date());
  return Array.from({ length: days }, (_, index) =>
    dateKey(addDays(today, index - days + 1)),
  );
}

function formatNumber(value: number) {
  return Math.round(value).toLocaleString();
}

function formatCurrency(value: number) {
  return `$${value.toLocaleString(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}`;
}

function formatPercent(value: number | null) {
  if (value === null || Math.abs(value) < 0.1 || !Number.isFinite(value)) {
    return "Stable";
  }
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString([], {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
  });
}

function formatFullDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString([], {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatShortDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString([], {
    day: "numeric",
    month: "short",
  });
}

function change(current: number, previous: number) {
  if (previous === 0) return current === 0 ? null : 100;
  return ((current - previous) / previous) * 100;
}

function filterByRange<T>(rows: T[], range: RangeKey, getDate: (row: T) => string) {
  const start = rangeStart(range);
  if (!start) return rows;
  const startMs = new Date(start).getTime();
  return rows.filter((row) => new Date(getDate(row)).getTime() >= startMs);
}

function countByDay<T>(
  rows: T[],
  keys: string[],
  getDate: (row: T) => string,
  getValue: (row: T) => number = () => 1,
) {
  const current = new Map(keys.map((key) => [key, 0]));
  const previous = new Map(keys.map((key) => [key, 0]));
  const firstKey = keys[0] ?? dateKey(new Date());
  const previousOffset = keys.length * 24 * 60 * 60 * 1000;
  const firstTime = new Date(`${firstKey}T00:00:00`).getTime();

  rows.forEach((row) => {
    const rawDate = getDate(row);
    const key = dateKey(rawDate);
    const value = getValue(row);

    if (current.has(key)) {
      current.set(key, (current.get(key) ?? 0) + value);
      return;
    }

    const shiftedDate = new Date(new Date(rawDate).getTime() + previousOffset);
    const shiftedKey = dateKey(shiftedDate);
    if (shiftedDate.getTime() >= firstTime && previous.has(shiftedKey)) {
      previous.set(shiftedKey, (previous.get(shiftedKey) ?? 0) + value);
    }
  });

  return keys.map<SeriesPoint>((key) => ({
    date: key,
    label: formatShortDate(key),
    previous: previous.get(key) ?? 0,
    value: current.get(key) ?? 0,
  }));
}

function sumSeries(points: SeriesPoint[]) {
  return points.reduce((total, point) => total + point.value, 0);
}

function sumBy<T>(rows: T[], getValue: (row: T) => number) {
  return rows.reduce((total, row) => total + getValue(row), 0);
}

function makeKpi<T>(
  label: string,
  color: Tone,
  rows: T[],
  range: RangeKey,
  getDate: (row: T) => string,
  getValue: (row: T) => number = () => 1,
): Kpi {
  const keys = dateKeys(rangeDays(range));
  const points = countByDay(rows, keys, getDate, getValue);
  const current = range === "all" ? sumBy(rows, getValue) : sumSeries(points);
  const previous = range === "all"
    ? 0
    : points.reduce((total, point) => total + point.previous, 0);

  return {
    change: range === "all" ? null : change(current, previous),
    color,
    label,
    periodValue: current,
    previousValue: previous,
    subtitle: range === "all" ? "all time" : "selected period",
  };
}

function rankBy<T>(
  rows: T[],
  getKey: (row: T) => string,
  getValue: (row: T) => number,
) {
  const totals = new Map<string, number>();
  rows.forEach((row) => {
    const key = getKey(row);
    if (!key) return;
    totals.set(key, (totals.get(key) ?? 0) + getValue(row));
  });
  return [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
}

function insight(label: string, metricChange: number | null) {
  if (label.toLowerCase().includes("starter")) {
    return "Starter bonuses are driving wallet activity and should stay monitored as signup volume changes.";
  }
  if (label.toLowerCase().includes("earners")) {
    return "Top earners show whether creator value is concentrated among a few users.";
  }
  if (metricChange === null || Math.abs(metricChange) < 5) {
    return `${label} is stable compared with the previous period.`;
  }
  if (metricChange > 0) {
    return `${label} increased ${formatPercent(metricChange)} compared with the previous period.`;
  }
  return `${label} declined ${formatPercent(Math.abs(metricChange))} compared with the previous period.`;
}

function useAnimatedNumber(value: number) {
  const [displayValue, setDisplayValue] = useState(value);
  const fromRef = useRef(value);

  useEffect(() => {
    const from = fromRef.current;
    const start = performance.now();
    const duration = 500;
    let frame = 0;
    const tick = (time: number) => {
      const progress = Math.min(1, (time - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(from + (value - from) * eased);
      if (progress < 1) frame = requestAnimationFrame(tick);
      else fromRef.current = value;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return displayValue;
}

function KpiCard({ kpi }: { kpi: Kpi }) {
  const animated = useAnimatedNumber(kpi.periodValue);
  const colors = palette[kpi.color];
  const isUp = kpi.change !== null && kpi.change > 5;
  const isDown = kpi.change !== null && kpi.change < -5;
  const trendClass = isUp
    ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
    : isDown
      ? "border-rose-300/25 bg-rose-300/10 text-rose-100"
      : "border-amber-300/25 bg-amber-300/10 text-amber-100";

  return (
    <article className={`rounded-2xl border ${colors.border} bg-black/55 p-5`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-neutral-400">{kpi.label}</p>
          <p className="mt-2 text-3xl font-black tracking-tight text-white">
            {formatNumber(animated)}
          </p>
          <p className="mt-1 text-xs text-neutral-500">{kpi.subtitle}</p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-black ${trendClass}`}>
          {isUp ? "↑ " : isDown ? "↓ " : "→ "}
          {formatPercent(kpi.change)}
        </span>
      </div>
      <p className="mt-4 text-xs text-neutral-500">
        Previous: {formatNumber(kpi.previousValue)}
      </p>
    </article>
  );
}

const EconomyChart = memo(function EconomyChart({
  datasets,
  title,
  type = "line",
}: {
  datasets: Dataset[];
  title: string;
  type?: "bar" | "line";
}) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const width = 720;
  const height = 260;
  const pad = { bottom: 34, left: 42, right: 20, top: 18 };
  const visible = datasets.filter((dataset) => !hidden.has(dataset.id));
  const count = datasets[0]?.points.length ?? 0;
  const maxValue = Math.max(1, ...visible.flatMap((d) => d.points.map((p) => p.value)));
  const selectedDate = activeIndex === null ? null : datasets[0]?.points[activeIndex]?.date;
  const selectedRows = activeIndex === null
    ? []
    : visible.map((dataset) => {
        const point = dataset.points[activeIndex];
        const previous = point?.previous ?? 0;
        return { change: change(point?.value ?? 0, previous), dataset, point, previous };
      });
  const primaryChange = change(
    sumSeries(datasets[0]?.points ?? []),
    (datasets[0]?.points ?? []).reduce((total, point) => total + point.previous, 0),
  );
  const xFor = (index: number) =>
    count <= 1 ? width / 2 : pad.left + (index / (count - 1)) * (width - pad.left - pad.right);
  const yFor = (value: number) =>
    height - pad.bottom - (value / maxValue) * (height - pad.top - pad.bottom);
  const clearTimer = () => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  };
  const hide = () => {
    clearTimer();
    setActiveIndex(null);
  };
  const scheduleTouchHide = () => {
    clearTimer();
    hideTimer.current = setTimeout(() => {
      setActiveIndex(null);
      hideTimer.current = null;
    }, 900);
  };

  useEffect(() => () => clearTimer(), []);

  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    clearTimer();
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    setActiveIndex(Math.round(ratio * Math.max(0, count - 1)));
    if (event.pointerType === "touch" || event.pointerType === "pen") scheduleTouchHide();
  };

  return (
    <section className="rounded-2xl border border-neutral-800 bg-black/55 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-white">{title}</h2>
          <p className="mt-1 text-xs text-neutral-500">
            Hover or touch for exact period comparison.
          </p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-bold ${
          primaryChange !== null && primaryChange > 5
            ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
            : primaryChange !== null && primaryChange < -5
              ? "border-rose-300/25 bg-rose-300/10 text-rose-100"
              : "border-amber-300/25 bg-amber-300/10 text-amber-100"
        }`}>
          {primaryChange !== null && primaryChange > 5 ? "↑ " : primaryChange !== null && primaryChange < -5 ? "↓ " : "→ "}
          {formatPercent(primaryChange)}
        </span>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {datasets.map((dataset) => (
          <button
            key={dataset.id}
            type="button"
            onClick={() =>
              setHidden((current) => {
                const next = new Set(current);
                if (next.has(dataset.id)) next.delete(dataset.id);
                else next.add(dataset.id);
                return next;
              })
            }
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              hidden.has(dataset.id)
                ? "border-neutral-800 text-neutral-500"
                : `${palette[dataset.color].border} ${palette[dataset.color].bg} ${palette[dataset.color].accent}`
            }`}
          >
            {hidden.has(dataset.id) ? "☐" : "☑"} {dataset.label}
          </button>
        ))}
      </div>
      <div className="relative mt-4 overflow-hidden rounded-2xl border border-neutral-900 bg-black/60">
        <svg
          className="h-[300px] w-full touch-none"
          onPointerCancel={hide}
          onPointerDown={onPointerMove}
          onPointerLeave={hide}
          onPointerMove={onPointerMove}
          onPointerUp={(event) => {
            if (event.pointerType === "touch" || event.pointerType === "pen") scheduleTouchHide();
          }}
          role="img"
          viewBox={`0 0 ${width} ${height}`}
        >
          {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
            const y = pad.top + tick * (height - pad.top - pad.bottom);
            return (
              <g key={tick}>
                <line stroke="rgba(255,255,255,0.06)" x1={pad.left} x2={width - pad.right} y1={y} y2={y} />
                <text fill="rgba(255,255,255,0.38)" fontSize="10" x="4" y={y + 3}>
                  {formatNumber(maxValue * (1 - tick))}
                </text>
              </g>
            );
          })}
          {visible.map((dataset, datasetIndex) => {
            const points = dataset.points.map((point, index) => ({
              ...point,
              x: xFor(index),
              y: yFor(point.value),
            }));
            const path = points
              .map((point, index) => {
                if (index === 0) return `M ${point.x} ${point.y}`;
                const previous = points[index - 1];
                const midX = (previous.x + point.x) / 2;
                return `C ${midX} ${previous.y}, ${midX} ${point.y}, ${point.x} ${point.y}`;
              })
              .join(" ");

            if (type === "bar") {
              const barWidth = Math.max(4, (width - pad.left - pad.right) / Math.max(1, count) - 6);
              return (
                <g key={dataset.id}>
                  {points.map((point) => (
                    <rect
                      key={point.date}
                      fill={palette[dataset.color].fill}
                      height={height - pad.bottom - point.y}
                      opacity={datasetIndex === 0 ? 0.9 : 0.5}
                      rx="4"
                      width={barWidth}
                      x={point.x - barWidth / 2 + datasetIndex * 5}
                      y={point.y}
                    />
                  ))}
                </g>
              );
            }

            return (
              <path
                key={dataset.id}
                d={path}
                fill="none"
                stroke={palette[dataset.color].fill}
                strokeLinecap="round"
                strokeWidth="3"
              />
            );
          })}
          {activeIndex !== null && selectedDate ? (
            <g>
              <line stroke="rgba(255,255,255,0.36)" strokeDasharray="4 4" x1={xFor(activeIndex)} x2={xFor(activeIndex)} y1={pad.top} y2={height - pad.bottom} />
              {selectedRows[0]?.point ? (
                <line stroke="rgba(255,255,255,0.24)" strokeDasharray="4 4" x1={pad.left} x2={width - pad.right} y1={yFor(selectedRows[0].point.value)} y2={yFor(selectedRows[0].point.value)} />
              ) : null}
              {selectedRows.map(({ dataset, point }) =>
                point ? (
                  <circle key={dataset.id} cx={xFor(activeIndex)} cy={yFor(point.value)} fill="#050505" r="6" stroke={palette[dataset.color].fill} strokeWidth="3" />
                ) : null,
              )}
            </g>
          ) : null}
        </svg>
        {selectedRows.length ? (
          <div className="pointer-events-none absolute right-3 top-3 w-56 rounded-2xl border border-white/10 bg-black/90 p-3 text-xs shadow-2xl backdrop-blur">
            <p className="font-black text-white">{formatFullDate(selectedDate ?? "")}</p>
            <div className="mt-2 space-y-2">
              {selectedRows.map(({ change: rowChange, dataset, point, previous }) =>
                point ? (
                  <div key={dataset.id}>
                    <div className="flex items-center justify-between gap-3">
                      <span className={palette[dataset.color].accent}>{dataset.label}</span>
                      <span className="font-black text-white">{formatNumber(point.value)}</span>
                    </div>
                    <div className="mt-1 flex justify-between text-neutral-500">
                      <span>Previous: {formatNumber(previous)}</span>
                      <span>{formatPercent(rowChange)}</span>
                    </div>
                  </div>
                ) : null,
              )}
            </div>
          </div>
        ) : null}
      </div>
      <p className="mt-4 rounded-2xl border border-neutral-800 bg-white/[0.03] px-4 py-3 text-sm leading-6 text-neutral-300">
        {insight(title, primaryChange)}
      </p>
    </section>
  );
});

function RankingTable({ emptyLabel, rows, title }: { emptyLabel: string; rows: RankedRow[]; title: string }) {
  return (
    <section className="rounded-2xl border border-neutral-800 bg-black/50 p-5">
      <h2 className="text-xl font-black text-white">{title}</h2>
      <div className="mt-5 space-y-3">
        {rows.length ? rows.map((row) => {
          const href = row.profile ? adminUserHref(row.profile) : null;
          const content = (
            <>
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-white">{row.label}</p>
                {row.secondary ? <p className="truncate text-xs text-neutral-500">{row.secondary}</p> : null}
              </div>
              <p className="shrink-0 rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1 text-sm font-black text-amber-100">
                {formatNumber(row.total)}
              </p>
            </>
          );
          return href ? (
            <Link key={`${title}-${row.label}`} href={href} className="flex items-center justify-between gap-3 rounded-2xl border border-neutral-800 bg-white/[0.03] p-3 transition-colors hover:border-emerald-300/30">
              {content}
            </Link>
          ) : (
            <div key={`${title}-${row.label}`} className="flex items-center justify-between gap-3 rounded-2xl border border-neutral-800 bg-white/[0.03] p-3">
              {content}
            </div>
          );
        }) : (
          <p className="rounded-2xl border border-neutral-800 bg-white/[0.03] p-4 text-sm text-neutral-400">{emptyLabel}</p>
        )}
      </div>
    </section>
  );
}

export function RevenueDashboardClient({
  creatorWallets,
  gifts,
  messageCharges,
  paymentOrders,
  premiumSubscriptions,
  profiles,
  walletTransactions,
  wallets,
  withdrawalRequests,
}: RevenueDashboardClientProps) {
  const [range, setRange] = useState<RangeKey>("7d");
  const keys = useMemo(() => dateKeys(rangeDays(range)), [range]);
  const profilesById = useMemo(
    () => new Map(profiles.map((profile) => [profile.id, profile])),
    [profiles],
  );
  const activeWalletTransactions = useMemo(
    () => filterByRange(walletTransactions, range, (row) => row.created_at),
    [range, walletTransactions],
  );
  const activeGifts = useMemo(
    () => filterByRange(gifts, range, (row) => row.created_at),
    [gifts, range],
  );
  const activePremium = premiumSubscriptions.filter((row) => row.status === "active");
  const activePaymentOrders = useMemo(
    () => filterByRange(paymentOrders, range, (row) => row.created_at),
    [paymentOrders, range],
  );
  const currentGoldHeld = useMemo(
    () => wallets.reduce((total, row) => total + (row.gold_balance ?? 0), 0),
    [wallets],
  );
  const totalDiamondsIssued = useMemo(
    () => creatorWallets.reduce((total, row) => total + (row.diamonds_lifetime ?? 0), 0),
    [creatorWallets],
  );
  const totalCreatorEarnings = totalDiamondsIssued;
  const totalPendingWithdrawals = useMemo(
    () =>
      withdrawalRequests
        .filter((row) => row.status === "pending" || row.status === "approved")
        .reduce((total, row) => total + row.diamonds_amount, 0),
    [withdrawalRequests],
  );
  const totalCompletedWithdrawals = useMemo(
    () =>
      withdrawalRequests
        .filter((row) => row.status === "paid")
        .reduce((total, row) => total + row.diamonds_amount, 0),
    [withdrawalRequests],
  );
  const issuedRows = walletTransactions.filter((row) => row.gold_delta > 0);
  const spentRows = walletTransactions.filter((row) => row.gold_delta < 0);
  const activeSpentRows = activeWalletTransactions.filter((row) => row.gold_delta < 0);
  const starterRows = walletTransactions.filter(
    (row) => row.reference_type === "Starter Gold Bonus",
  );
  const projectedWeeklyPremiumRevenue = activePremium.reduce(
    (total, row) => total + Number(row.price_usd ?? 0),
    0,
  );
  const paidPaymentOrders = activePaymentOrders.filter((row) => row.status === "paid");
  const pendingPaymentOrders = activePaymentOrders.filter((row) => row.status === "pending");
  const failedPaymentOrders = activePaymentOrders.filter((row) => row.status === "failed");
  const paymentConversionRate =
    activePaymentOrders.length > 0
      ? (paidPaymentOrders.length / activePaymentOrders.length) * 100
      : 0;

  const kpis = useMemo(
    () => [
      makeKpi("Gold issued", "amber", issuedRows, range, (row) => row.created_at, (row) => row.gold_delta),
      makeKpi("Gold spent", "rose", spentRows, range, (row) => row.created_at, (row) => Math.abs(row.gold_delta)),
      {
        change: null,
        color: "emerald" as Tone,
        label: "Gold held",
        periodValue: currentGoldHeld,
        previousValue: 0,
        subtitle: "current balance",
      },
      makeKpi("Starter Gold", "amber", starterRows, range, (row) => row.created_at, (row) => row.gold_delta),
      makeKpi("Message charges", "rose", messageCharges, range, (row) => row.created_at, (row) => row.gold_cost),
      makeKpi("Gift spend", "amber", gifts, range, (row) => row.created_at, (row) => row.gold_cost ?? 0),
      makeKpi("Gifts sent", "emerald", gifts, range, (row) => row.created_at),
      {
        change: null,
        color: "violet" as Tone,
        label: "Premium users",
        periodValue: activePremium.length,
        previousValue: 0,
        subtitle: `${formatCurrency(projectedWeeklyPremiumRevenue)}/wk placeholder`,
      },
      {
        change: null,
        color: "emerald" as Tone,
        label: "Paid orders",
        periodValue: paidPaymentOrders.length,
        previousValue: pendingPaymentOrders.length,
        subtitle: `${formatPercent(paymentConversionRate)} conversion`,
      },
      {
        change: null,
        color: "violet" as Tone,
        label: "Diamonds issued",
        periodValue: totalDiamondsIssued,
        previousValue: 0,
        subtitle: "creator lifetime",
      },
      {
        change: null,
        color: "emerald" as Tone,
        label: "Creator earnings",
        periodValue: totalCreatorEarnings,
        previousValue: 0,
        subtitle: "total Diamonds earned",
      },
      makeKpi(
        "Pending withdrawals",
        "amber",
        withdrawalRequests.filter((row) => row.status === "pending" || row.status === "approved"),
        range,
        (row) => row.created_at,
        (row) => row.diamonds_amount,
      ),
      makeKpi(
        "Completed withdrawals",
        "emerald",
        withdrawalRequests.filter((row) => row.status === "paid"),
        range,
        (row) => row.processed_at ?? row.created_at,
        (row) => row.diamonds_amount,
      ),
    ],
    [activePremium.length, currentGoldHeld, gifts, issuedRows, messageCharges, paidPaymentOrders.length, paymentConversionRate, pendingPaymentOrders.length, projectedWeeklyPremiumRevenue, range, spentRows, starterRows, totalCreatorEarnings, totalDiamondsIssued, withdrawalRequests],
  );

  const series = useMemo(
    () => ({
      giftSpend: countByDay(gifts, keys, (row) => row.created_at, (row) => row.gold_cost ?? 0),
      gifts: countByDay(gifts, keys, (row) => row.created_at),
      goldIssued: countByDay(issuedRows, keys, (row) => row.created_at, (row) => row.gold_delta),
      goldSpent: countByDay(spentRows, keys, (row) => row.created_at, (row) => Math.abs(row.gold_delta)),
      messageCharges: countByDay(messageCharges, keys, (row) => row.created_at, (row) => row.gold_cost),
      starter: countByDay(starterRows, keys, (row) => row.created_at, (row) => row.gold_delta),
      paidOrders: countByDay(
        paymentOrders.filter((row) => row.status === "paid"),
        keys,
        (row) => row.paid_at ?? row.created_at,
      ),
      pendingOrders: countByDay(
        paymentOrders.filter((row) => row.status === "pending"),
        keys,
        (row) => row.created_at,
      ),
      diamondsIssued: countByDay(
        creatorWallets,
        keys,
        (row) => row.created_at,
        (row) => row.diamonds_lifetime,
      ),
      pendingWithdrawals: countByDay(
        withdrawalRequests.filter((row) => row.status === "pending" || row.status === "approved"),
        keys,
        (row) => row.created_at,
        (row) => row.diamonds_amount,
      ),
      paidWithdrawals: countByDay(
        withdrawalRequests.filter((row) => row.status === "paid"),
        keys,
        (row) => row.processed_at ?? row.created_at,
        (row) => row.diamonds_amount,
      ),
    }),
    [creatorWallets, gifts, issuedRows, keys, messageCharges, paymentOrders, spentRows, starterRows, withdrawalRequests],
  );

  const mostSentGifts = useMemo(
    () => rankBy(activeGifts, (row) => row.gift_type, () => 1).map(([giftType, total]) => ({
      label: giftType.replaceAll("_", " "),
      secondary: "gifts sent",
      total,
    })),
    [activeGifts],
  );
  const topGifters = useMemo(
    () => rankBy(activeGifts, (row) => row.sender_id, (row) => row.gold_cost ?? 0).map(([userId, total]) => ({
      label: profilesById.get(userId)?.display_name ?? "Unknown user",
      profile: profilesById.get(userId) ?? null,
      secondary: profilesById.get(userId)?.public_id ?? userId,
      total,
    })),
    [activeGifts, profilesById],
  );
  const topEarners = useMemo(
    () => rankBy(
      creatorWallets,
      (row) => row.user_id,
      (row) => row.diamonds_lifetime,
    ).map(([userId, total]) => ({
      label: profilesById.get(userId)?.display_name ?? "Unknown user",
      profile: profilesById.get(userId) ?? null,
      secondary: profilesById.get(userId)?.public_id ?? userId,
      total,
    })),
    [creatorWallets, profilesById],
  );
  const highestGoldSpenders = useMemo(
    () => rankBy(activeSpentRows, (row) => row.user_id, (row) => Math.abs(row.gold_delta)).map(([userId, total]) => ({
      label: profilesById.get(userId)?.display_name ?? "Unknown user",
      profile: profilesById.get(userId) ?? null,
      secondary: profilesById.get(userId)?.public_id ?? userId,
      total,
    })),
    [activeSpentRows, profilesById],
  );
  const latestTransactions = activeWalletTransactions.slice(0, 30);
  const topGiftSeries = mostSentGifts.slice(0, 8).map((row) => ({
    date: row.label,
    label: row.label,
    previous: 0,
    value: row.total,
  }));
  const topGiftersSeries = topGifters.slice(0, 8).map((row) => ({
    date: row.label,
    label: row.label,
    previous: 0,
    value: row.total,
  }));
  const topEarnersSeries = topEarners.slice(0, 8).map((row) => ({
    date: row.label,
    label: row.label,
    previous: 0,
    value: row.total,
  }));

  return (
    <>
      <div className="mt-6 flex flex-col gap-4 rounded-2xl border border-neutral-800 bg-black/50 p-5 md:flex-row md:items-end md:justify-between">
        <div>
          <Link href="/admin" className="text-sm font-medium text-emerald-100">Back to admin</Link>
          <h2 className="mt-3 text-2xl font-black tracking-tight text-white">Economy intelligence</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-neutral-400">
            Interactive Gold, gifts, message charge, premium, and transaction visibility before payments go live.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {rangeOptions.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setRange(option.key)}
              className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                range === option.key
                  ? "border-amber-300/40 bg-amber-300/15 text-amber-50"
                  : "border-neutral-700 text-neutral-300 hover:border-neutral-500"
              }`}
            >
              {option.label}
            </button>
          ))}
          <Link href="/admin/analytics" className="rounded-full border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200">
            Platform analytics
          </Link>
          <Link href="/admin/withdrawals" className="rounded-full border border-violet-300/35 bg-violet-300/10 px-4 py-2 text-sm font-medium text-violet-100">
            Withdrawals
          </Link>
        </div>
      </div>

      <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => <KpiCard key={kpi.label} kpi={kpi} />)}
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
              <p className="mt-1 text-2xl font-black text-white">{formatCurrency(projectedWeeklyPremiumRevenue)}</p>
            </div>
            <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4">
              <p className="text-sm text-amber-100">Projected monthly</p>
              <p className="mt-1 text-2xl font-black text-white">{formatCurrency(projectedWeeklyPremiumRevenue * 4.33)}</p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-4">
              <p className="text-sm text-emerald-100">Paid orders</p>
              <p className="mt-1 text-2xl font-black text-white">{formatNumber(paidPaymentOrders.length)}</p>
            </div>
            <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4">
              <p className="text-sm text-amber-100">Pending</p>
              <p className="mt-1 text-2xl font-black text-white">{formatNumber(pendingPaymentOrders.length)}</p>
            </div>
            <div className="rounded-2xl border border-rose-300/20 bg-rose-300/10 p-4">
              <p className="text-sm text-rose-100">Failed</p>
              <p className="mt-1 text-2xl font-black text-white">{formatNumber(failedPaymentOrders.length)}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-violet-300/20 bg-violet-300/10 p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-black text-white">Creator earnings</h2>
            <p className="mt-1 text-sm leading-6 text-violet-100/80">
              Diamond balances and withdrawal exposure before real payouts are
              connected.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-violet-300/20 bg-black/35 p-4">
              <p className="text-sm text-violet-100">Diamonds issued</p>
              <p className="mt-1 text-2xl font-black text-white">{formatNumber(totalDiamondsIssued)}</p>
            </div>
            <div className="rounded-2xl border border-amber-300/20 bg-black/35 p-4">
              <p className="text-sm text-amber-100">Pending withdrawals</p>
              <p className="mt-1 text-2xl font-black text-white">{formatNumber(totalPendingWithdrawals)}</p>
            </div>
            <div className="rounded-2xl border border-emerald-300/20 bg-black/35 p-4">
              <p className="text-sm text-emerald-100">Completed withdrawals</p>
              <p className="mt-1 text-2xl font-black text-white">{formatNumber(totalCompletedWithdrawals)}</p>
            </div>
          </div>
        </div>
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <EconomyChart datasets={[
          { color: "amber", id: "gold-spent", label: "Gold Spent", points: series.goldSpent },
          { color: "emerald", id: "gold-issued", label: "Gold Issued", points: series.goldIssued },
        ]} title="Gold Movement" />
        <EconomyChart datasets={[
          { color: "emerald", id: "gifts", label: "Gifts Sent", points: series.gifts },
          { color: "amber", id: "gift-spend", label: "Gift Spend", points: series.giftSpend },
        ]} title="Gift Economy" type="bar" />
        <EconomyChart datasets={[
          { color: "rose", id: "messages", label: "Message Charges", points: series.messageCharges },
          { color: "amber", id: "starter", label: "Starter Gold", points: series.starter },
        ]} title="Charges & Starter Gold" />
        <EconomyChart datasets={[
          { color: "emerald", id: "paid-orders", label: "Paid Orders", points: series.paidOrders },
          { color: "amber", id: "pending-orders", label: "Pending Orders", points: series.pendingOrders },
        ]} title="Payment Orders" type="bar" />
        <EconomyChart datasets={[
          { color: "violet", id: "diamonds-issued", label: "Diamonds Issued", points: series.diamondsIssued },
          { color: "amber", id: "pending-withdrawals", label: "Pending Withdrawals", points: series.pendingWithdrawals },
          { color: "emerald", id: "paid-withdrawals", label: "Paid Withdrawals", points: series.paidWithdrawals },
        ]} title="Creator Diamonds & Withdrawals" type="bar" />
        <EconomyChart datasets={[
          { color: "violet", id: "top-gifts", label: "Top Gifts", points: topGiftSeries },
        ]} title="Top Gifts" type="bar" />
        <EconomyChart datasets={[
          { color: "amber", id: "top-gifters", label: "Top Gifters", points: topGiftersSeries },
        ]} title="Top Gifters" type="bar" />
        <EconomyChart datasets={[
          { color: "emerald", id: "top-earners", label: "Top Earners", points: topEarnersSeries },
        ]} title="Top Earners" type="bar" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <RankingTable emptyLabel="No gifts sent in this range." rows={mostSentGifts} title="Most Sent Gifts" />
        <RankingTable emptyLabel="No gift spend in this range." rows={topGifters} title="Top Gifters" />
        <RankingTable emptyLabel="No gift earnings in this range." rows={topEarners} title="Top Earners" />
        <RankingTable emptyLabel="No Gold spending in this range." rows={highestGoldSpenders} title="Highest Gold Spenders" />
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
                  <tr key={`${transaction.user_id}-${transaction.created_at}-${transaction.gold_delta}`}>
                    <td className="py-3 pr-4">
                      {profile ? (
                        <Link href={adminUserHref(profile)} className="font-medium text-emerald-100">
                          {profile.public_id ?? profile.display_name}
                        </Link>
                      ) : (
                        <span className="text-neutral-400">{transaction.user_id}</span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-neutral-300">{transaction.transaction_type}</td>
                    <td className={`py-3 pr-4 font-black ${transaction.gold_delta >= 0 ? "text-emerald-100" : "text-rose-100"}`}>
                      {transaction.gold_delta > 0 ? "+" : ""}{formatNumber(transaction.gold_delta)} Gold
                    </td>
                    <td className="py-3 pr-4 text-neutral-500">{transaction.reference_type ?? "—"}</td>
                    <td className="py-3 text-neutral-400">{formatDate(transaction.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
