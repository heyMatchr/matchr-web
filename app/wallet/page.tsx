import { redirect } from "next/navigation";
import { AppShell } from "@/app/_components/app-shell";
import { getEconomyNumberConfig } from "@/lib/economy";
import { getAvailablePaymentProviders } from "@/lib/payment-providers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { startGoldCheckout, startPremiumCheckout } from "./actions";

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
    .select("id, public_id, country, onboarding_completed")
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
    paymentOrdersResult,
    premiumPlansResult,
    eliteLevelsResult,
    priorityMessageCost,
    profileBoostCost,
    availableProviders,
  ] = await Promise.all([
    supabase.from("user_wallets").select("gold_balance").eq("user_id", user.id).maybeSingle(),
    supabase
      .from("gold_packages")
      .select("id, name, gold_amount, bonus_gold, usd_price, price_usd")
      .eq("active", true)
      .order("sort_order", { ascending: true })
      .order("usd_price", { ascending: true }),
    supabase.from("wallet_transactions").select("transaction_type, gold_delta, reference_type, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
    supabase.from("gift_transactions").select("gift_type, gold_cost, created_at").eq("receiver_id", user.id).order("created_at", { ascending: false }).limit(10),
    supabase.from("gift_transactions").select("gift_type, gold_cost, created_at").eq("sender_id", user.id).order("created_at", { ascending: false }).limit(10),
    supabase.from("message_charges").select("gold_cost, created_at").eq("sender_id", user.id).order("created_at", { ascending: false }).limit(10),
    supabase.from("premium_subscriptions").select("plan_name, status, price_usd, interval, expires_at").eq("user_id", user.id).maybeSingle(),
    supabase.from("payment_orders").select("provider, order_type, status, amount, amount_usd, currency, gold_amount, metadata, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10),
    supabase
      .from("premium_plans")
      .select("id, name, plan_name, duration_days, price_usd, description")
      .eq("active", true)
      .order("price_usd", { ascending: true }),
    supabase
      .from("elite_levels")
      .select("level, monthly_gold_requirement, badge, benefits_json")
      .order("level", { ascending: true }),
    getEconomyNumberConfig(supabase, "priority_message_cost", 15),
    getEconomyNumberConfig(supabase, "profile_boost_cost", 50),
    getAvailablePaymentProviders(supabase, currentProfile.country, "USD"),
  ]);
  const defaultProvider = availableProviders[0]?.provider_key ?? "";

  return (
    <AppShell currentUserId={user.id} profileId={currentProfile.public_id ?? currentProfile.id} title="Wallet">
      <div className="mt-8 grid gap-5">
        <section className="rounded-3xl border border-emerald-300/15 bg-emerald-300/10 p-6 sm:p-7">
          <p className="text-sm uppercase tracking-[0.22em] text-emerald-100/70">Gold balance</p>
          <p className="mt-2 text-5xl font-black">{walletResult.data?.gold_balance ?? 0}</p>
          <p className="mt-3 text-[15px] leading-6 text-neutral-300">Your Gold powers paid messages, gifts, and premium Matchr experiences.</p>
          <p className="mt-3 rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm leading-6 text-amber-50">
            Payment provider coming next. Purchases create pending orders now;
            Gold is credited only after a provider confirms payment.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <form action={startGoldCheckout}>
              <input type="hidden" name="package" value="500" />
              <input type="hidden" name="provider_key" value={defaultProvider} />
              <button className="rounded-full bg-white px-5 py-2.5 text-sm font-medium text-black">Buy Gold</button>
            </form>
            <form action={startPremiumCheckout}>
              <input type="hidden" name="provider_key" value={defaultProvider} />
              <button className="rounded-full border border-emerald-200/30 px-5 py-2.5 text-sm text-emerald-100">Upgrade to Premium</button>
            </form>
          </div>
        </section>

        <section className="grid gap-3.5 rounded-3xl border border-neutral-800 bg-black/50 p-5 sm:p-6">
          <h2 className="text-lg font-black">Gold packages</h2>
          {(packagesResult.data ?? []).map((pack, index) => (
            <form key={`${pack.id}-${pack.name}-${pack.gold_amount}-${pack.price_usd}-${index}`} action={startGoldCheckout}>
              <input type="hidden" name="package_id" value={pack.id} />
              <div className="w-full rounded-2xl border border-neutral-800 bg-white/[0.03] p-4 text-left transition-colors hover:border-emerald-300/30 sm:p-5">
                <p className="font-black">{pack.name}</p>
                <p className="mt-1.5 text-[15px] leading-6 text-neutral-300">
                  {pack.gold_amount + (pack.bonus_gold ?? 0)} gold
                  {pack.bonus_gold ? ` (${pack.bonus_gold} bonus)` : ""} · $
                  {pack.usd_price ?? pack.price_usd}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {availableProviders.map((provider, providerIndex) => (
                    <label
                      key={`${pack.id}-${provider.provider_key}`}
                      className="rounded-full border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300"
                    >
                      <input
                        className="mr-1 accent-emerald-300"
                        defaultChecked={providerIndex === 0}
                        name="provider_key"
                        type="radio"
                        value={provider.provider_key}
                      />
                      {provider.name}
                    </label>
                  ))}
                </div>
                <button className="mt-4 rounded-full bg-white px-5 py-2.5 text-sm font-medium text-black">
                  Create payment order
                </button>
              </div>
            </form>
          ))}
        </section>

        <section className="rounded-3xl border border-neutral-800 bg-black/50 p-5 sm:p-6">
          <h2 className="text-lg font-black">Premium</h2>
          <p className="mt-2 text-[15px] leading-6 text-neutral-300">
            {premiumResult.data ? `${premiumResult.data.plan_name} · ${premiumResult.data.status}` : "No active premium plan."}
          </p>
          <form action={startPremiumCheckout} className="mt-4">
            <input
              type="hidden"
              name="plan_id"
              value={premiumPlansResult.data?.[0]?.id ?? ""}
            />
            <input type="hidden" name="provider_key" value={defaultProvider} />
            <button className="rounded-full bg-white px-5 py-2.5 text-sm font-medium text-black">
              {premiumPlansResult.data?.[0]
                ? `Start ${premiumPlansResult.data[0].name ?? premiumPlansResult.data[0].plan_name} · $${premiumPlansResult.data[0].price_usd}`
                : "Premium provider coming next"}
            </button>
          </form>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {(premiumPlansResult.data ?? []).length ? (
              (premiumPlansResult.data ?? []).map((plan) => (
                <form key={plan.id} action={startPremiumCheckout}>
                  <input type="hidden" name="plan_id" value={plan.id} />
                  <input type="hidden" name="provider_key" value={defaultProvider} />
                  <button className="h-full w-full rounded-2xl border border-neutral-800 bg-white/[0.03] p-4 text-left text-[15px] leading-6 text-neutral-200 transition-colors hover:border-emerald-300/30">
                    <span className="block font-black text-white">
                      {plan.name ?? plan.plan_name}
                    </span>
                    <span className="mt-1 block text-neutral-300">
                      ${plan.price_usd} · {plan.duration_days} days
                    </span>
                    {plan.description ? (
                      <span className="mt-1 block text-sm text-neutral-500">
                        {plan.description}
                      </span>
                    ) : null}
                  </button>
                </form>
              ))
            ) : (
              <div className="rounded-2xl border border-neutral-800 bg-white/[0.03] p-4 text-[15px] leading-6 text-neutral-200">
                No active premium plans.
              </div>
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-neutral-800 bg-black/50 p-5 sm:p-6">
          <h2 className="text-lg font-black">Payment providers</h2>
          <p className="mt-2 text-[15px] leading-6 text-neutral-300">
            Available for {currentProfile.country ?? "your region"}.
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {availableProviders.length ? (
              availableProviders.map((provider) => (
                <div
                  key={provider.provider_key}
                  className="rounded-2xl border border-neutral-800 bg-white/[0.03] p-4 text-[15px] leading-6 text-neutral-200"
                >
                  <p className="font-black text-white">{provider.name}</p>
                  <p className="mt-1 text-sm text-neutral-500">
                    {provider.supported_currencies.join(", ")}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-neutral-400">
                No payment providers are currently available.
              </p>
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-neutral-800 bg-black/50 p-5 sm:p-6">
          <h2 className="text-lg font-black">Elite levels</h2>
          <p className="mt-2 text-[15px] leading-6 text-neutral-300">
            Priority messages are currently {priorityMessageCost} Gold. Profile
            boosts are currently {profileBoostCost} Gold.
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {(eliteLevelsResult.data ?? []).map((level) => (
              <div
                key={level.level}
                className="rounded-2xl border border-neutral-800 bg-white/[0.03] p-4 text-[15px] leading-6 text-neutral-200"
              >
                <p className="font-black text-white">
                  Level {level.level} · {level.badge}
                </p>
                <p className="mt-1 text-neutral-400">
                  {level.monthly_gold_requirement.toLocaleString()} Gold/month
                </p>
                <p className="mt-1 text-sm text-neutral-500">
                  {Object.keys(level.benefits_json ?? {}).join(", ") || "Benefits coming soon"}
                </p>
              </div>
            ))}
          </div>
        </section>

        <History title="Wallet transactions" rows={(walletTransactionsResult.data ?? []).map(formatWalletTransaction)} />
        <History title="Payment orders" rows={(paymentOrdersResult.data ?? []).map((row) => {
          const amount = row.amount ?? row.amount_usd ?? 0;
          const currency = row.currency ?? "USD";
          const gold = row.gold_amount ? ` · ${row.gold_amount} Gold` : "";
          return `${row.order_type} · ${row.status} · ${currency} ${amount}${gold} · ${row.provider}`;
        })} />
        <History title="Incoming gifts" rows={(incomingGiftsResult.data ?? []).map((row) => `${row.gift_type} · +${row.gold_cost ?? 0} gold value`)} />
        <History title="Outgoing gifts" rows={(outgoingGiftsResult.data ?? []).map((row) => `${row.gift_type} · -${row.gold_cost ?? 0} gold`)} />
        <History title="Message charges" rows={(messageChargesResult.data ?? []).map((row) => `Message · -${row.gold_cost} gold`)} />
      </div>
    </AppShell>
  );
}

function formatWalletTransaction(row: {
  created_at: string;
  gold_delta: number;
  reference_type: string | null;
  transaction_type: string;
}) {
  const labels: Record<string, string> = {
    adjustment:
      row.reference_type === "Starter Gold Bonus"
        ? "Starter Gold Bonus"
        : "Wallet adjustment",
    gift_received: "Gift received",
    gift_sent: "Gift sent",
    message_charge: "Message charge",
    top_up: "Gold top-up",
  };
  const sign = row.gold_delta > 0 ? "+" : "";

  return `${labels[row.transaction_type] ?? row.transaction_type} · ${sign}${row.gold_delta} Gold`;
}

function History({ rows, title }: { rows: string[]; title: string }) {
  return (
    <section className="rounded-3xl border border-neutral-800 bg-black/50 p-5 sm:p-6">
      <h2 className="text-lg font-black">{title}</h2>
      <div className="mt-4 grid gap-2.5">
        {rows.length ? rows.map((row, index) => (
          <div key={`${row}-${index}`} className="rounded-2xl border border-neutral-800 bg-white/[0.03] p-4 text-[15px] leading-6 text-neutral-200">{row}</div>
        )) : <p className="text-sm leading-6 text-neutral-400">No activity yet.</p>}
      </div>
    </section>
  );
}
