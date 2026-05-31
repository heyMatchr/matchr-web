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

type RangeKey = "today" | "7d" | "30d" | "all";
type Tone = "amber" | "blue" | "emerald" | "orange" | "rose" | "violet";

type UserRow = {
  avatar_url: string | null;
  created_at: string;
  display_name: string;
  id: string;
  last_seen_at: string | null;
  public_id: string | null;
  shadow_restricted: boolean;
  under_review: boolean;
};

type MessageRow = {
  created_at: string;
  match_id: string;
  receiver_id: string;
  sender_id: string;
};

type MatchRow = {
  created_at: string;
};

type CallRow = {
  caller_id: string;
  created_at: string;
  receiver_id: string;
  started_at: string | null;
};

type SocialRow = {
  created_at: string;
  user_id: string;
};

type ReportRow = {
  created_at: string;
  reported_user_id?: string | null;
  reporter_id: string;
  status: string;
  target_user_id?: string | null;
};

type GiftRow = {
  created_at: string;
  gold_cost: number | null;
  receiver_id: string;
  sender_id: string;
};

type WalletRow = {
  created_at: string;
  gold_delta: number;
  transaction_type: string;
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
  seven: number;
  thirty: number;
  today: number;
};

type RankedUser = {
  metricLabel: string;
  profile: UserRow | null;
  total: number;
  userId: string;
};

type AnalyticsDashboardClientProps = {
  blocksCount: number;
  calls: CallRow[];
  gifts: GiftRow[];
  matches: MatchRow[];
  messages: MessageRow[];
  moments: SocialRow[];
  reports: ReportRow[];
  stories: SocialRow[];
  totalUsers: number;
  users: UserRow[];
  walletTransactions: WalletRow[];
};

const rangeOptions: Array<{ key: RangeKey; label: string }> = [
  { key: "today", label: "Today" },
  { key: "7d", label: "Last 7 Days" },
  { key: "30d", label: "Last 30 Days" },
  { key: "all", label: "All Time" },
];

const palette: Record<
  Tone,
  { accent: string; bg: string; border: string; fill: string; soft: string }
