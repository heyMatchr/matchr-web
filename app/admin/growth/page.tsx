import { redirect } from "next/navigation";
import { AppShell } from "@/app/_components/app-shell";
import { requireAdmin } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type QueryResult<T> = {
  count?: number | null;
  data: T | null;
  error: { message?: string } | null;
};

type LooseQuery<T> = PromiseLike<QueryResult<T>> & {
  eq: (column: string, value: unknown) => LooseQuery<T>;
  gte: (column: string, value: unknown) => LooseQuery<T>;
  in: (column: string, values: unknown[]) => LooseQuery<T>;
  limit: (count: number) => LooseQuery<T>;
  order: (
    column: string,
    options?: { ascending?: boolean },
  ) => LooseQuery<T>;
  select: (
    columns: string,
    options?: { count?: "exact"; head?: boolean },
  ) => LooseQuery<T>;
};

type LooseClient = {
  from: <T>(table: string) => LooseQuery<T>;
};

type ReferralEvent = {
  created_at: string;
  event_type: string;
  inviter_user_id: string | null;
  referred_user_id: string | null;
};

type ReferralReward = {
  created_at: string;
  gold_amount: number | null;
  inviter_user_id: string;
  status: string;
};

type ProfileRow = {
  avatar_url: string | null;
  display_name: string;
  id: string;
  public_id: string | null;
};

function formatDay(value: string) {
  return new Date(value).toLocaleDateString([], {
    day: "numeric",
    month: "short",
  });
}

