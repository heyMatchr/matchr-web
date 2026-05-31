import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/app/_components/app-shell";
import { requireAdmin } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { AdminUserAvatar, StatCard, adminUserHref } from "../admin-shared";

type ProfileSummary = {
  avatar_url: string | null;
  display_name: string;
  id: string;
  public_id: string | null;
};

type RankedUser = {
  profile: ProfileSummary | null;
  total: number;
  userId: string;
};

function countValue(result: { count: number | null }) {
  return result.count ?? 0;
}

function sumGold(
  rows: Array<{ gold_delta?: number | null; gold_cost?: number | null }>,
  field: "gold_delta" | "gold_cost",
) {
  return rows.reduce((total, row) => total + Math.abs(Number(row[field] ?? 0)), 0);
}

function rankByUser<T extends Record<string, unknown>>(
  rows: T[],
  userKey: keyof T,
  valueKey: keyof T,
  profilesById: Map<string, ProfileSummary>,
) {
  const totals = new Map<string, number>();

  rows.forEach((row) => {
    const userId = String(row[userKey] ?? "");
    if (!userId) {
      return;
    }

    totals.set(userId, (totals.get(userId) ?? 0) + Math.abs(Number(row[valueKey] ?? 0)));
  });

  return [...totals.entries()]
    .map<RankedUser>(([userId, total]) => ({
      profile: profilesById.get(userId) ?? null,
      total,
      userId,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 6);
}

function MetricGroup({
  items,
  title,
}: {
  items: Array<{ label: string; value: number }>;
  title: string;
}) {
  return (
    <section className="rounded-2xl border border-neutral-800 bg-black/50 p-5">
      <h2 className="text-xl font-black text-white">{title}</h2>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <StatCard key={item.label} label={item.label} value={item.value} />
        ))}
      </div>
    </section>
  );
}

