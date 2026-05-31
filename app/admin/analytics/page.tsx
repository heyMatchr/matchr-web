import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/app/_components/app-shell";
import { requireAdmin } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { AdminUserAvatar, adminUserHref } from "../admin-shared";

type AnalyticsPageProps = {
  searchParams?: Promise<{
    range?: string;
  }>;
};

type ProfileSummary = {
  avatar_url: string | null;
  display_name: string;
  id: string;
  public_id: string | null;
};

type DateRow = {
  created_at: string;
};

type LastSeenRow = {
  created_at: string;
  last_seen_at: string | null;
};

type UserAnalyticsRow = ProfileSummary &
  LastSeenRow & {
    shadow_restricted: boolean;
    under_review: boolean;
  };

type MessageAnalyticsRow = {
  created_at: string;
  match_id: string;
  receiver_id: string;
  sender_id: string;
};

type CallAnalyticsRow = DateRow & {
  caller_id: string;
  receiver_id: string;
  started_at: string | null;
};

type GiftAnalyticsRow = DateRow & {
  gold_cost: number | null;
  receiver_id: string;
  sender_id: string;
};

type WalletAnalyticsRow = DateRow & {
  gold_delta: number;
  transaction_type: string;
  user_id: string;
};

type ReportAnalyticsRow = DateRow & {
  reported_user_id?: string | null;
  reporter_id: string;
  status: string;
  target_user_id?: string | null;
};

type SeriesPoint = {
  date: string;
  label: string;
  value: number;
};

type RankedUser = {
  metricLabel: string;
  profile: ProfileSummary | null;
  total: number;
  userId: string;
};

type ConversationRow = {
  matchId: string;
  participants: Array<ProfileSummary | null>;
  total: number;
};

const rangeOptions = [
  { href: "/admin/analytics?range=today", key: "today", label: "Today" },
  { href: "/admin/analytics?range=7d", key: "7d", label: "Last 7 Days" },
  { href: "/admin/analytics?range=30d", key: "30d", label: "Last 30 Days" },
  { href: "/admin/analytics?range=all", key: "all", label: "All Time" },
];

const metricColors = {
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
  if (value === null || !Number.isFinite(value)) {
    return "Stable";
  }

  return `${value > 0 ? "+" : ""}${Math.round(value)}%`;
}

function getRangeDays(range: string) {
  if (range === "today") return 1;
  if (range === "7d") return 7;
  return 30;
}

function buildDateKeys(days: number, endDate = startOfDay(new Date())) {
  return Array.from({ length: days }, (_, index) => {
    const offset = index - days + 1;
    return dateKey(addDays(endDate, offset));
  });
}

