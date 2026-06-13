import { redirect } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";
import { AppShell } from "@/app/_components/app-shell";
import { requireAdmin } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { savePaymentProvider } from "./actions";

function Field({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-medium text-neutral-300">
      {label}
      {children}
    </label>
  );
}

const inputClass =
  "rounded-2xl border border-neutral-800 bg-black px-4 py-3 text-sm text-white placeholder:text-neutral-600";

const PENDING_EXPIRY_MINUTES = 60;
const REFUND_PLACEHOLDER_STATUSES = [
  "refund_requested",
  "refunded",
  "disputed",
  "chargeback",
];

type PaymentOrderSummary = {
  amount: number | null;
  amount_usd: number | null;
  created_at: string;
  currency: string;
  gold_amount: number | null;
  id: string;
  metadata: Record<string, unknown>;
  order_type: string;
  paid_at: string | null;
  provider: string;
  provider_key: string;
  status: string;
  updated_at: string;
  user_id: string;
};

type ProfileSummary = {
  display_name: string;
  id: string;
  public_id: string | null;
};

type ReconciliationIssue = {
  detail: string;
  id: string;
  label: string;
  severity: "critical" | "warning";
};

function getPaystackMode() {
  const secret = process.env.PAYSTACK_SECRET_KEY ?? "";

  if (secret.startsWith("sk_live_")) {
    return "Live";
  }

  if (secret.startsWith("sk_test_")) {
    return "Test";
  }

  return "Unknown";
}

function getConfiguredSiteUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL;
  }

  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  return "";
}

function getPaystackReference(order: PaymentOrderSummary) {
  const metadata = order.metadata ?? {};
  const directReference = metadata.paystack_reference;

  if (typeof directReference === "string" && directReference.length > 0) {
    return directReference;
  }

  const paystackMetadata = metadata.paystack;

  if (
    paystackMetadata &&
    typeof paystackMetadata === "object" &&
    "paystack_reference" in paystackMetadata
  ) {
    const nestedReference = (paystackMetadata as Record<string, unknown>)
      .paystack_reference;

    return typeof nestedReference === "string" ? nestedReference : null;
  }

  return null;
}

function formatCurrencyValue(order: PaymentOrderSummary) {
  const amount = Number(order.amount ?? order.amount_usd ?? 0);

  return `${order.currency ?? "USD"} ${amount.toLocaleString(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}`;
}

function formatAge(value: string) {
  const elapsedMs = new Date().getTime() - new Date(value).getTime();
  const elapsedMinutes = Math.max(0, Math.floor(elapsedMs / 60000));

  if (elapsedMinutes < 60) {
    return `${elapsedMinutes}m`;
  }

  const hours = Math.floor(elapsedMinutes / 60);

  if (hours < 48) {
    return `${hours}h`;
  }

  return `${Math.floor(hours / 24)}d`;
}

function getProfileLabel(
  profilesById: Map<string, ProfileSummary>,
  userId: string,
) {
  const profile = profilesById.get(userId);

  return profile?.display_name || profile?.public_id || userId.slice(0, 8);
}

