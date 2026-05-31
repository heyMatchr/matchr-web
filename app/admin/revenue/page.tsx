import { redirect } from "next/navigation";
import { AppShell } from "@/app/_components/app-shell";
import { requireAdmin } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { RevenueDashboardClient } from "./revenue-dashboard-client";

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

  const [
    walletsResult,
    walletTransactionsResult,
    giftsResult,
    messageChargesResult,
    premiumResult,
    paymentOrdersResult,
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
      .from("payment_orders")
      .select("user_id, provider, order_type, status, amount, amount_usd, currency, gold_amount, created_at, paid_at")
      .order("created_at", { ascending: false })
      .limit(50000),
  ]);

  const firstError = [
    walletsResult,
    walletTransactionsResult,
    giftsResult,
    messageChargesResult,
    premiumResult,
    paymentOrdersResult,
  ].find((result) => result.error)?.error;

  if (firstError) {
    throw new Error(firstError.message);
  }

  const profileIds = [
    ...new Set([
      ...(giftsResult.data ?? []).flatMap((row) => [row.sender_id, row.receiver_id]),
      ...(walletTransactionsResult.data ?? []).map((row) => row.user_id),
      ...(messageChargesResult.data ?? []).map((row) => row.sender_id),
      ...(paymentOrdersResult.data ?? []).map((row) => row.user_id),
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

  return (
    <AppShell
      currentUserId={admin.id}
      maxWidth="max-w-7xl"
      profileId={currentProfile.public_id ?? currentProfile.id}
      title="Admin Revenue"
    >
      <RevenueDashboardClient
        gifts={giftsResult.data ?? []}
        messageCharges={messageChargesResult.data ?? []}
        paymentOrders={paymentOrdersResult.data ?? []}
        premiumSubscriptions={premiumResult.data ?? []}
        profiles={profiles ?? []}
        walletTransactions={walletTransactionsResult.data ?? []}
        wallets={walletsResult.data ?? []}
      />
    </AppShell>
  );
}