function countRowsByDay<T>(
  rows: T[],
  keys: string[],
  getDate: (row: T) => string | null | undefined,
  getValue: (row: T) => number = () => 1,
) {
  const totals = new Map(keys.map((key) => [key, 0]));

  rows.forEach((row) => {
    const rawDate = getDate(row);
    if (!rawDate) {
      return;
    }

    const key = dateKey(rawDate);
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

function sumSeries(series: SeriesPoint[]) {
  return series.reduce((total, point) => total + point.value, 0);
}

function comparisonChange(current: number, previous: number) {
  if (previous === 0) {
    if (current === 0) return null;
    return 100;
  }

  return ((current - previous) / previous) * 100;
}

function splitCurrentPrevious<T>(
  rows: T[],
  getDate: (row: T) => string | null | undefined,
  now: Date,
  days: number,
  getValue: (row: T) => number = () => 1,
) {
  const currentStart = addDays(startOfDay(now), -days + 1).getTime();
  const previousStart = addDays(startOfDay(now), -days * 2 + 1).getTime();
  const currentEnd = addDays(startOfDay(now), 1).getTime();
  let current = 0;
  let previous = 0;

  rows.forEach((row) => {
    const rawDate = getDate(row);
    if (!rawDate) {
      return;
    }

    const timestamp = new Date(rawDate).getTime();
    const value = getValue(row);

    if (timestamp >= currentStart && timestamp < currentEnd) {
      current += value;
    } else if (timestamp >= previousStart && timestamp < currentStart) {
      previous += value;
    }
  });

  return { current, previous };
}

function makeKpi<T>({
  color,
  getDate,
  getValue,
  label,
  rows,
}: {
  color: keyof typeof metricColors;
  getDate: (row: T) => string | null | undefined;
  getValue?: (row: T) => number;
  label: string;
  rows: T[];
}) {
  const now = new Date();
  const todayKey = dateKey(now);
  const valueGetter = getValue ?? (() => 1);
  const today = rows.reduce((total, row) => {
    const rawDate = getDate(row);
    return rawDate && dateKey(rawDate) === todayKey
      ? total + valueGetter(row)
      : total;
  }, 0);
  const seven = splitCurrentPrevious(rows, getDate, now, 7, valueGetter);
  const thirty = splitCurrentPrevious(rows, getDate, now, 30, valueGetter);

  return {
    change: comparisonChange(seven.current, seven.previous),
    color,
    label,
    previousSeven: seven.previous,
    seven: seven.current,
    thirty: thirty.current,
    today,
  };
}

function insightText(label: string, change: number | null, isRiskMetric = false) {
  if (change === null || Math.abs(change) < 5) {
    return `${label} remains stable compared to the previous period.`;
  }

  if (change > 0) {
    return isRiskMetric
      ? `${label} increased this week and may need closer review.`
      : `${label} increased compared to the previous period.`;
  }

  return isRiskMetric
    ? `${label} is down compared to the previous period.`
    : `${label} softened compared to the previous period.`;
}

function KpiCard({
  change,
  color,
  label,
  seven,
  thirty,
  today,
}: ReturnType<typeof makeKpi>) {
  const palette = metricColors[color];
  const isUp = change !== null && change > 5;
  const isDown = change !== null && change < -5;
  const trendClass = isUp
    ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
    : isDown
      ? "border-rose-300/25 bg-rose-300/10 text-rose-100"
      : "border-neutral-700 bg-white/[0.03] text-neutral-300";

  return (
    <article className={`rounded-2xl border ${palette.border} bg-black/55 p-5`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-neutral-400">{label}</p>
          <p className="mt-2 text-3xl font-black tracking-tight text-white">
            {formatNumber(today)}
          </p>
          <p className="mt-1 text-xs text-neutral-500">today</p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-bold ${trendClass}`}>
          {isUp ? "↑ " : isDown ? "↓ " : "→ "}
          {formatPercent(change)}
        </span>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className={`rounded-2xl ${palette.bg} p-3`}>
          <p className={`text-lg font-black ${palette.accent}`}>{formatNumber(seven)}</p>
          <p className="text-xs text-neutral-400">7-day total</p>
        </div>
        <div className="rounded-2xl bg-white/[0.03] p-3">
          <p className="text-lg font-black text-white">{formatNumber(thirty)}</p>
          <p className="text-xs text-neutral-400">30-day total</p>
        </div>
      </div>
    </article>
  );
}

function LineChart({
  color,
  series,
}: {
  color: keyof typeof metricColors;
  series: SeriesPoint[];
}) {
  const width = 640;
  const height = 180;
  const padding = 24;
  const maxValue = Math.max(1, ...series.map((point) => point.value));
  const points = series.map((point, index) => {
    const x =
      series.length === 1
        ? width / 2
        : padding + (index / (series.length - 1)) * (width - padding * 2);
    const y = height - padding - (point.value / maxValue) * (height - padding * 2);
    return { ...point, x, y };
  });
  const path = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
  const areaPath = `${path} L ${points.at(-1)?.x ?? padding} ${height - padding} L ${points[0]?.x ?? padding} ${height - padding} Z`;
  const palette = metricColors[color];

  return (
    <svg
      aria-hidden="true"
      className="h-48 w-full overflow-visible"
      viewBox={`0 0 ${width} ${height}`}
    >
      <path d={areaPath} fill={palette.fill} opacity="0.12" />
      <path d={path} fill="none" stroke={palette.fill} strokeLinecap="round" strokeWidth="3" />
      {points.map((point) => (
        <g key={point.date}>
          <circle cx={point.x} cy={point.y} fill={palette.fill} r="4">
            <title>
              {point.label}: {formatNumber(point.value)}
            </title>
          </circle>
        </g>
      ))}
    </svg>
  );
}

function BarChart({
  color,
  series,
}: {
  color: keyof typeof metricColors;
  series: SeriesPoint[];
}) {
  const maxValue = Math.max(1, ...series.map((point) => point.value));
  const palette = metricColors[color];

  return (
    <div className="flex h-48 items-end gap-1.5 rounded-2xl border border-neutral-900 bg-black/40 p-3">
      {series.map((point) => (
        <div key={point.date} className="flex min-w-0 flex-1 flex-col items-center gap-2">
          <div
            className="w-full rounded-t-md transition-opacity hover:opacity-80"
            style={{
              backgroundColor: palette.fill,
              height: `${Math.max(6, (point.value / maxValue) * 150)}px`,
            }}
            title={`${point.label}: ${formatNumber(point.value)}`}
          />
          <span className="hidden text-[10px] text-neutral-600 sm:block">
            {point.label.split(" ")[1] ?? point.label}
          </span>
        </div>
      ))}
    </div>
  );
}

function ChartCard({
  change,
  color,
  isRiskMetric,
  series,
  title,
  type = "line",
}: {
  change: number | null;
  color: keyof typeof metricColors;
  isRiskMetric?: boolean;
  series: SeriesPoint[];
  title: string;
  type?: "bar" | "line";
}) {
  const palette = metricColors[color];

  return (
    <section className="rounded-2xl border border-neutral-800 bg-black/50 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-black text-white">{title}</h3>
          <p className="mt-1 text-xs text-neutral-500">
            Hover chart marks for daily values.
          </p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs ${palette.border} ${palette.bg} ${palette.accent}`}>
          {formatPercent(change)} vs previous 7d
        </span>
      </div>
      <div className="mt-4">
        {type === "bar" ? (
          <BarChart color={color} series={series} />
        ) : (
          <LineChart color={color} series={series} />
        )}
      </div>
      <p className="mt-4 rounded-2xl border border-neutral-800 bg-white/[0.03] px-4 py-3 text-sm leading-6 text-neutral-300">
        {insightText(title, change, isRiskMetric)}
      </p>
    </section>
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
            const profile = row.profile;

            return (
              <Link
                key={`${title}-${row.userId}`}
                href={profile ? adminUserHref(profile) : `/admin/users/${row.userId}`}
                className="flex items-center justify-between gap-3 rounded-2xl border border-neutral-800 bg-white/[0.03] p-3 transition-colors hover:border-emerald-300/30"
              >
                <div className="flex min-w-0 items-center gap-3">
                  {profile ? (
                    <AdminUserAvatar profile={profile} />
                  ) : (
                    <div className="h-12 w-12 shrink-0 rounded-full bg-neutral-900" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-white">
                      {profile?.display_name ?? "Unknown user"}
                    </p>
                    <p className="truncate text-xs text-neutral-500">
                      {profile?.public_id ?? row.userId}
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

function ConversationsTable({ rows }: { rows: ConversationRow[] }) {
  return (
    <section className="rounded-2xl border border-neutral-800 bg-black/50 p-5">
      <h2 className="text-xl font-black text-white">Most Active Conversations</h2>
      <div className="mt-5 space-y-3">
        {rows.length ? (
          rows.map((row) => (
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
  );
}

function rankTotals<T>(
  rows: T[],
  userKey: keyof T,
  value: (row: T) => number,
  metricLabel: string,
  profilesById: Map<string, ProfileSummary>,
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

function filterRowsByRange<T>(
  rows: T[],
  getDate: (row: T) => string | null | undefined,
  rangeStart: string | null,
) {
  if (!rangeStart) {
    return rows;
  }

  const start = new Date(rangeStart).getTime();
  return rows.filter((row) => {
    const rawDate = getDate(row);
    return rawDate ? new Date(rawDate).getTime() >= start : false;
  });
}

export default async function AdminAnalyticsPage({
  searchParams,
}: AnalyticsPageProps) {
  const params = await searchParams;
  const selectedRange = rangeOptions.some((option) => option.key === params?.range)
    ? params?.range ?? "7d"
    : "7d";
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
  const sixtyDaysAgo = addDays(startOfDay(now), -59).toISOString();
  const activeRangeStart =
    selectedRange === "all"
      ? null
      : selectedRange === "today"
        ? todayStart
        : selectedRange === "30d"
          ? thirtyDaysAgo
          : sevenDaysAgo;
  const chartDays = selectedRange === "today" ? 7 : getRangeDays(selectedRange);
  const chartKeys = buildDateKeys(chartDays);
  const thirtyKeys = buildDateKeys(30);

  const [
    totalUsersResult,
    usersResult,
    messagesResult,
    matchesResult,
    callsResult,
    storiesResult,
    momentsResult,
    reportsResult,
    legacyReportsResult,
    underReviewResult,
    shadowRestrictedResult,
    blocksResult,
    blockedUsersResult,
    giftsResult,
    walletResult,
  ] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase
      .from("profiles")
      .select(
        "id, public_id, display_name, avatar_url, created_at, last_seen_at, under_review, shadow_restricted",
      )
      .or(`created_at.gte.${sixtyDaysAgo},last_seen_at.gte.${sixtyDaysAgo}`)
      .limit(10000),
    supabase
      .from("messages")
      .select("id, match_id, sender_id, receiver_id, created_at")
      .gte("created_at", sixtyDaysAgo)
      .limit(20000),
    supabase
      .from("matches")
      .select("id, user_one_id, user_two_id, created_at")
      .gte("created_at", sixtyDaysAgo)
      .limit(10000),
    supabase
      .from("call_sessions")
      .select("id, caller_id, receiver_id, started_at, created_at")
      .gte("created_at", sixtyDaysAgo)
      .limit(10000),
    supabase
      .from("stories")
      .select("id, user_id, created_at")
      .gte("created_at", sixtyDaysAgo)
      .limit(10000),
    supabase
      .from("moments")
      .select("id, user_id, created_at")
      .gte("created_at", sixtyDaysAgo)
      .limit(10000),
    supabase
      .from("reports")
      .select("id, reporter_id, target_user_id, reported_user_id, status, created_at")
      .gte("created_at", sixtyDaysAgo)
      .limit(10000),
    supabase
      .from("user_reports")
      .select("id, reporter_id, reported_user_id, status, created_at")
      .gte("created_at", sixtyDaysAgo)
      .limit(10000),
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("under_review", true),
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("shadow_restricted", true),
    supabase.from("blocks").select("id", { count: "exact", head: true }),
    supabase.from("blocked_users").select("id", { count: "exact", head: true }),
    supabase
      .from("gift_transactions")
      .select("id, sender_id, receiver_id, gold_cost, created_at")
      .gte("created_at", sixtyDaysAgo)
      .limit(10000),
    supabase
      .from("wallet_transactions")
      .select("id, user_id, transaction_type, gold_delta, created_at")
      .gte("created_at", sixtyDaysAgo)
      .limit(20000),
  ]);

  const firstError = [
    totalUsersResult,
    usersResult,
    messagesResult,
    matchesResult,
    callsResult,
    storiesResult,
    momentsResult,
    reportsResult,
    legacyReportsResult,
    underReviewResult,
    shadowRestrictedResult,
    blocksResult,
    blockedUsersResult,
    giftsResult,
    walletResult,
  ].find((result) => result.error)?.error;

  if (firstError) {
    throw new Error(firstError.message);
  }

  const users = (usersResult.data ?? []) as UserAnalyticsRow[];
  const messages = (messagesResult.data ?? []) as MessageAnalyticsRow[];
  const matches = (matchesResult.data ?? []) as DateRow[];
  const calls = (callsResult.data ?? []) as CallAnalyticsRow[];
  const stories = (storiesResult.data ?? []) as Array<DateRow & { user_id: string }>;
  const moments = (momentsResult.data ?? []) as Array<DateRow & { user_id: string }>;
  const reports = [
    ...((reportsResult.data ?? []) as ReportAnalyticsRow[]),
    ...((legacyReportsResult.data ?? []) as ReportAnalyticsRow[]),
  ];
  const gifts = (giftsResult.data ?? []) as GiftAnalyticsRow[];
  const walletRows = (walletResult.data ?? []) as WalletAnalyticsRow[];
  const openReports = reports.filter((report) => report.status === "open");
  const goldSpentRows = walletRows.filter((row) => row.gold_delta < 0);
  const giftEarningRows = walletRows.filter(
    (row) => row.transaction_type === "gift_received" && row.gold_delta > 0,
  );

  const activeMessages = filterRowsByRange(messages, (row) => row.created_at, activeRangeStart);
  const activeCalls = filterRowsByRange(calls, (row) => row.started_at ?? row.created_at, activeRangeStart);
  const activeStories = filterRowsByRange(stories, (row) => row.created_at, activeRangeStart);
  const activeMoments = filterRowsByRange(moments, (row) => row.created_at, activeRangeStart);
  const activeGifts = filterRowsByRange(gifts, (row) => row.created_at, activeRangeStart);
  const activeWalletRows = filterRowsByRange(walletRows, (row) => row.created_at, activeRangeStart);
  const activeReports = filterRowsByRange(reports, (row) => row.created_at, activeRangeStart);

  const usersSeries = countRowsByDay(users, chartKeys, (row) => row.created_at);
  const activeUsersSeries = countRowsByDay(users, chartKeys, (row) => row.last_seen_at);
  const retentionSeries = countRowsByDay(users, chartKeys, (row) => row.last_seen_at, (row) => {
    const created = new Date(row.created_at).getTime();
    const seen = row.last_seen_at ? new Date(row.last_seen_at).getTime() : 0;
    return seen - created > 24 * 60 * 60 * 1000 ? 1 : 0;
  });
  const messagesSeries = countRowsByDay(messages, chartKeys, (row) => row.created_at);
  const matchesSeries = countRowsByDay(matches, chartKeys, (row) => row.created_at);
  const callsSeries = countRowsByDay(calls, chartKeys, (row) => row.started_at ?? row.created_at);
  const storiesSeries = countRowsByDay(stories, chartKeys, (row) => row.created_at);
  const momentsSeries = countRowsByDay(moments, chartKeys, (row) => row.created_at);
  const reportsSeries = countRowsByDay(openReports, chartKeys, (row) => row.created_at);
  const reviewSeries = countRowsByDay(
    users.filter((row) => row.under_review),
    chartKeys,
    (row) => row.created_at,
  );
  const shadowSeries = countRowsByDay(
    users.filter((row) => row.shadow_restricted),
    chartKeys,
    (row) => row.created_at,
  );
  const giftsSeries = countRowsByDay(gifts, chartKeys, (row) => row.created_at);
  const goldSeries = countRowsByDay(
    goldSpentRows,
    chartKeys,
    (row) => row.created_at,
    (row) => Math.abs(row.gold_delta),
  );

  const usersThirtySeries = countRowsByDay(users, thirtyKeys, (row) => row.created_at);
  const activeUsersThirtySeries = countRowsByDay(users, thirtyKeys, (row) => row.last_seen_at);
  const messagesThirtySeries = countRowsByDay(messages, thirtyKeys, (row) => row.created_at);
  const giftsThirtySeries = countRowsByDay(gifts, thirtyKeys, (row) => row.created_at);

  const userKpi = makeKpi({
    color: "emerald",
    getDate: (row: LastSeenRow) => row.created_at,
    label: "New Users",
    rows: users,
  });
  const messageKpi = makeKpi({
    color: "blue",
    getDate: (row: MessageAnalyticsRow) => row.created_at,
    label: "Messages",
    rows: messages,
  });
  const callKpi = makeKpi({
    color: "violet",
    getDate: (row: CallAnalyticsRow) => row.started_at ?? row.created_at,
    label: "Calls Started",
    rows: calls,
  });
  const reportKpi = makeKpi({
    color: "rose",
    getDate: (row: ReportAnalyticsRow) => row.created_at,
    label: "Open Reports",
    rows: openReports,
  });
  const giftKpi = makeKpi({
    color: "amber",
    getDate: (row: GiftAnalyticsRow) => row.created_at,
    label: "Gifts Sent",
    rows: gifts,
  });
  const goldKpi = makeKpi({
    color: "amber",
    getDate: (row: WalletAnalyticsRow) => row.created_at,
    getValue: (row) => Math.abs(row.gold_delta),
    label: "Gold Spent",
    rows: goldSpentRows,
  });

  const profileIds = [
    ...new Set([
      ...activeMessages.flatMap((row) => [row.sender_id, row.receiver_id]),
      ...activeCalls.flatMap((row) => [row.caller_id, row.receiver_id]),
      ...activeStories.map((row) => row.user_id),
      ...activeMoments.map((row) => row.user_id),
      ...activeGifts.flatMap((row) => [row.sender_id, row.receiver_id]),
      ...activeWalletRows.map((row) => row.user_id),
      ...activeReports.flatMap((row) => [
        row.reporter_id,
        row.target_user_id ?? row.reported_user_id ?? null,
      ]),
    ]),
  ].filter((id): id is string => Boolean(id));
  const { data: profileRows, error: profileError } = profileIds.length
    ? await supabase
        .from("profiles")
        .select("id, public_id, display_name, avatar_url")
        .in("id", profileIds)
    : { data: [], error: null };

  if (profileError) {
    throw new Error(profileError.message);
  }

  const profilesById = new Map(
    (profileRows ?? []).map((profile) => [profile.id, profile as ProfileSummary]),
  );
  const topActiveUsers = rankTotals(
    [
      ...activeMessages.map((row) => ({ user_id: row.sender_id, value: 3 })),
      ...activeCalls.map((row) => ({ user_id: row.caller_id, value: 5 })),
      ...activeStories.map((row) => ({ user_id: row.user_id, value: 4 })),
      ...activeMoments.map((row) => ({ user_id: row.user_id, value: 4 })),
      ...activeGifts.map((row) => ({ user_id: row.sender_id, value: 6 })),
    ],
    "user_id",
    (row) => row.value,
    "activity score",
    profilesById,
  );
  const topGifters = rankTotals(
    activeGifts,
    "sender_id",
    (row) => Math.abs(row.gold_cost ?? 0),
    "Gold spent",
    profilesById,
  );
  const topEarners = rankTotals(
    giftEarningRows,
    "user_id",
    (row) => Math.abs(row.gold_delta),
    "Gold earned",
    profilesById,
  );
  const mostReported = rankTotals(
    activeReports,
    "target_user_id",
    () => 1,
    "reports",
    profilesById,
  );
  const conversationTotals = new Map<
    string,
    { participants: Set<string>; total: number }
  >();

  activeMessages.forEach((message) => {
    const entry =
      conversationTotals.get(message.match_id) ??
      { participants: new Set<string>(), total: 0 };
    entry.total += 1;
    entry.participants.add(message.sender_id);
    entry.participants.add(message.receiver_id);
    conversationTotals.set(message.match_id, entry);
  });

  const mostActiveConversations = [...conversationTotals.entries()]
    .map<ConversationRow>(([matchId, entry]) => ({
      matchId,
      participants: [...entry.participants]
        .slice(0, 2)
        .map((userId) => profilesById.get(userId) ?? null),
      total: entry.total,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);

  return (
    <AppShell
      currentUserId={admin.id}
      maxWidth="max-w-7xl"
      profileId={currentProfile.public_id ?? currentProfile.id}
      title="Admin Analytics"
    >
      <div className="mt-6 flex flex-col gap-4 rounded-2xl border border-neutral-800 bg-black/50 p-5 md:flex-row md:items-end md:justify-between">
        <div>
          <Link href="/admin" className="text-sm font-medium text-emerald-100">
            Back to admin
          </Link>
          <h2 className="mt-3 text-2xl font-black tracking-tight text-white">
            Platform intelligence
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-neutral-400">
            Growth, engagement, safety, and economy signals with lightweight
            trend analysis.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {rangeOptions.map((option) => (
            <Link
              key={option.key}
              href={option.href}
              className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                selectedRange === option.key
                  ? "border-emerald-300/40 bg-emerald-300/15 text-emerald-50"
                  : "border-neutral-700 text-neutral-300 hover:border-neutral-500"
              }`}
            >
              {option.label}
            </Link>
          ))}
        </div>
      </div>

      <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[userKpi, messageKpi, callKpi, reportKpi, giftKpi, goldKpi].map((kpi) => (
          <KpiCard key={kpi.label} {...kpi} />
        ))}
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <ChartCard
          change={userKpi.change}
          color="emerald"
          series={usersSeries}
          title="Daily New Users"
        />
        <ChartCard
          change={comparisonChange(sumSeries(activeUsersSeries), sumSeries(activeUsersThirtySeries.slice(0, chartDays)))}
          color="emerald"
          series={activeUsersSeries}
          title="Daily Active Users"
        />
        <ChartCard
          change={comparisonChange(sumSeries(retentionSeries), Math.max(1, sumSeries(usersSeries)))}
          color="emerald"
          series={retentionSeries}
          title="Retention Proxy"
        />
        <ChartCard
          change={messageKpi.change}
          color="blue"
          series={messagesSeries}
          title="Messages Sent"
          type="bar"
        />
        <ChartCard
          change={comparisonChange(sumSeries(matchesSeries), 0)}
          color="emerald"
          series={matchesSeries}
          title="Matches Created"
          type="bar"
        />
        <ChartCard
          change={callKpi.change}
          color="violet"
          series={callsSeries}
          title="Calls Started"
          type="bar"
        />
        <ChartCard
          change={comparisonChange(sumSeries(storiesSeries), 0)}
          color="blue"
          series={storiesSeries}
          title="Stories Posted"
        />
        <ChartCard
          change={comparisonChange(sumSeries(momentsSeries), 0)}
          color="blue"
          series={momentsSeries}
          title="Moments Posted"
        />
        <ChartCard
          change={reportKpi.change}
          color="rose"
          isRiskMetric
          series={reportsSeries}
          title="Reports Opened"
          type="bar"
        />
        <ChartCard
          change={null}
          color="orange"
          isRiskMetric
          series={reviewSeries}
          title="Users Under Review Trend"
        />
        <ChartCard
          change={null}
          color="orange"
          isRiskMetric
          series={shadowSeries}
          title="Shadow Restricted Trend"
        />
        <ChartCard
          change={giftKpi.change}
          color="amber"
          series={giftsSeries}
          title="Gifts Sent"
          type="bar"
        />
        <ChartCard
          change={goldKpi.change}
          color="amber"
          series={goldSeries}
          title="Gold Spent"
        />
        <ChartCard
          change={comparisonChange(sumSeries(usersThirtySeries.slice(-7)), sumSeries(usersThirtySeries.slice(-14, -7)))}
          color="emerald"
          series={usersThirtySeries}
          title="30-Day User Growth"
        />
        <ChartCard
          change={comparisonChange(sumSeries(messagesThirtySeries.slice(-7)), sumSeries(messagesThirtySeries.slice(-14, -7)))}
          color="blue"
          series={messagesThirtySeries}
          title="30-Day Message Activity"
          type="bar"
        />
        <ChartCard
          change={comparisonChange(sumSeries(giftsThirtySeries.slice(-7)), sumSeries(giftsThirtySeries.slice(-14, -7)))}
          color="amber"
          series={giftsThirtySeries}
          title="30-Day Gift Activity"
          type="bar"
        />
      </div>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-neutral-800 bg-black/50 p-5">
          <p className="text-sm text-neutral-400">Total users</p>
          <p className="mt-2 text-3xl font-black text-white">
            {formatNumber(totalUsersResult.count ?? 0)}
          </p>
        </div>
        <div className="rounded-2xl border border-neutral-800 bg-black/50 p-5">
          <p className="text-sm text-neutral-400">Users under review</p>
          <p className="mt-2 text-3xl font-black text-orange-100">
            {formatNumber(underReviewResult.count ?? 0)}
          </p>
        </div>
        <div className="rounded-2xl border border-neutral-800 bg-black/50 p-5">
          <p className="text-sm text-neutral-400">Shadow restricted users</p>
          <p className="mt-2 text-3xl font-black text-orange-100">
            {formatNumber(shadowRestrictedResult.count ?? 0)}
          </p>
        </div>
        <div className="rounded-2xl border border-neutral-800 bg-black/50 p-5">
          <p className="text-sm text-neutral-400">Blocked relationships</p>
          <p className="mt-2 text-3xl font-black text-rose-100">
            {formatNumber((blocksResult.count ?? 0) + (blockedUsersResult.count ?? 0))}
          </p>
        </div>
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <DataTable
          emptyLabel="No user activity in this range."
          rows={topActiveUsers}
          title="Top Active Users"
        />
        <DataTable
          emptyLabel="No gift spending in this range."
          rows={topGifters}
          title="Top Gifters"
        />
        <DataTable
          emptyLabel="No gift earnings in this range."
          rows={topEarners}
          title="Top Earners"
        />
        <DataTable
          emptyLabel="No reports in this range."
          rows={mostReported}
          title="Most Reported Users"
        />
        <ConversationsTable rows={mostActiveConversations} />
      </div>
    </AppShell>
  );
}
