import { redirect } from "next/navigation";
import { AppShell } from "@/app/_components/app-shell";
import { requireAdmin } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { AnalyticsDashboardClient } from "./analytics-dashboard-client";

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
      .order("created_at", { ascending: false })
      .limit(20000),
    supabase
      .from("messages")
      .select("id, match_id, sender_id, receiver_id, created_at")
      .order("created_at", { ascending: false })
      .limit(50000),
    supabase
      .from("matches")
      .select("id, user_one_id, user_two_id, created_at")
      .order("created_at", { ascending: false })
      .limit(50000),
    supabase
      .from("call_sessions")
      .select("id, caller_id, receiver_id, started_at, created_at")
      .order("created_at", { ascending: false })
      .limit(50000),
    supabase
      .from("stories")
      .select("id, user_id, created_at")
      .order("created_at", { ascending: false })
      .limit(50000),
    supabase
      .from("moments")
      .select("id, user_id, created_at")
      .order("created_at", { ascending: false })
      .limit(50000),
    supabase
      .from("reports")
      .select("id, reporter_id, target_user_id, reported_user_id, status, created_at")
      .order("created_at", { ascending: false })
      .limit(50000),
    supabase
      .from("user_reports")
      .select("id, reporter_id, reported_user_id, status, created_at")
      .order("created_at", { ascending: false })
      .limit(50000),
    supabase.from("blocks").select("id", { count: "exact", head: true }),
    supabase.from("blocked_users").select("id", { count: "exact", head: true }),
    supabase
      .from("gift_transactions")
      .select("id, sender_id, receiver_id, gold_cost, created_at")
      .order("created_at", { ascending: false })
      .limit(50000),
    supabase
      .from("wallet_transactions")
      .select("id, user_id, transaction_type, gold_delta, created_at")
      .order("created_at", { ascending: false })
      .limit(50000),
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
    blocksResult,
    blockedUsersResult,
    giftsResult,
    walletResult,
  ].find((result) => result.error)?.error;

  if (firstError) {
    throw new Error(firstError.message);
  }

  return (
    <AppShell
      currentUserId={admin.id}
      maxWidth="max-w-7xl"
      profileId={currentProfile.public_id ?? currentProfile.id}
      title="Admin Analytics"
    >
      <AnalyticsDashboardClient
        blocksCount={(blocksResult.count ?? 0) + (blockedUsersResult.count ?? 0)}
        calls={callsResult.data ?? []}
        gifts={giftsResult.data ?? []}
        matches={matchesResult.data ?? []}
        messages={messagesResult.data ?? []}
        moments={momentsResult.data ?? []}
        reports={[...(reportsResult.data ?? []), ...(legacyReportsResult.data ?? [])]}
        stories={storiesResult.data ?? []}
        totalUsers={totalUsersResult.count ?? 0}
        users={usersResult.data ?? []}
        walletTransactions={walletResult.data ?? []}
      />
    </AppShell>
  );
}