function RankedUsersTable({
  emptyLabel,
  label,
  rows,
}: {
  emptyLabel: string;
  label: string;
  rows: RankedUser[];
}) {
  return (
    <section className="rounded-2xl border border-neutral-800 bg-black/50 p-5">
      <h2 className="text-xl font-black text-white">{label}</h2>
      <div className="mt-5 space-y-3">
        {rows.length ? (
          rows.map((row) => {
            const profile = row.profile;

            return (
              <Link
                key={row.userId}
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
                <p className="shrink-0 rounded-full border border-emerald-300/25 bg-emerald-300/10 px-3 py-1 text-sm font-black text-emerald-100">
                  {row.total.toLocaleString()} Gold
                </p>
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

export default async function AdminAnalyticsPage() {
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
  const todayStartDate = new Date(now);
  todayStartDate.setHours(0, 0, 0, 0);
  const sevenDaysAgoDate = new Date(now);
  sevenDaysAgoDate.setDate(sevenDaysAgoDate.getDate() - 7);

  const todayStart = todayStartDate.toISOString();
  const sevenDaysAgo = sevenDaysAgoDate.toISOString();

  const [
    totalUsersResult,
    newUsersTodayResult,
    newUsersWeekResult,
    activeUsersTodayResult,
    activeUsersWeekResult,
    messagesTodayResult,
    messagesWeekResult,
    matchesTodayResult,
    matchesWeekResult,
    callsTodayResult,
    callsWeekResult,
    storiesTodayResult,
    storiesWeekResult,
    momentsTodayResult,
    momentsWeekResult,
    reportsTodayResult,
    reportsWeekResult,
    legacyReportsTodayResult,
    legacyReportsWeekResult,
    underReviewResult,
    shadowRestrictedResult,
    blocksResult,
    blockedUsersResult,
    giftsTodayResult,
    giftsWeekResult,
    spentTodayResult,
    spentWeekResult,
    topGiftRowsResult,
    topEarnerRowsResult,
  ] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .gte("created_at", todayStart),
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .gte("created_at", sevenDaysAgo),
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .gte("last_seen_at", todayStart),
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .gte("last_seen_at", sevenDaysAgo),
    supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .gte("created_at", todayStart),
    supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .gte("created_at", sevenDaysAgo),
    supabase
      .from("matches")
      .select("id", { count: "exact", head: true })
      .gte("created_at", todayStart),
    supabase
      .from("matches")
      .select("id", { count: "exact", head: true })
      .gte("created_at", sevenDaysAgo),
    supabase
      .from("call_sessions")
      .select("id", { count: "exact", head: true })
      .not("started_at", "is", null)
      .gte("started_at", todayStart),
    supabase
      .from("call_sessions")
      .select("id", { count: "exact", head: true })
      .not("started_at", "is", null)
      .gte("started_at", sevenDaysAgo),
    supabase
      .from("stories")
      .select("id", { count: "exact", head: true })
      .gte("created_at", todayStart),
    supabase
      .from("stories")
      .select("id", { count: "exact", head: true })
      .gte("created_at", sevenDaysAgo),
    supabase
      .from("moments")
      .select("id", { count: "exact", head: true })
      .gte("created_at", todayStart),
    supabase
      .from("moments")
      .select("id", { count: "exact", head: true })
      .gte("created_at", sevenDaysAgo),
    supabase
      .from("reports")
      .select("id", { count: "exact", head: true })
      .eq("status", "open")
      .gte("created_at", todayStart),
    supabase
      .from("reports")
      .select("id", { count: "exact", head: true })
      .eq("status", "open")
      .gte("created_at", sevenDaysAgo),
    supabase
      .from("user_reports")
      .select("id", { count: "exact", head: true })
      .eq("status", "open")
      .gte("created_at", todayStart),
    supabase
      .from("user_reports")
      .select("id", { count: "exact", head: true })
      .eq("status", "open")
      .gte("created_at", sevenDaysAgo),
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
      .select("id", { count: "exact", head: true })
      .gte("created_at", todayStart),
    supabase
      .from("gift_transactions")
      .select("id", { count: "exact", head: true })
      .gte("created_at", sevenDaysAgo),
    supabase
      .from("wallet_transactions")
      .select("gold_delta")
      .lt("gold_delta", 0)
      .gte("created_at", todayStart)
      .limit(1000),
    supabase
      .from("wallet_transactions")
      .select("gold_delta")
      .lt("gold_delta", 0)
      .gte("created_at", sevenDaysAgo)
      .limit(5000),
    supabase
      .from("gift_transactions")
      .select("sender_id, gold_cost")
      .gte("created_at", sevenDaysAgo)
      .limit(1000),
    supabase
      .from("wallet_transactions")
      .select("user_id, gold_delta")
      .eq("transaction_type", "gift_received")
      .gte("created_at", sevenDaysAgo)
      .limit(1000),
  ]);

  const firstError = [
    totalUsersResult,
    newUsersTodayResult,
    newUsersWeekResult,
    activeUsersTodayResult,
    activeUsersWeekResult,
    messagesTodayResult,
    messagesWeekResult,
    matchesTodayResult,
    matchesWeekResult,
    callsTodayResult,
    callsWeekResult,
    storiesTodayResult,
    storiesWeekResult,
    momentsTodayResult,
    momentsWeekResult,
    reportsTodayResult,
    reportsWeekResult,
    legacyReportsTodayResult,
    legacyReportsWeekResult,
    underReviewResult,
    shadowRestrictedResult,
    blocksResult,
    blockedUsersResult,
    giftsTodayResult,
    giftsWeekResult,
    spentTodayResult,
    spentWeekResult,
    topGiftRowsResult,
    topEarnerRowsResult,
  ].find((result) => result.error)?.error;

  if (firstError) {
    throw new Error(firstError.message);
  }

  const topGiftRows = topGiftRowsResult.data ?? [];
  const topEarnerRows = topEarnerRowsResult.data ?? [];
  const profileIds = [
    ...new Set([
      ...topGiftRows.map((row) => row.sender_id),
      ...topEarnerRows.map((row) => row.user_id),
    ]),
  ].filter(Boolean);
  const { data: topProfiles, error: topProfilesError } = profileIds.length
    ? await supabase
        .from("profiles")
        .select("id, public_id, display_name, avatar_url")
        .in("id", profileIds)
    : { data: [], error: null };

  if (topProfilesError) {
    throw new Error(topProfilesError.message);
  }

  const profilesById = new Map(
    (topProfiles ?? []).map((profile) => [profile.id, profile as ProfileSummary]),
  );
  const topGifters = rankByUser(
    topGiftRows,
    "sender_id",
    "gold_cost",
    profilesById,
  );
  const topEarners = rankByUser(
    topEarnerRows,
    "user_id",
    "gold_delta",
    profilesById,
  );
  const goldSpentToday = sumGold(spentTodayResult.data ?? [], "gold_delta");
  const goldSpentWeek = sumGold(spentWeekResult.data ?? [], "gold_delta");

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
            Platform analytics
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-neutral-400">
            Growth, engagement, safety, and economy snapshots for the last day
            and week.
          </p>
        </div>
        <Link
          href="/admin/users"
          className="w-fit rounded-full border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 transition-colors hover:border-emerald-300/40 hover:bg-emerald-300/10"
        >
          User management
        </Link>
      </div>

      <div className="mt-6 space-y-6">
        <MetricGroup
          title="Users"
          items={[
            { label: "Total users", value: countValue(totalUsersResult) },
            { label: "New users today", value: countValue(newUsersTodayResult) },
            { label: "New users last 7 days", value: countValue(newUsersWeekResult) },
            { label: "Active users today", value: countValue(activeUsersTodayResult) },
            { label: "Active users last 7 days", value: countValue(activeUsersWeekResult) },
          ]}
        />

        <MetricGroup
          title="Engagement"
          items={[
            { label: "Messages today", value: countValue(messagesTodayResult) },
            { label: "Messages last 7 days", value: countValue(messagesWeekResult) },
            { label: "Matches today", value: countValue(matchesTodayResult) },
            { label: "Matches last 7 days", value: countValue(matchesWeekResult) },
            { label: "Calls started today", value: countValue(callsTodayResult) },
            { label: "Calls started last 7 days", value: countValue(callsWeekResult) },
            { label: "Stories today", value: countValue(storiesTodayResult) },
            { label: "Stories last 7 days", value: countValue(storiesWeekResult) },
            { label: "Moments today", value: countValue(momentsTodayResult) },
            { label: "Moments last 7 days", value: countValue(momentsWeekResult) },
          ]}
        />

        <MetricGroup
          title="Safety"
          items={[
            {
              label: "Open reports today",
              value: countValue(reportsTodayResult) + countValue(legacyReportsTodayResult),
            },
            {
              label: "Open reports last 7 days",
              value: countValue(reportsWeekResult) + countValue(legacyReportsWeekResult),
            },
            { label: "Users under review", value: countValue(underReviewResult) },
            { label: "Shadow restricted users", value: countValue(shadowRestrictedResult) },
            {
              label: "Blocked relationships",
              value: countValue(blocksResult) + countValue(blockedUsersResult),
            },
          ]}
        />

        <MetricGroup
          title="Economy"
          items={[
            { label: "Gifts sent today", value: countValue(giftsTodayResult) },
            { label: "Gifts sent last 7 days", value: countValue(giftsWeekResult) },
            { label: "Gold spent today", value: goldSpentToday },
            { label: "Gold spent last 7 days", value: goldSpentWeek },
          ]}
        />

        <div className="grid gap-6 lg:grid-cols-2">
          <RankedUsersTable
            emptyLabel="No gift spending in the last 7 days."
            label="Top Gifters"
            rows={topGifters}
          />
          <RankedUsersTable
            emptyLabel="No gift earnings in the last 7 days."
            label="Top Earners"
            rows={topEarners}
          />
        </div>
      </div>
    </AppShell>
  );
}