function dayKey(value: string) {
  return new Date(value).toISOString().slice(0, 10);
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function groupCountByDay<T extends { created_at: string }>(
  rows: T[],
  filter?: (row: T) => boolean,
) {
  const counts = new Map<string, number>();

  rows.filter(filter ?? (() => true)).forEach((row) => {
    const key = dayKey(row.created_at);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });

  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(-14)
    .map(([date, value]) => ({ date, label: formatDay(date), value }));
}

function ChartPanel({
  emptyText = "Not enough growth data yet.",
  items,
  title,
}: {
  emptyText?: string;
  items: Array<{ label: string; value: number }>;
  title: string;
}) {
  const max = Math.max(1, ...items.map((item) => item.value));

  return (
    <section className="rounded-3xl border border-neutral-800 bg-black/50 p-5">
      <h2 className="text-lg font-black text-white">{title}</h2>
      {items.length ? (
        <div className="mt-5 grid h-56 grid-cols-[repeat(auto-fit,minmax(34px,1fr))] items-end gap-2 border-b border-l border-neutral-800 px-3 pb-3">
          {items.map((item) => (
            <div key={item.label} className="flex min-w-0 flex-col items-center gap-2">
              <div
                className="w-full rounded-t-xl bg-[#C8A24A]"
                style={{ height: `${Math.max(6, (item.value / max) * 170)}px` }}
                title={`${item.label}: ${item.value.toLocaleString()}`}
              />
              <span className="max-w-full truncate text-[10px] text-neutral-500">
                {item.label}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-5 rounded-2xl border border-neutral-800 bg-white/[0.03] p-4 text-sm text-neutral-400">
          {emptyText}
        </p>
      )}
    </section>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-white/[0.03] p-5">
      <p className="text-sm text-neutral-400">{label}</p>
      <p className="mt-3 text-3xl font-black text-white">{value}</p>
    </div>
  );
}

export default async function AdminGrowthPage() {
  const admin = await requireAdmin();
  const supabase = createSupabaseAdminClient();
  const growthSupabase = supabase as unknown as LooseClient;
  const { data: currentProfile } = await supabase
    .from("profiles")
    .select("id, public_id, onboarding_completed")
    .eq("id", admin.id)
    .maybeSingle();

  if (!currentProfile?.onboarding_completed) {
    redirect("/onboarding");
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const [
    referralEventsResult,
    referralRewardsResult,
    profileViewsResult,
    followsResult,
    messagesResult,
    giftsResult,
  ] = await Promise.all([
    growthSupabase
      .from<ReferralEvent[]>("referral_events")
      .select("inviter_user_id, referred_user_id, event_type, created_at")
      .gte("created_at", thirtyDaysAgo.toISOString())
      .order("created_at", { ascending: false })
      .limit(50000),
    growthSupabase
      .from<ReferralReward[]>("referral_rewards")
      .select("inviter_user_id, gold_amount, status, created_at")
      .gte("created_at", thirtyDaysAgo.toISOString())
      .order("created_at", { ascending: false })
      .limit(50000),
    supabase
      .from("profile_views")
      .select("id", { count: "exact", head: true })
      .gte("created_at", thirtyDaysAgo.toISOString()),
    supabase
      .from("follows")
      .select("id", { count: "exact", head: true })
      .gte("created_at", thirtyDaysAgo.toISOString()),
    supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .gte("created_at", thirtyDaysAgo.toISOString()),
    supabase
      .from("gift_transactions")
      .select("id", { count: "exact", head: true })
      .gte("created_at", thirtyDaysAgo.toISOString()),
  ]);
  const referralEvents = referralEventsResult.data ?? [];
  const referralRewards = referralRewardsResult.data ?? [];
  const inviteEvents = referralEvents.filter((event) => event.event_type === "invite_sent");
  const joinEvents = referralEvents.filter((event) => event.event_type === "join");
  const goldRewards = referralRewards.filter((reward) =>
    reward.status === "earned" || reward.status === "paid",
  );
  const topInviterStats = new Map<
    string,
    { gold: number; invites: number; joins: number }
  >();

  inviteEvents.forEach((event) => {
    if (!event.inviter_user_id) return;
    const current = topInviterStats.get(event.inviter_user_id) ?? {
      gold: 0,
      invites: 0,
      joins: 0,
    };
    topInviterStats.set(event.inviter_user_id, {
      ...current,
      invites: current.invites + 1,
    });
  });
  joinEvents.forEach((event) => {
    if (!event.inviter_user_id) return;
    const current = topInviterStats.get(event.inviter_user_id) ?? {
      gold: 0,
      invites: 0,
      joins: 0,
    };
    topInviterStats.set(event.inviter_user_id, {
      ...current,
      joins: current.joins + 1,
    });
  });
  goldRewards.forEach((reward) => {
    const current = topInviterStats.get(reward.inviter_user_id) ?? {
      gold: 0,
      invites: 0,
      joins: 0,
    };
    topInviterStats.set(reward.inviter_user_id, {
      ...current,
      gold: current.gold + Math.max(0, Number(reward.gold_amount ?? 0)),
    });
  });

  const topInviterIds = [...topInviterStats.entries()]
    .sort(([, left], [, right]) => right.joins - left.joins || right.gold - left.gold)
    .slice(0, 8)
    .map(([userId]) => userId);
  const { data: topInviterProfiles } = topInviterIds.length
    ? await supabase
        .from("profiles")
        .select("id, public_id, display_name, avatar_url")
        .in("id", topInviterIds)
    : { data: [] };
  const profileById = new Map(
    ((topInviterProfiles ?? []) as ProfileRow[]).map((profile) => [profile.id, profile]),
  );
  const topInviters = topInviterIds.map((userId) => ({
    profile: profileById.get(userId),
    stats: topInviterStats.get(userId) ?? { gold: 0, invites: 0, joins: 0 },
    userId,
  }));
  const funnelItems = [
    { label: "Views", value: profileViewsResult.count ?? 0 },
    { label: "Follows", value: followsResult.count ?? 0 },
    { label: "Messages", value: messagesResult.count ?? 0 },
    { label: "Gifts", value: giftsResult.count ?? 0 },
  ];
  const rewardGold = sum(goldRewards.map((reward) => Number(reward.gold_amount ?? 0)));

  return (
    <AppShell
      currentUserId={admin.id}
      maxWidth="max-w-7xl"
      profileId={currentProfile.public_id ?? currentProfile.id}
      title="Admin Growth"
    >
      <div className="mt-6 grid gap-5 md:mt-8">
        <section className="rounded-3xl border border-neutral-800 bg-black/50 p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-[#E8C46A]">
            Growth engine
          </p>
          <h1 className="mt-2 text-3xl font-black text-white">
            Referral and funnel analytics
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-400">
            Track invite momentum, joined users, referral reward records, and
            the discovery path from views to gifts.
          </p>
        </section>

        <section className="grid gap-3 sm:grid-cols-4">
          <StatCard label="Invites sent" value={inviteEvents.length.toLocaleString()} />
          <StatCard label="Successful joins" value={joinEvents.length.toLocaleString()} />
          <StatCard label="Gold rewards" value={rewardGold.toLocaleString()} />
          <StatCard label="Top inviters" value={topInviters.length.toLocaleString()} />
        </section>

        <section className="grid gap-5 lg:grid-cols-2">
          <ChartPanel
            items={groupCountByDay(inviteEvents).map((item) => ({
              label: item.label,
              value: item.value,
            }))}
            title="Invites sent"
          />
          <ChartPanel
            items={groupCountByDay(joinEvents).map((item) => ({
              label: item.label,
              value: item.value,
            }))}
            title="Successful joins"
          />
          <ChartPanel
            items={groupCountByDay(goldRewards).map((item) => ({
              label: item.label,
              value: sum(
                goldRewards
                  .filter((reward) => dayKey(reward.created_at) === item.date)
                  .map((reward) => Number(reward.gold_amount ?? 0)),
              ),
            }))}
            title="Gold rewards paid"
          />
          <ChartPanel items={funnelItems} title="Discovery funnel" />
        </section>

        <section className="rounded-3xl border border-neutral-800 bg-black/50 p-5">
          <h2 className="text-xl font-black text-white">Top inviters</h2>
          <div className="mt-4 grid gap-2">
            {topInviters.length ? (
              topInviters.map((inviter) => (
                <div
                  key={inviter.userId}
                  className="grid gap-2 rounded-2xl border border-neutral-800 bg-white/[0.03] p-4 text-sm text-neutral-300 sm:grid-cols-[1fr_auto_auto_auto]"
                >
                  <p className="font-black text-white">
                    {inviter.profile?.display_name ?? inviter.userId}
                  </p>
                  <p>{inviter.stats.invites.toLocaleString()} invites</p>
                  <p>{inviter.stats.joins.toLocaleString()} joins</p>
                  <p>{inviter.stats.gold.toLocaleString()} Gold</p>
                </div>
              ))
            ) : (
              <p className="rounded-2xl border border-neutral-800 bg-white/[0.03] p-4 text-sm text-neutral-400">
                Top inviters will appear after referral joins.
              </p>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