function ProviderForm({
  provider,
}: {
  provider?: {
    active: boolean;
    id: string;
    name: string;
    priority: number;
    provider_key: string;
    supported_countries: string[];
    supported_currencies: string[];
  };
}) {
  return (
    <form
      action={savePaymentProvider}
      className="rounded-2xl border border-neutral-800 bg-white/[0.03] p-4"
    >
      {provider ? <input name="id" type="hidden" value={provider.id} /> : null}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Field label="Name">
          <input className={inputClass} defaultValue={provider?.name} name="name" placeholder="Paystack" />
        </Field>
        <Field label="Provider key">
          <input
            className={inputClass}
            defaultValue={provider?.provider_key}
            name="provider_key"
            placeholder="paystack"
            readOnly={Boolean(provider)}
          />
        </Field>
        <Field label="Priority">
          <input className={inputClass} defaultValue={provider?.priority ?? 100} name="priority" type="number" />
        </Field>
        <label className="flex items-center gap-2 rounded-2xl border border-neutral-800 bg-white/[0.03] px-4 py-3 text-sm text-neutral-200">
          <input
            className="h-4 w-4 accent-emerald-300"
            defaultChecked={provider?.active ?? true}
            name="active"
            type="checkbox"
          />
          Active
        </label>
        <div className="md:col-span-2">
          <Field label="Supported countries, comma-separated">
            <input
              className={inputClass}
              defaultValue={(provider?.supported_countries ?? ["GLOBAL"]).join(", ")}
              name="supported_countries"
              placeholder="NG, Nigeria, GLOBAL"
            />
          </Field>
        </div>
        <div className="md:col-span-2">
          <Field label="Supported currencies, comma-separated">
            <input
              className={inputClass}
              defaultValue={(provider?.supported_currencies ?? ["USD"]).join(", ")}
              name="supported_currencies"
              placeholder="USD, NGN"
            />
          </Field>
        </div>
        <div className="flex items-end">
          <button
            type="submit"
            className="rounded-full bg-white px-5 py-3 text-sm font-black text-black"
          >
            {provider ? "Update provider" : "Create provider"}
          </button>
        </div>
      </div>
    </form>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-2xl border border-neutral-800 bg-black/50 p-5">
      <p className="text-sm font-medium text-neutral-400">{label}</p>
      <p className="mt-2 text-2xl font-black text-white">{value}</p>
    </article>
  );
}

function EnvChecklistItem({
  label,
  present,
  value,
}: {
  label: string;
  present: boolean;
  value?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-neutral-800 bg-black/45 px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-white">{label}</p>
        {value ? (
          <p className="mt-1 truncate text-xs text-neutral-500">{value}</p>
        ) : null}
      </div>
      <span
        className={
          present
            ? "rounded-full border border-emerald-300/30 bg-emerald-300/10 px-3 py-1 text-xs font-black text-emerald-100"
            : "rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-xs font-black text-amber-100"
        }
      >
        {present ? "Ready" : "Missing"}
      </span>
    </div>
  );
}

function PendingOrdersPanel({
  orders,
  profilesById,
}: {
  orders: PaymentOrderSummary[];
  profilesById: Map<string, ProfileSummary>;
}) {
  return (
    <section className="rounded-3xl border border-neutral-800 bg-black/50 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-white">Pending payments</h2>
          <p className="mt-1 text-sm text-neutral-400">
            Stale means older than {PENDING_EXPIRY_MINUTES} minutes. Valid callbacks can
            still complete while the order is pending.
          </p>
        </div>
        <span className="rounded-full border border-neutral-700 px-3 py-1 text-xs text-neutral-300">
          {orders.length}
        </span>
      </div>
      <div className="mt-4 grid gap-3">
        {orders.length ? (
          orders.slice(0, 12).map((order) => {
            const stale =
              new Date().getTime() - new Date(order.created_at).getTime() >
              PENDING_EXPIRY_MINUTES * 60 * 1000;
            const reference = getPaystackReference(order) ?? "No reference";

            return (
              <article
                key={order.id}
                className="rounded-2xl border border-neutral-800 bg-white/[0.03] p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-black text-white">
                      {formatCurrencyValue(order)}
                    </p>
                    <p className="mt-1 text-sm text-neutral-400">
                      {order.provider_key} · {order.order_type} ·{" "}
                      {getProfileLabel(profilesById, order.user_id)}
                    </p>
                    <p className="mt-2 truncate text-xs text-neutral-500">
                      {reference}
                    </p>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <span className="rounded-full border border-neutral-700 px-3 py-1 text-xs text-neutral-300">
                      {formatAge(order.created_at)}
                    </span>
                    <span
                      className={
                        stale
                          ? "rounded-full border border-amber-300/35 bg-amber-300/10 px-3 py-1 text-xs font-black text-amber-100"
                          : "rounded-full border border-emerald-300/25 bg-emerald-300/10 px-3 py-1 text-xs font-black text-emerald-100"
                      }
                    >
                      {stale ? "Stale" : "Pending"}
                    </span>
                  </div>
                </div>
              </article>
            );
          })
        ) : (
          <p className="rounded-2xl border border-neutral-800 bg-white/[0.03] p-4 text-sm text-neutral-400">
            No pending payments.
          </p>
        )}
      </div>
    </section>
  );
}