> = {
  amber: {
    accent: "text-amber-100",
    bg: "bg-amber-300/10",
    border: "border-amber-300/25",
    fill: "#fbbf24",
    soft: "bg-amber-300/15",
  },
  blue: {
    accent: "text-cyan-100",
    bg: "bg-cyan-300/10",
    border: "border-cyan-300/25",
    fill: "#22d3ee",
    soft: "bg-cyan-300/15",
  },
  emerald: {
    accent: "text-emerald-100",
    bg: "bg-emerald-300/10",
    border: "border-emerald-300/25",
    fill: "#34d399",
    soft: "bg-emerald-300/15",
  },
  orange: {
    accent: "text-orange-100",
    bg: "bg-orange-300/10",
    border: "border-orange-300/25",
    fill: "#fb923c",
    soft: "bg-orange-300/15",
  },
  rose: {
    accent: "text-rose-100",
    bg: "bg-rose-300/10",
    border: "border-rose-300/25",
    fill: "#fb7185",
    soft: "bg-rose-300/15",
  },
  violet: {
    accent: "text-violet-100",
    bg: "bg-violet-300/10",
    border: "border-violet-300/25",
    fill: "#a78bfa",
    soft: "bg-violet-300/15",
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

function formatNumber(value: number) {
  return Math.round(value).toLocaleString();
}

function formatPercent(value: number | null) {
  if (value === null || Math.abs(value) < 0.1 || !Number.isFinite(value)) {
    return "Stable";
  }

  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function rangeDays(range: RangeKey) {
  if (range === "today") return 1;
  if (range === "7d") return 7;
  if (range === "30d") return 30;
  return 30;
}

function activeStart(range: RangeKey) {
  const today = startOfDay(new Date());

  if (range === "all") return null;
  if (range === "today") return today.toISOString();
  return addDays(today, -rangeDays(range) + 1).toISOString();
}

function dateKeys(days: number) {
  const today = startOfDay(new Date());
  return Array.from({ length: days }, (_, index) =>
    dateKey(addDays(today, index - days + 1)),
  );
}

function countByDay<T>(
  rows: T[],
  keys: string[],
  getDate: (row: T) => string | null | undefined,
  getValue: (row: T) => number = () => 1,
) {
  const current = new Map(keys.map((key) => [key, 0]));
  const previous = new Map(keys.map((key) => [key, 0]));
  const firstKey = keys[0] ?? dateKey(new Date());
  const previousOffset = keys.length * 24 * 60 * 60 * 1000;
  const firstTime = new Date(`${firstKey}T00:00:00`).getTime();

  rows.forEach((row) => {
    const rawDate = getDate(row);
    if (!rawDate) return;

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

function change(current: number, previous: number) {
  if (previous === 0) return current === 0 ? null : 100;
  return ((current - previous) / previous) * 100;
}

function makeKpi<T>(
  label: string,
  color: Tone,
  rows: T[],
  getDate: (row: T) => string | null | undefined,
  getValue: (row: T) => number = () => 1,
): Kpi {
  const todayKey = dateKey(new Date());
  const sevenKeys = dateKeys(7);
  const thirtyKeys = dateKeys(30);
  const today = rows.reduce((total, row) => {
    const rawDate = getDate(row);
    return rawDate && dateKey(rawDate) === todayKey
      ? total + getValue(row)
      : total;
  }, 0);
  const sevenSeries = countByDay(rows, sevenKeys, getDate, getValue);
  const thirtySeries = countByDay(rows, thirtyKeys, getDate, getValue);
  const seven = sumSeries(sevenSeries);
  const previousSeven = sevenSeries.reduce((total, point) => total + point.previous, 0);

  return {
    change: change(seven, previousSeven),
    color,
    label,
    seven,
    thirty: sumSeries(thirtySeries),
    today,
  };
}

function filterByRange<T>(
  rows: T[],
  range: RangeKey,
  getDate: (row: T) => string | null | undefined,
) {
  const start = activeStart(range);
  if (!start) return rows;

  const startMs = new Date(start).getTime();
  return rows.filter((row) => {
    const rawDate = getDate(row);
    return rawDate ? new Date(rawDate).getTime() >= startMs : false;
  });
}

function rankTotals<T>(
  rows: T[],
  userKey: keyof T,
  value: (row: T) => number,
  metricLabel: string,
  profilesById: Map<string, UserRow>,
) {
  const totals = new Map<string, number>();

  rows.forEach((row) => {
    const userId = String(row[userKey] ?? "");
    if (!userId) return;
    totals.set(userId, (totals.get(userId) ?? 0) + value(row));
  });

  return [...totals.entries()]
    .map<RankedUser>(([userId, total]) => ({
      metricLabel,
      profile: profilesById.get(userId) ?? null,
      total,
      userId,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);
}

function insight(label: string, metricChange: number | null, isRisk = false) {
  if (metricChange === null || Math.abs(metricChange) < 5) {
    return `${label} remains stable compared with the previous period.`;
  }

  if (metricChange > 0) {
    return isRisk
      ? `${label} increased during this period and may need closer review.`
      : `${label} increased ${formatPercent(metricChange)} compared with the previous period.`;
  }

  return isRisk
    ? `${label} decreased ${formatPercent(Math.abs(metricChange))} compared with the previous period.`
    : `${label} cooled ${formatPercent(Math.abs(metricChange))} compared with the previous period.`;
}

function useAnimatedNumber(value: number) {
  const [displayValue, setDisplayValue] = useState(value);
  const fromRef = useRef(value);

  useEffect(() => {
    const from = fromRef.current;
    const start = performance.now();
    const duration = 520;
    let frame = 0;

    const tick = (time: number) => {
      const progress = Math.min(1, (time - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(from + (value - from) * eased);

      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        fromRef.current = value;
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return displayValue;
}

function KpiCard({ kpi }: { kpi: Kpi }) {
  const animatedToday = useAnimatedNumber(kpi.today);
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
            {formatNumber(animatedToday)}
          </p>
          <p className="mt-1 text-xs text-neutral-500">today</p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-black ${trendClass}`}>
          {isUp ? "↑ " : isDown ? "↓ " : "→ "}
          {formatPercent(kpi.change)}
        </span>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className={`rounded-2xl ${colors.bg} p-3`}>
          <p className={`text-lg font-black ${colors.accent}`}>{formatNumber(kpi.seven)}</p>
          <p className="text-xs text-neutral-400">7-day total</p>
        </div>
        <div className="rounded-2xl bg-white/[0.03] p-3">
          <p className="text-lg font-black text-white">{formatNumber(kpi.thirty)}</p>
          <p className="text-xs text-neutral-400">30-day total</p>
        </div>
      </div>
    </article>
  );
}

const TradingChart = memo(function TradingChart({
  datasets,
  title,
  type = "line",
  risk,
}: {
  datasets: Dataset[];
  risk?: boolean;
  title: string;
  type?: "bar" | "line";
}) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const width = 720;
  const height = 260;
  const pad = { bottom: 34, left: 38, right: 20, top: 18 };
  const visible = datasets.filter((dataset) => !hidden.has(dataset.id));
  const pointCount = datasets[0]?.points.length ?? 0;
  const maxValue = Math.max(
    1,
    ...visible.flatMap((dataset) => dataset.points.map((point) => point.value)),
  );
  const selectedIndex = activeIndex ?? Math.max(0, pointCount - 1);
  const selectedDate = datasets[0]?.points[selectedIndex]?.date;
  const selectedRows = visible.map((dataset) => {
    const point = dataset.points[selectedIndex];
    const previous = point?.previous ?? 0;
    return {
      change: change(point?.value ?? 0, previous),
      dataset,
      point,
      previous,
    };
  });
  const primaryChange = change(
    sumSeries(datasets[0]?.points ?? []),
    (datasets[0]?.points ?? []).reduce((total, point) => total + point.previous, 0),
  );

  const xFor = (index: number) =>
    pointCount <= 1
      ? width / 2
      : pad.left + (index / (pointCount - 1)) * (width - pad.left - pad.right);
  const yFor = (value: number) =>
    height - pad.bottom - (value / maxValue) * (height - pad.top - pad.bottom);

  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    setActiveIndex(Math.round(ratio * Math.max(0, pointCount - 1)));
  };

  return (
    <section className="rounded-2xl border border-neutral-800 bg-black/55 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-black text-white">{title}</h3>
          <p className="mt-1 text-xs text-neutral-500">
            Touch or hover for crosshair, exact values, and comparison.
          </p>
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-xs font-bold ${
            primaryChange !== null && primaryChange > 5
              ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
              : primaryChange !== null && primaryChange < -5
                ? "border-rose-300/25 bg-rose-300/10 text-rose-100"
                : "border-amber-300/25 bg-amber-300/10 text-amber-100"
          }`}
        >
          {primaryChange !== null && primaryChange > 5
            ? "↑ "
            : primaryChange !== null && primaryChange < -5
              ? "↓ "
              : "→ "}
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
                if (next.has(dataset.id)) {
                  next.delete(dataset.id);
                } else {
                  next.add(dataset.id);
                }
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
          onPointerLeave={() => setActiveIndex(null)}
          onPointerMove={onPointerMove}
          onPointerDown={onPointerMove}
          role="img"
          viewBox={`0 0 ${width} ${height}`}
        >
          <defs>
            {visible.map((dataset) => (
              <linearGradient
                key={dataset.id}
                id={`gradient-${dataset.id}`}
                x1="0"
                x2="0"
                y1="0"
                y2="1"
              >
                <stop offset="0%" stopColor={palette[dataset.color].fill} stopOpacity="0.18" />
                <stop offset="100%" stopColor={palette[dataset.color].fill} stopOpacity="0" />
              </linearGradient>
            ))}
          </defs>
          {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
            const y = pad.top + tick * (height - pad.top - pad.bottom);
            return (
              <g key={tick}>
                <line
                  stroke="rgba(255,255,255,0.06)"
                  x1={pad.left}
                  x2={width - pad.right}
                  y1={y}
                  y2={y}
                />
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
            const smoothPath = points
              .map((point, index) => {
                if (index === 0) return `M ${point.x} ${point.y}`;
                const previous = points[index - 1];
                const midX = (previous.x + point.x) / 2;
                return `C ${midX} ${previous.y}, ${midX} ${point.y}, ${point.x} ${point.y}`;
              })
              .join(" ");
            const areaPath = `${smoothPath} L ${points.at(-1)?.x ?? pad.left} ${height - pad.bottom} L ${points[0]?.x ?? pad.left} ${height - pad.bottom} Z`;

            if (type === "bar") {
              const barWidth = Math.max(4, (width - pad.left - pad.right) / Math.max(1, pointCount) - 6);
              return (
                <g key={dataset.id}>
                  {points.map((point) => (
                    <rect
                      key={point.date}
                      fill={palette[dataset.color].fill}
                      height={height - pad.bottom - point.y}
                      opacity={datasetIndex === 0 ? 0.9 : 0.45}
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
              <g key={dataset.id}>
                <path d={areaPath} fill={`url(#gradient-${dataset.id})`} />
                <path
                  d={smoothPath}
                  fill="none"
                  stroke={palette[dataset.color].fill}
                  strokeLinecap="round"
                  strokeWidth="3"
                />
              </g>
            );
          })}

          {selectedDate ? (
            <g>
              <line
                stroke="rgba(255,255,255,0.36)"
                strokeDasharray="4 4"
                x1={xFor(selectedIndex)}
                x2={xFor(selectedIndex)}
                y1={pad.top}
                y2={height - pad.bottom}
              />
              {selectedRows[0]?.point ? (
                <line
                  stroke="rgba(255,255,255,0.24)"
                  strokeDasharray="4 4"
                  x1={pad.left}
                  x2={width - pad.right}
                  y1={yFor(selectedRows[0].point.value)}
                  y2={yFor(selectedRows[0].point.value)}
                />
              ) : null}
              {selectedRows.map(({ dataset, point }) =>
                point ? (
                  <circle
                    key={dataset.id}
                    cx={xFor(selectedIndex)}
                    cy={yFor(point.value)}
                    fill="#050505"
                    r="6"
                    stroke={palette[dataset.color].fill}
                    strokeWidth="3"
                  />
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
        {insight(title, primaryChange, risk)}
      </p>
    </section>
  );
});

function UserAvatar({ profile }: { profile: UserRow | null }) {
  return (
    <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full bg-neutral-900">
      {profile?.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt={profile.display_name}
          className="h-full w-full object-cover"
          src={profile.avatar_url}
        />
      ) : (
        <div className="grid h-full w-full place-items-center text-sm font-black text-neutral-600">
          {profile?.display_name?.charAt(0) ?? "?"}
        </div>
      )}
    </div>
  );
}

function DataTable({
  emptyLabel,
  rows,
  title,
}: {
  emptyLabel: string;
  rows: RankedUser[];
  title: string;
}) {
  return (
    <section className="rounded-2xl border border-neutral-800 bg-black/50 p-5">
      <h2 className="text-xl font-black text-white">{title}</h2>
      <div className="mt-5 space-y-3">
        {rows.length ? (
          rows.map((row) => {
            const href = `/admin/users/${row.profile?.public_id ?? row.userId}`;

            return (
              <Link
                key={`${title}-${row.userId}`}
                className="flex items-center justify-between gap-3 rounded-2xl border border-neutral-800 bg-white/[0.03] p-3 transition-colors hover:border-emerald-300/30"
                href={href}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <UserAvatar profile={row.profile} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-white">
                      {row.profile?.display_name ?? "Unknown user"}
                    </p>
                    <p className="truncate text-xs text-neutral-500">
                      {row.profile?.public_id ?? row.userId}
                    </p>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-black text-white">{formatNumber(row.total)}</p>
                  <p className="text-xs text-neutral-500">{row.metricLabel}</p>
                </div>
              </Link>
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

export function AnalyticsDashboardClient({
  blocksCount,
  calls,
  gifts,
  matches,
  messages,
  moments,
  reports,
  stories,
  totalUsers,
  users,
  walletTransactions,
}: AnalyticsDashboardClientProps) {
  const [range, setRange] = useState<RangeKey>("7d");
  const keys = useMemo(() => dateKeys(rangeDays(range)), [range]);
  const profilesById = useMemo(
    () => new Map(users.map((user) => [user.id, user])),
    [users],
  );
  const activeMessages = useMemo(
    () => filterByRange(messages, range, (row) => row.created_at),
    [messages, range],
  );
  const activeCalls = useMemo(
    () => filterByRange(calls, range, (row) => row.started_at ?? row.created_at),
    [calls, range],
  );
  const activeGifts = useMemo(
    () => filterByRange(gifts, range, (row) => row.created_at),
    [gifts, range],
  );
  const activeReports = useMemo(
    () => filterByRange(reports, range, (row) => row.created_at),
    [range, reports],
  );
  const goldSpentRows = useMemo(
    () => walletTransactions.filter((row) => row.gold_delta < 0),
    [walletTransactions],
  );
  const giftEarningRows = useMemo(
    () =>
      walletTransactions.filter(
        (row) => row.transaction_type === "gift_received" && row.gold_delta > 0,
      ),
    [walletTransactions],
  );
  const openReports = useMemo(
    () => reports.filter((report) => report.status === "open"),
    [reports],
  );
  const kpis = useMemo(
    () => [
      makeKpi("New Users", "emerald", users, (row) => row.created_at),
      makeKpi("Messages", "blue", messages, (row) => row.created_at),
      makeKpi("Calls Started", "violet", calls, (row) => row.started_at ?? row.created_at),
      makeKpi("Open Reports", "rose", openReports, (row) => row.created_at),
      makeKpi("Gifts Sent", "amber", gifts, (row) => row.created_at),
      makeKpi(
        "Gold Spent",
        "amber",
        goldSpentRows,
        (row) => row.created_at,
        (row) => Math.abs(row.gold_delta),
      ),
    ],
    [calls, gifts, goldSpentRows, messages, openReports, users],
  );

  const series = useMemo(
    () => ({
      activeUsers: countByDay(users, keys, (row) => row.last_seen_at),
      calls: countByDay(calls, keys, (row) => row.started_at ?? row.created_at),
      gifts: countByDay(gifts, keys, (row) => row.created_at),
      gold: countByDay(
        goldSpentRows,
        keys,
        (row) => row.created_at,
        (row) => Math.abs(row.gold_delta),
      ),
      matches: countByDay(matches, keys, (row) => row.created_at),
      messages: countByDay(messages, keys, (row) => row.created_at),
      moments: countByDay(moments, keys, (row) => row.created_at),
      reports: countByDay(openReports, keys, (row) => row.created_at),
      retention: countByDay(users, keys, (row) => row.last_seen_at, (row) => {
        const created = new Date(row.created_at).getTime();
        const seen = row.last_seen_at ? new Date(row.last_seen_at).getTime() : 0;
        return seen - created > 24 * 60 * 60 * 1000 ? 1 : 0;
      }),
      shadow: countByDay(
        users.filter((row) => row.shadow_restricted),
        keys,
        (row) => row.created_at,
      ),
      stories: countByDay(stories, keys, (row) => row.created_at),
      underReview: countByDay(
        users.filter((row) => row.under_review),
        keys,
        (row) => row.created_at,
      ),
      users: countByDay(users, keys, (row) => row.created_at),
    }),
    [calls, gifts, goldSpentRows, keys, matches, messages, moments, openReports, stories, users],
  );

  const topActiveUsers = useMemo(
    () =>
      rankTotals(
        [
          ...activeMessages.map((row) => ({ user_id: row.sender_id, value: 3 })),
          ...activeCalls.map((row) => ({ user_id: row.caller_id, value: 5 })),
          ...filterByRange(stories, range, (row) => row.created_at).map((row) => ({
            user_id: row.user_id,
            value: 4,
          })),
          ...filterByRange(moments, range, (row) => row.created_at).map((row) => ({
            user_id: row.user_id,
            value: 4,
          })),
          ...activeGifts.map((row) => ({ user_id: row.sender_id, value: 6 })),
        ],
        "user_id",
        (row) => row.value,
        "activity score",
        profilesById,
      ),
    [activeCalls, activeGifts, activeMessages, moments, profilesById, range, stories],
  );
  const topGifters = useMemo(
    () =>
      rankTotals(
        activeGifts,
        "sender_id",
        (row) => Math.abs(row.gold_cost ?? 0),
        "Gold spent",
        profilesById,
      ),
    [activeGifts, profilesById],
  );
  const topEarners = useMemo(
    () =>
      rankTotals(
        filterByRange(giftEarningRows, range, (row) => row.created_at),
        "user_id",
        (row) => Math.abs(row.gold_delta),
        "Gold earned",
        profilesById,
      ),
    [giftEarningRows, profilesById, range],
  );
  const mostReported = useMemo(
    () =>
      rankTotals(
        activeReports
          .map((row) => ({
            target_user_id: row.target_user_id ?? row.reported_user_id ?? "",
          }))
          .filter((row) => row.target_user_id),
        "target_user_id",
        () => 1,
        "reports",
        profilesById,
      ),
    [activeReports, profilesById],
  );
  const conversations = useMemo(() => {
    const totals = new Map<string, { participants: Set<string>; total: number }>();
    activeMessages.forEach((message) => {
      const entry = totals.get(message.match_id) ?? {
        participants: new Set<string>(),
        total: 0,
      };
      entry.total += 1;
      entry.participants.add(message.sender_id);
      entry.participants.add(message.receiver_id);
      totals.set(message.match_id, entry);
    });

    return [...totals.entries()]
      .map(([matchId, entry]) => ({
        matchId,
        participants: [...entry.participants]
          .slice(0, 2)
          .map((id) => profilesById.get(id) ?? null),
        total: entry.total,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [activeMessages, profilesById]);

  return (
    <>
      <div className="mt-6 flex flex-col gap-4 rounded-2xl border border-neutral-800 bg-black/50 p-5 md:flex-row md:items-end md:justify-between">
        <div>
          <Link href="/admin" className="text-sm font-medium text-emerald-100">
            Back to admin
          </Link>
          <h2 className="mt-3 text-2xl font-black tracking-tight text-white">
            Platform intelligence
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-neutral-400">
            Trading-style analytics with crosshair inspection, live timeframe
            filtering, KPI animation, and operational signal tables.
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
                  ? "border-emerald-300/40 bg-emerald-300/15 text-emerald-50"
                  : "border-neutral-700 text-neutral-300 hover:border-neutral-500"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {kpis.map((kpi) => (
          <KpiCard key={kpi.label} kpi={kpi} />
        ))}
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <TradingChart
          datasets={[
            { color: "emerald", id: "new-users", label: "New Users", points: series.users },
            {
              color: "blue",
              id: "active-users",
              label: "Active Users",
              points: series.activeUsers,
            },
            {
              color: "violet",
              id: "retention",
              label: "Retention Proxy",
              points: series.retention,
            },
          ]}
          title="Users"
        />
        <TradingChart
          datasets={[
            { color: "blue", id: "messages", label: "Messages", points: series.messages },
            { color: "emerald", id: "matches", label: "Matches", points: series.matches },
          ]}
          title="Messages & Matches"
          type="bar"
        />
        <TradingChart
          datasets={[
            { color: "violet", id: "calls", label: "Calls", points: series.calls },
            { color: "blue", id: "stories", label: "Stories", points: series.stories },
            { color: "emerald", id: "moments", label: "Moments", points: series.moments },
          ]}
          title="Engagement Channels"
        />
        <TradingChart
          datasets={[
            { color: "rose", id: "reports", label: "Reports", points: series.reports },
            {
              color: "orange",
              id: "review",
              label: "Under Review",
              points: series.underReview,
            },
            { color: "orange", id: "shadow", label: "Shadow Restricted", points: series.shadow },
          ]}
          risk
          title="Safety Signals"
          type="bar"
        />
        <TradingChart
          datasets={[
            { color: "amber", id: "gifts", label: "Gifts", points: series.gifts },
            { color: "emerald", id: "gold", label: "Gold Spent", points: series.gold },
          ]}
          title="Economy"
        />
      </div>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-neutral-800 bg-black/50 p-5">
          <p className="text-sm text-neutral-400">Total users</p>
          <p className="mt-2 text-3xl font-black text-white">{formatNumber(totalUsers)}</p>
        </div>
        <div className="rounded-2xl border border-neutral-800 bg-black/50 p-5">
          <p className="text-sm text-neutral-400">Under review</p>
          <p className="mt-2 text-3xl font-black text-orange-100">
            {formatNumber(users.filter((user) => user.under_review).length)}
          </p>
        </div>
        <div className="rounded-2xl border border-neutral-800 bg-black/50 p-5">
          <p className="text-sm text-neutral-400">Shadow restricted</p>
          <p className="mt-2 text-3xl font-black text-orange-100">
            {formatNumber(users.filter((user) => user.shadow_restricted).length)}
          </p>
        </div>
        <div className="rounded-2xl border border-neutral-800 bg-black/50 p-5">
          <p className="text-sm text-neutral-400">Blocked relationships</p>
          <p className="mt-2 text-3xl font-black text-rose-100">
            {formatNumber(blocksCount)}
          </p>
        </div>
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <DataTable emptyLabel="No activity in this range." rows={topActiveUsers} title="Top Active Users" />
        <DataTable emptyLabel="No gift spending in this range." rows={topGifters} title="Top Gifters" />
        <DataTable emptyLabel="No gift earnings in this range." rows={topEarners} title="Top Earners" />
        <DataTable emptyLabel="No reports in this range." rows={mostReported} title="Most Reported Users" />
        <section className="rounded-2xl border border-neutral-800 bg-black/50 p-5">
          <h2 className="text-xl font-black text-white">Most Active Conversations</h2>
          <div className="mt-5 space-y-3">
            {conversations.length ? (
              conversations.map((row) => (
                <div
                  key={row.matchId}
                  className="rounded-2xl border border-neutral-800 bg-white/[0.03] p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-white">
                        {row.participants
                          .map((profile) => profile?.display_name ?? "Unknown")
                          .join(" ↔ ")}
                      </p>
                      <p className="mt-1 truncate text-xs text-neutral-500">
                        {row.participants
                          .map((profile) => profile?.public_id ?? "No ID")
                          .join(" · ")}
                      </p>
                    </div>
                    <p className="shrink-0 rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1 text-sm font-black text-cyan-100">
                      {formatNumber(row.total)}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <p className="rounded-2xl border border-neutral-800 bg-white/[0.03] p-4 text-sm text-neutral-400">
                No active conversations in this range.
              </p>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
