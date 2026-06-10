import { redirect } from "next/navigation";
import { AppShell } from "@/app/_components/app-shell";
import { getEconomyConfig } from "@/lib/economy";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requestWithdrawal } from "./actions";

function formatDiamonds(value: number) {
  return `${Math.round(value).toLocaleString()} Diamonds`;
}

function formatCurrency(value: number) {
  return `$${value.toLocaleString(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString([], {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
  });
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-3xl border border-neutral-800 bg-black/50 p-5">
      <p className="text-sm font-medium text-neutral-400">{label}</p>
      <p className="mt-3 text-3xl font-black tracking-tight text-white">{value}</p>
    </article>
  );
}

export default async function EarningsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/earnings");
  }

  const { data: currentProfile } = await supabase
    .from("profiles")
    .select("id, public_id, onboarding_completed")
    .eq("id", user.id)
    .maybeSingle();

  if (!currentProfile?.onboarding_completed) {
    redirect("/onboarding");
  }

  const [
    walletResult,
    withdrawalsResult,
    giftEarningsResult,
    diamondConversionRate,
    minimumWithdrawal,
    creatorTierResult,
  ] = await Promise.all([
    supabase
      .from("creator_wallets")
      .select("diamonds_balance, diamonds_lifetime, diamonds_pending, diamonds_withdrawn")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("withdrawal_requests")
      .select("id, diamonds_amount, cash_estimate, status, payout_method, created_at, processed_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("gift_transactions")
      .select("gift_type, gold_cost, created_at")
      .eq("receiver_id", user.id)
      .order("created_at", { ascending: false })
      .limit(12),
    getEconomyConfig<number>(supabase, "diamond_conversion_rate"),
    getEconomyConfig<number>(supabase, "minimum_withdrawal"),
    supabase
      .from("creator_tiers")
      .select("name, creator_percentage")
      .eq("active", true)
      .order("sort_order", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  const wallet = walletResult.data ?? {
    diamonds_balance: 0,
    diamonds_lifetime: 0,
    diamonds_pending: 0,
    diamonds_withdrawn: 0,
  };
  const diamondsPerUsd = Math.max(1, Number(diamondConversionRate ?? 100));
  const cashEstimate = wallet.diamonds_balance / diamondsPerUsd;

  return (
    <AppShell
      currentUserId={user.id}
      profileId={currentProfile.public_id ?? currentProfile.id}
      title="Creator Earnings"
    >
      <div className="mt-6 rounded-3xl border border-emerald-300/15 bg-emerald-300/10 p-5 text-sm leading-6 text-emerald-50">
        Gifts earn Diamonds.
      </div>

      <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Diamonds" value={formatDiamonds(wallet.diamonds_balance)} />
        <StatCard label="Est. cash" value={formatCurrency(cashEstimate)} />
        <StatCard label="Lifetime" value={formatDiamonds(wallet.diamonds_lifetime)} />
        <StatCard label="Pending" value={formatDiamonds(wallet.diamonds_pending)} />
        <StatCard label="Withdrawn" value={formatDiamonds(wallet.diamonds_withdrawn)} />
      </section>

      <section className="mt-6 rounded-3xl border border-neutral-800 bg-black/50 p-5">
        <h2 className="text-xl font-black">Withdraw</h2>
        <p className="mt-2 text-sm leading-6 text-neutral-400">
          Min: {formatDiamonds(minimumWithdrawal ?? 5000)} · {diamondsPerUsd} = $1
        </p>
        <p className="mt-2 text-sm leading-6 text-neutral-500">
          Tier: {creatorTierResult.data?.name ?? "Standard"} ·{" "}
          {creatorTierResult.data?.creator_percentage ?? 50}%
        </p>
        <form action={requestWithdrawal} className="mt-5 grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]">
          <input
            name="diamonds_amount"
            placeholder="Diamonds amount"
            type="number"
            className="rounded-2xl border border-neutral-800 bg-black px-4 py-3 text-sm text-white placeholder:text-neutral-500"
          />
          <select
            name="payout_method"
            className="rounded-2xl border border-neutral-800 bg-black px-4 py-3 text-sm text-white"
          >
            <option value="bank_transfer">Bank transfer</option>
            <option value="paystack">Paystack</option>
            <option value="stripe">Stripe</option>
            <option value="usdt">USDT</option>
          </select>
          <input
            name="payout_handle"
            placeholder="Payout details"
            className="rounded-2xl border border-neutral-800 bg-black px-4 py-3 text-sm text-white placeholder:text-neutral-500"
          />
          <button
            type="submit"
            className="rounded-full bg-white px-5 py-3 text-sm font-black text-black"
          >
            Request
          </button>
        </form>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-3xl border border-neutral-800 bg-black/50 p-5">
          <h2 className="text-xl font-black">Gift earnings</h2>
          <div className="mt-5 space-y-3">
            {giftEarningsResult.data?.length ? (
              giftEarningsResult.data.map((gift, index) => (
                <div
                  key={`${gift.gift_type}-${gift.created_at}-${index}`}
                  className="rounded-2xl border border-neutral-800 bg-white/[0.03] p-4 text-sm"
                >
                  <p className="font-black text-white">{gift.gift_type}</p>
                  <p className="mt-1 text-neutral-400">
                    {gift.gold_cost ?? 0} Gold · {formatDate(gift.created_at)}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-neutral-400">No gifts yet</p>
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-neutral-800 bg-black/50 p-5">
          <h2 className="text-xl font-black">Withdrawals</h2>
          <div className="mt-5 space-y-3">
            {withdrawalsResult.data?.length ? (
              withdrawalsResult.data.map((request) => (
                <div
                  key={request.id}
                  className="rounded-2xl border border-neutral-800 bg-white/[0.03] p-4 text-sm"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-black text-white">
                      {formatDiamonds(request.diamonds_amount)}
                    </p>
                    <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1 text-xs text-amber-100">
                      {request.status}
                    </span>
                  </div>
                  <p className="mt-1 text-neutral-400">
                    {formatCurrency(request.cash_estimate)} · {request.payout_method} ·{" "}
                    {formatDate(request.created_at)}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-neutral-400">No withdrawals yet</p>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
