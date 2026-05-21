import { redirect } from "next/navigation";
import { AppShell } from "@/app/_components/app-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function WalletPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/wallet");
  }

  const { data: currentProfile } = await supabase
    .from("profiles")
    .select("id, onboarding_completed")
    .eq("id", user.id)
    .maybeSingle();

  if (!currentProfile?.onboarding_completed) {
    redirect("/onboarding");
  }

  const [
    walletResult,
    packagesResult,
    walletTransactionsResult,
    incomingGiftsResult,
    outgoingGiftsResult,
    messageChargesResult,
    premiumResult,
  ] = await Promise.all([
    supabase.from("user_wallets").select("gold_balance").eq("user_id", user.id).maybeSingle(),
    supabase.from("gold_packages").select("name, gold_amount, price_usd").order("price_usd", { ascending: true }),
    supabase.from("wallet_transactions").select("transaction_type, gold_delta, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
    supabase.from("gift_transactions").select("gift_type, gold_cost, created_at").eq("receiver_id", user.id).order("created_at", { ascending: false }).limit(10),
    supabase.from("gift_transactions").select("gift_type, gold_cost, created_at").eq("sender_id", user.id).order("created_at", { ascending: false }).limit(10),
    supabase.from("message_charges").select("gold_cost, created_at").eq("sender_id", user.id).order("created_at", { ascending: false }).limit(10),
    supabase.from("premium_subscriptions").select("plan_name, status, price_usd, interval, expires_at").eq("user_id", user.id).maybeSingle(),
  ]);

  return (
    <AppShell currentUserId={user.id} profileId={currentProfile.id} title="Wallet">
      <div className="mt-8 grid gap-5">
        <section className="rounded-3xl border border-emerald-300/15 bg-emerald-300/10 p-6">
          <p className="text-sm uppercase tracking-[0.22em] text-emerald-100/70">Gold balance</p>
          <p className="mt-2 text-5xl font-black">{walletResult.data?.gold_balance ?? 0}</p>
          <p className="mt-3 text-sm text-neutral-400">Gold wallet coming soon. Demo balances are read-only placeholders.</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <button className="rounded-full bg-white px-5 py-2.5 text-sm font-medium text-black">Buy Gold</button>
            <button className="rounded-full border border-emerald-200/30 px-5 py-2.5 text-sm text-emerald-100">Upgrade to Premium</button>
          </div>
        </section>

        <section className="grid gap-3 rounded-3xl border border-neutral-800 bg-black/50 p-5">
          <h2 className="text-lg font-black">Gold packages</h2>
          {(packagesResult.data ?? []).map((pack) => (
            <div key={pack.name} className="rounded-2xl border border-neutral-800 bg-white/[0.03] p-4">
              <p className="font-black">{pack.name}</p>
              <p className="mt-1 text-sm text-neutral-400">{pack.gold_amount} gold · ${pack.price_usd}</p>
            </div>
          ))}
        </section>

        <section className="rounded-3xl border border-neutral-800 bg-black/50 p-5">
          <h2 className="text-lg font-black">Premium</h2>
          <p className="mt-2 text-sm text-neutral-400">
            {premiumResult.data ? `${premiumResult.data.plan_name} · ${premiumResult.data.status}` : "No active premium plan."}
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {["Cheaper messages", "Profile boost", "Advanced filters", "Read insights"].map((perk) => (
              <div key={perk} className="rounded-2xl border border-neutral-800 bg-white/[0.03] p-4 text-sm text-neutral-300">{perk}</div>
            ))}
          </div>
        </section>

        <History title="Wallet transactions" rows={(walletTransactionsResult.data ?? []).map((row) => `${row.transaction_type} · ${row.gold_delta} gold`)} />
        <History title="Incoming gifts" rows={(incomingGiftsResult.data ?? []).map((row) => `${row.gift_type} · +${row.gold_cost ?? 0} gold value`)} />
        <History title="Outgoing gifts" rows={(outgoingGiftsResult.data ?? []).map((row) => `${row.gift_type} · -${row.gold_cost ?? 0} gold`)} />
        <History title="Message charges" rows={(messageChargesResult.data ?? []).map((row) => `Message · -${row.gold_cost} gold`)} />
      </div>
    </AppShell>
  );
}

function History({ rows, title }: { rows: string[]; title: string }) {
  return (
    <section className="rounded-3xl border border-neutral-800 bg-black/50 p-5">
      <h2 className="text-lg font-black">{title}</h2>
      <div className="mt-4 grid gap-2">
        {rows.length ? rows.map((row, index) => (
          <div key={`${row}-${index}`} className="rounded-2xl border border-neutral-800 bg-white/[0.03] p-4 text-sm text-neutral-300">{row}</div>
        )) : <p className="text-sm text-neutral-500">No activity yet.</p>}
      </div>
    </section>
  );
}