function ReconciliationPanel({
  issues,
}: {
  issues: ReconciliationIssue[];
}) {
  return (
    <section className="rounded-3xl border border-neutral-800 bg-black/50 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-white">Reconciliation checks</h2>
          <p className="mt-1 text-sm text-neutral-400">
            Launch blockers should stay at zero before real payment testing.
          </p>
        </div>
        <span className="rounded-full border border-neutral-700 px-3 py-1 text-xs text-neutral-300">
          {issues.length}
        </span>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {issues.length ? (
          issues.map((issue) => (
            <article
              key={issue.id}
              className={
                issue.severity === "critical"
                  ? "rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4"
                  : "rounded-2xl border border-neutral-800 bg-white/[0.03] p-4"
              }
            >
              <p className="text-sm font-black text-white">{issue.label}</p>
              <p className="mt-2 text-sm leading-6 text-neutral-300">{issue.detail}</p>
            </article>
          ))
        ) : (
          <p className="rounded-2xl border border-emerald-300/25 bg-emerald-300/10 p-4 text-sm text-emerald-50 md:col-span-2">
            No reconciliation issues found.
          </p>
        )}
      </div>
    </section>
  );
}

export default async function AdminPaymentsPage() {
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
    providersResult,
    ordersResult,
    walletPaymentReferencesResult,
    premiumSubscriptionsResult,
  ] = await Promise.all([
    supabase
      .from("payment_providers")
      .select("*")
      .order("priority", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("payment_orders")
      .select("id, user_id, provider_key, provider, order_type, status, amount, amount_usd, currency, gold_amount, metadata, created_at, updated_at, paid_at")
      .order("created_at", { ascending: false })
      .limit(5000),
    supabase
      .from("wallet_transactions")
      .select("reference_id")
      .eq("reference_type", "payment_order")
      .limit(50000),
    supabase
      .from("premium_subscriptions")
      .select("user_id, status, expires_at")
      .limit(50000),
  ]);

  const firstError = [
    providersResult,
    ordersResult,
    walletPaymentReferencesResult,
    premiumSubscriptionsResult,
  ].find((result) => result.error)?.error;

  if (firstError) {
    throw new Error(firstError.message);
  }

  const orders = (ordersResult.data ?? []) as PaymentOrderSummary[];
  const profileIds = [...new Set(orders.map((order) => order.user_id))];
  const { data: profiles, error: profilesError } = profileIds.length
    ? await supabase
        .from("profiles")
        .select("id, public_id, display_name")
        .in("id", profileIds)
    : { data: [], error: null };

  if (profilesError) {
    throw new Error(profilesError.message);
  }

  const profilesById = new Map(
    ((profiles ?? []) as ProfileSummary[]).map((profile) => [profile.id, profile]),
  );
  const activeCount = (providersResult.data ?? []).filter((provider) => provider.active).length;
  const paidOrders = orders.filter((order) => order.status === "paid");
  const pendingOrders = orders.filter((order) => order.status === "pending");
  const providerRevenue = new Map<string, number>();
  paidOrders.forEach((order) => {
    const key = order.provider_key ?? order.provider ?? "unknown";
    providerRevenue.set(
      key,
      (providerRevenue.get(key) ?? 0) + Number(order.amount ?? order.amount_usd ?? 0),
    );
  });
  const topProvider = [...providerRevenue.entries()].sort((a, b) => b[1] - a[1])[0];
  const paystackProvider = (providersResult.data ?? []).find(
    (provider) => provider.provider_key === "paystack",
  );
  const launchReadyProviders = (providersResult.data ?? []).filter(
    (provider) => provider.provider_key === "paystack" && provider.active,
  );
  const paystackMode = getPaystackMode();
  const siteUrl = getConfiguredSiteUrl();
  const webhookUrl = siteUrl ? `${siteUrl}/api/paystack/webhook` : "";
  const walletPaymentReferenceIds = new Set(
    (walletPaymentReferencesResult.data ?? [])
      .map((row) => row.reference_id)
      .filter(Boolean),
  );
  const activePremiumUserIds = new Set(
    (premiumSubscriptionsResult.data ?? [])
      .filter(
        (subscription) =>
          subscription.status === "active" &&
          (!subscription.expires_at ||
            new Date(subscription.expires_at).getTime() > new Date().getTime()),
      )
      .map((subscription) => subscription.user_id)
      .filter(Boolean),
  );
  const referenceCounts = new Map<string, number>();

  orders.forEach((order) => {
    const reference = getPaystackReference(order);

    if (reference) {
      referenceCounts.set(reference, (referenceCounts.get(reference) ?? 0) + 1);
    }
  });

  const reconciliationIssues: ReconciliationIssue[] = [
    ...paidOrders
      .filter(
        (order) =>
          order.order_type === "gold_purchase" &&
          !walletPaymentReferenceIds.has(order.id),
      )
      .map((order) => ({
        detail: `${formatCurrencyValue(order)} paid by ${getProfileLabel(profilesById, order.user_id)} has no wallet credit transaction.`,
        id: `missing-wallet-${order.id}`,
        label: "Paid Gold order missing wallet credit",
        severity: "critical" as const,
      })),
    ...paidOrders
      .filter(
        (order) =>
          order.order_type === "premium_subscription" &&
          !activePremiumUserIds.has(order.user_id),
      )
      .map((order) => ({
        detail: `${formatCurrencyValue(order)} paid by ${getProfileLabel(profilesById, order.user_id)} has no active Premium subscription for that user.`,
        id: `missing-premium-${order.id}`,
        label: "Paid Premium order missing activation",
        severity: "critical" as const,
      })),
    ...[...referenceCounts.entries()]
      .filter(([, count]) => count > 1)
      .map(([reference, count]) => ({
        detail: `${reference} appears on ${count} payment orders.`,
        id: `duplicate-reference-${reference}`,
        label: "Duplicate Paystack reference",
        severity: "critical" as const,
      })),
    ...pendingOrders
      .filter(
        (order) =>
          new Date().getTime() - new Date(order.created_at).getTime() >
          PENDING_EXPIRY_MINUTES * 60 * 1000,
      )
      .map((order) => ({
        detail: `${formatCurrencyValue(order)} ${order.provider_key} order is ${formatAge(order.created_at)} old.`,
        id: `stale-pending-${order.id}`,
        label: "Stale pending payment",
        severity: "warning" as const,
      })),
  ];

  return (
    <AppShell
      currentUserId={admin.id}
      maxWidth="max-w-7xl"
      profileId={currentProfile.public_id ?? currentProfile.id}
      title="Payment Providers"
    >
      <div className="mt-6 rounded-3xl border border-emerald-300/15 bg-emerald-300/10 p-5">
        <Link href="/admin" className="text-sm font-medium text-emerald-100">
          Back to admin
        </Link>
        <div className="mt-3 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-2xl font-black tracking-tight text-white">
              Paystack launch console
            </h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-emerald-50/80">
              Paystack is the only launch-ready checkout provider. Other
              providers can stay configured here for future rails, but public
              checkout is Paystack-only for real payment testing.
            </p>
          </div>
          <Link
            href="/admin/revenue"
            className="rounded-full border border-emerald-200/40 px-4 py-2 text-sm font-medium text-emerald-50"
          >
            Revenue dashboard
          </Link>
        </div>
      </div>

      <section className="mt-6 grid gap-4 md:grid-cols-3">
        <StatCard label="Active providers" value={String(activeCount)} />
        <StatCard label="Total providers" value={String(providersResult.data?.length ?? 0)} />
        <StatCard label="Top paid provider" value={topProvider?.[0] ?? "None"} />
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-3">
        <article className="rounded-3xl border border-[#C8A24A]/25 bg-[#C8A24A]/10 p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-[#E8C46A]">
            Paystack mode
          </p>
          <p className="mt-3 text-3xl font-black text-white">{paystackMode}</p>
          <p className="mt-2 text-sm leading-6 text-[#E8C46A]/80">
            {paystackProvider?.active
              ? "Paystack is active and launch-ready."
              : "Paystack is not active in provider settings."}
          </p>
        </article>
        <article className="rounded-3xl border border-neutral-800 bg-black/50 p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-neutral-500">
            Launch-ready providers
          </p>
          <p className="mt-3 text-3xl font-black text-white">
            {launchReadyProviders.length}
          </p>
          <p className="mt-2 text-sm leading-6 text-neutral-400">
            Public checkout only exposes Paystack during launch hardening.
          </p>
        </article>
        <article className="rounded-3xl border border-neutral-800 bg-black/50 p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-neutral-500">
            Webhook URL
          </p>
          <p className="mt-3 break-all text-sm font-black text-white">
            {webhookUrl || "Set NEXT_PUBLIC_SITE_URL"}
          </p>
          <p className="mt-2 text-sm leading-6 text-neutral-400">
            Configure this in Paystack before live testing.
          </p>
        </article>
      </section>

      <section className="mt-6 rounded-3xl border border-neutral-800 bg-black/50 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-white">Paystack env checklist</h2>
            <p className="mt-1 text-sm text-neutral-400">
              Secrets are never displayed.
            </p>
          </div>
          <span className="rounded-full border border-[#C8A24A]/30 bg-[#C8A24A]/10 px-3 py-1 text-xs font-black text-[#E8C46A]">
            Paystack only
          </span>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <EnvChecklistItem
            label="PAYSTACK_SECRET_KEY"
            present={Boolean(process.env.PAYSTACK_SECRET_KEY)}
            value={paystackMode}
          />
          <EnvChecklistItem
            label="PAYSTACK_PUBLIC_KEY"
            present={Boolean(process.env.PAYSTACK_PUBLIC_KEY)}
          />
          <EnvChecklistItem
            label="PAYSTACK_WEBHOOK_SECRET"
            present={Boolean(process.env.PAYSTACK_WEBHOOK_SECRET)}
          />
          <EnvChecklistItem
            label="NEXT_PUBLIC_SITE_URL"
            present={Boolean(process.env.NEXT_PUBLIC_SITE_URL)}
            value={process.env.NEXT_PUBLIC_SITE_URL ? "Configured" : "Required for stable referral and webhook URLs"}
          />
        </div>
      </section>

      <div className="mt-6 grid gap-4 xl:grid-cols-[1fr_1fr]">
        <PendingOrdersPanel orders={pendingOrders} profilesById={profilesById} />
        <ReconciliationPanel issues={reconciliationIssues} />
      </div>

      <section className="mt-6 rounded-3xl border border-neutral-800 bg-black/50 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-white">Refund and dispute readiness</h2>
            <p className="mt-1 text-sm leading-6 text-neutral-400">
              These are operational placeholders. Order status schema is unchanged
              until reversal and dispute workflows are implemented.
            </p>
          </div>
          <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-xs font-black text-amber-100">
            Manual process
          </span>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          {REFUND_PLACEHOLDER_STATUSES.map((status) => (
            <div
              key={status}
              className="rounded-2xl border border-neutral-800 bg-white/[0.03] p-4"
            >
              <p className="text-sm font-black text-white">
                {status.replaceAll("_", " ")}
              </p>
              <p className="mt-2 text-xs leading-5 text-neutral-500">
                Track manually in admin notes until SQL status support exists.
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6 space-y-4">
        <ProviderForm />
        {(providersResult.data ?? []).map((provider) => (
          <ProviderForm key={provider.id} provider={provider} />
        ))}
      </section>
    </AppShell>
  );
}
