import { redirect } from "next/navigation";
import { AppShell } from "@/app/_components/app-shell";
import { isAdmin } from "@/lib/admin-auth";
import { getEconomyNumberConfig } from "@/lib/economy";
import { getAvailablePaymentProviders } from "@/lib/payment-providers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { startGoldCheckout, startPremiumCheckout } from "./actions";
import { WalletProviderDebug } from "./wallet-provider-debug";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type WalletPageProps = {
  searchParams?: Promise<{
    payment?: string | string[];
    provider_debug?: string | string[];
  }>;
};

function getSearchValue(
  params: Awaited<NonNullable<WalletPageProps["searchParams"]>> | undefined,
  key: "payment" | "provider_debug",
) {
  const value = params?.[key];

  return Array.isArray(value) ? value[0] : value;
}

export default async function WalletPage({ searchParams }: WalletPageProps) {
  const params = await searchParams;
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

  const isWalletDebugVisible =
    getSearchValue(params, "provider_debug") === "1" ||
    process.env.NODE_ENV !== "production" ||
    (await isAdmin(user.id).catch((error) => {
      console.error("[Wallet] admin debug lookup failed", {
        error: error instanceof Error ? error.message : String(error),
        userId: user.id,
      });

      return false;
    }));

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
    rawProvidersResult,
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
    supabase
      .from("payment_providers")
      .select("*")
      .eq("active", true)
      .order("priority", { ascending: true })
      .order("name", { ascending: true }),
    getAvailablePaymentProviders(supabase, currentProfile.country, "USD"),
  ]);
  const defaultProvider = availableProviders[0]?.provider_key ?? "";
  const paymentState = getSearchValue(params, "payment") ?? "";
  const rawProviderKeys =
    rawProvidersResult.data?.map((provider) => provider.provider_key) ?? [];
  const helperProviderKeys = availableProviders.map(
    (provider) => provider.provider_key,
  );
  const fallbackProvidersUsed = false;

  console.info("[Wallet] raw payment providers", {
    count: rawProvidersResult.data?.length ?? 0,
    error: rawProvidersResult.error?.message ?? null,
    keys: rawProviderKeys,
  });
  console.info("[Wallet] providers passed into Wallet UI", {
    count: availableProviders.length,
    detectedCountry: currentProfile.country ?? null,
    detectedCurrency: "USD",
    fallbackProvidersUsed,
    keys: helperProviderKeys,
  });
  console.info("[Wallet] provider debug visibility", {
    isWalletDebugVisible,
    providerDebugParam: getSearchValue(params, "provider_debug") ?? null,
  });

  return (
    <AppShell currentUserId={user.id} profileId={currentProfile.public_id ?? currentProfile.id} title="Wallet">
      <div className="mt-8 grid gap-5">
        <div className="w-fit rounded-full border border-amber-300/40 bg-amber-300/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-amber-100">
          WALLET BUILD: provider-debug-v2
        </div>
        {isWalletDebugVisible ? (
          <WalletProviderDebug
            currency="USD"
            defaultProviderKey={defaultProvider}
            fallbackProvidersUsed={fallbackProvidersUsed}
            helperProviderKeys={helperProviderKeys}
            rawProviderCount={rawProvidersResult.data?.length ?? 0}
            rawProviderKeys={rawProviderKeys}
            userCountry={currentProfile.country}
          />
        ) : null}
        <section className="rounded-3xl border border-emerald-300/15 bg-emerald-300/10 p-6 sm:p-7">
          <p className="text-sm uppercase tracking-[0.22em] text-emerald-100/70">Gold balance</p>
          <p className="mt-2 text-5xl font-black">{walletResult.data?.gold_balance ?? 0}</p>
          <p className="mt-3 text-[15px] leading-6 text-neutral-300">Messages · Gifts · Premium</p>
          {paymentState === "processing" ? (
            <p className="mt-3 rounded-2xl border border-emerald-300/20 bg-black/25 px-4 py-3 text-sm leading-6 text-emerald-50">
              Payment processing. Gold appears after Paystack approves it.
            </p>
          ) : null}
          {["failed", "missing-reference"].includes(paymentState) ? (
            <p className="mt-3 rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm leading-6 text-amber-50">
              Payment failed. Try again or choose another method.
            </p>
          ) : null}
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ["✉", "Start", "Get noticed"],
              ["◆", "Gift", "Send signal"],
              ["↟", "Boost", "Stand out"],
              ["♛", "Premium", "More access"],
            ].map(([icon, label, sublabel]) => (
              <div
                key={label}
                className="rounded-2xl border border-emerald-300/15 bg-black/25 px-3 py-3"
              >
                <p className="text-lg leading-none text-emerald-100">{icon}</p>
                <p className="mt-2 text-sm font-black text-white">{label}</p>
                <p className="mt-0.5 text-xs text-emerald-50/65">{sublabel}</p>
              </div>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <a href="#gold-packages" className="rounded-full bg-white px-5 py-2.5 text-sm font-medium text-black">Buy Gold</a>
            <form action={startPremiumCheckout}>
              <input type="hidden" name="provider_key" value={defaultProvider} />
              <button className="rounded-full border border-emerald-200/30 px-5 py-2.5 text-sm text-emerald-100">Upgrade to Premium</button>
            </form>
          </div>
        </section>

        <section id="gold-packages" className="grid gap-3.5 rounded-3xl border border-neutral-800 bg-black/50 p-5 sm:p-6">
          <div>
            <h2 className="text-lg font-black">Gold packages</h2>
            <p className="mt-1 text-sm text-neutral-400">Choose a package, then pick a payment method.</p>
          </div>
          {(packagesResult.data ?? []).map((pack, index) => (
            <details
              key={`${pack.id}-${pack.name}-${pack.gold_amount}-${pack.price_usd}-${index}`}
              className="group rounded-2xl border border-neutral-800 bg-white/[0.03] p-4 transition-colors open:border-emerald-300/30 sm:p-5"
            >
              <summary className="flex cursor-pointer list-none flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <span>
                  <span className="block font-black">{pack.name}</span>
                  <span className="mt-1.5 block text-[15px] leading-6 text-neutral-300">
                    {pack.gold_amount + (pack.bonus_gold ?? 0)} Gold
                    {pack.bonus_gold ? ` · ${pack.bonus_gold} bonus` : ""} · $
                    {pack.usd_price ?? pack.price_usd}
                  </span>
                </span>
                <span className="w-fit rounded-full bg-white px-5 py-2.5 text-sm font-medium text-black">
                  Select Package
                </span>
              </summary>
              <form action={startGoldCheckout} className="mt-4 rounded-2xl border border-emerald-300/15 bg-emerald-300/10 p-3">
                <input type="hidden" name="package_id" value={pack.id} />
                <p className="text-sm font-black text-emerald-50">
                  Payment Method
                  {isWalletDebugVisible ? (
                    <span className="ml-2 font-mono text-xs text-amber-100">
                      ({availableProviders.length} providers)
                    </span>
                  ) : null}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {availableProviders.length ? (
                    availableProviders.map((provider, providerIndex) => (
                      <label
                        data-provider-index={providerIndex}
                        data-provider-key={provider.provider_key}
                        key={`${pack.id}-${provider.provider_key}`}
                        className="rounded-full border border-neutral-700 bg-black/30 px-3 py-1.5 text-xs text-neutral-300"
                      >
                        <input
                          className="mr-1 accent-emerald-300"
                          defaultChecked={providerIndex === 0}
                          name="provider_key"
                          type="radio"
                          value={provider.provider_key}
                        />
                        {provider.name}
                        {isWalletDebugVisible ? (
                          <span className="ml-2 font-mono text-[10px] text-amber-100">
                            #{providerIndex} key={provider.provider_key} name=
                            {provider.name}
                          </span>
                        ) : null}
                      </label>
                    ))
                  ) : (
                    <span className="text-sm text-neutral-400">No payment methods available.</span>
                  )}
                </div>
                <button disabled={!availableProviders.length} className="mt-4 rounded-full bg-white px-5 py-2.5 text-sm font-medium text-black disabled:cursor-not-allowed disabled:opacity-50">
                  Continue to Payment
                </button>
              </form>
            </details>
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
                : "Premium unavailable"}
            </button>
          </form>
          <div className="mt-4 flex flex-wrap gap-2">
            {["Priority", "Insights", "Discounts", "Badge"].map((benefit) => (
              <span
                key={benefit}
                className="rounded-full border border-emerald-300/15 bg-emerald-300/10 px-3 py-1.5 text-sm text-emerald-50"
              >
                {benefit}
              </span>
            ))}
          </div>
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
                Premium plans are not available right now.
              </div>
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-neutral-800 bg-black/50 p-5 sm:p-6">
          <h2 className="text-lg font-black">Payment methods</h2>
          <p className="mt-2 text-[15px] leading-6 text-neutral-300">
            Available here: {currentProfile.country ?? "your region"}.
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {availableProviders.length ? (
              availableProviders.map((provider, providerIndex) => (
                <div
                  data-provider-index={providerIndex}
                  data-provider-key={provider.provider_key}
                  key={provider.provider_key}
                  className="rounded-2xl border border-neutral-800 bg-white/[0.03] p-4 text-[15px] leading-6 text-neutral-200"
                >
                  <p className="font-black text-white">{provider.name}</p>
                  {isWalletDebugVisible ? (
                    <p className="mt-1 font-mono text-[11px] leading-5 text-amber-100">
                      #{providerIndex} key={provider.provider_key} name=
                      {provider.name}
                    </p>
                  ) : null}
                  <p className="mt-1 text-sm text-neutral-500">
                    {provider.supported_currencies.join(", ")}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-neutral-400">
                No payment methods are available right now.
              </p>
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-neutral-800 bg-black/50 p-5 sm:p-6">
          <h2 className="text-lg font-black">Elite levels</h2>
          <p className="mt-2 text-[15px] leading-6 text-neutral-300">
            Priority: {priorityMessageCost} Gold · Boost: {profileBoostCost} Gold
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
                  {Object.keys(level.benefits_json ?? {}).join(", ") || "Soon"}
                </p>
              </div>
            ))}
          </div>
        </section>

        <History actionHref="#gold-packages" actionLabel="Buy Gold" emptyText="No purchases yet" title="Transactions" rows={(walletTransactionsResult.data ?? []).map(formatWalletTransaction)} />
        <History title="Payments" rows={(paymentOrdersResult.data ?? []).map((row) => {
          const amount = row.amount ?? row.amount_usd ?? 0;
          const currency = row.currency ?? "USD";
          const gold = row.gold_amount ? ` · ${row.gold_amount} Gold` : "";
          return `${formatPaymentType(row.order_type)} · ${formatPaymentStatus(row.status)} · ${currency} ${amount}${gold}${row.provider ? ` · ${row.provider}` : ""}`;
        })} />
        <History title="Gifts in" rows={(incomingGiftsResult.data ?? []).map((row) => `${row.gift_type} · +${row.gold_cost ?? 0}`)} />
        <History title="Gifts out" rows={(outgoingGiftsResult.data ?? []).map((row) => `${row.gift_type} · -${row.gold_cost ?? 0}`)} />
        <History title="Messages" rows={(messageChargesResult.data ?? []).map((row) => `Message · -${row.gold_cost}`)} />
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

function formatPaymentStatus(status: string | null) {
  const labels: Record<string, string> = {
    cancelled: "Cancelled",
    failed: "Failed",
    paid: "Paid",
    pending: "Processing",
  };

  return labels[status ?? ""] ?? "Processing";
}

function formatPaymentType(type: string | null) {
  const labels: Record<string, string> = {
    gift_purchase: "Gift purchase",
    gold_purchase: "Gold purchase",
    premium_subscription: "Premium",
  };

  return labels[type ?? ""] ?? "Purchase";
}

function History({
  actionHref,
  actionLabel,
  emptyText = "No activity yet.",
  rows,
  title,
}: {
  actionHref?: string;
  actionLabel?: string;
  emptyText?: string;
  rows: string[];
  title: string;
}) {
  return (
    <section className="rounded-3xl border border-neutral-800 bg-black/50 p-5 sm:p-6">
      <h2 className="text-lg font-black">{title}</h2>
      <div className="mt-4 grid gap-2.5">
        {rows.length ? rows.map((row, index) => (
          <div key={`${row}-${index}`} className="rounded-2xl border border-neutral-800 bg-white/[0.03] p-4 text-[15px] leading-6 text-neutral-200">{row}</div>
        )) : (
          <div className="rounded-2xl border border-neutral-800 bg-white/[0.03] p-4">
            <p className="text-sm leading-6 text-neutral-400">{emptyText}</p>
            {actionHref && actionLabel ? (
              <a
                href={actionHref}
                className="mt-3 inline-flex rounded-full bg-white px-4 py-2 text-sm font-medium text-black"
              >
                {actionLabel}
              </a>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
