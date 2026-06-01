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

  const [providersResult, ordersResult] = await Promise.all([
    supabase
      .from("payment_providers")
      .select("*")
      .order("priority", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("payment_orders")
      .select("provider_key, provider, status, amount, amount_usd, currency, created_at")
      .order("created_at", { ascending: false })
      .limit(5000),
  ]);

  if (providersResult.error) {
    throw new Error(providersResult.error.message);
  }

  if (ordersResult.error) {
    throw new Error(ordersResult.error.message);
  }

  const activeCount = (providersResult.data ?? []).filter((provider) => provider.active).length;
  const paidOrders = (ordersResult.data ?? []).filter((order) => order.status === "paid");
  const providerRevenue = new Map<string, number>();
  paidOrders.forEach((order) => {
    const key = order.provider_key ?? order.provider ?? "unknown";
    providerRevenue.set(
      key,
      (providerRevenue.get(key) ?? 0) + Number(order.amount ?? order.amount_usd ?? 0),
    );
  });
  const topProvider = [...providerRevenue.entries()].sort((a, b) => b[1] - a[1])[0];

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
              Multi-provider payments
            </h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-emerald-50/80">
              Configure which payment rails appear by country and currency. This
              is framework-only; no real checkout processing is active yet.
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

      <section className="mt-6 space-y-4">
        <ProviderForm />
        {(providersResult.data ?? []).map((provider) => (
          <ProviderForm key={provider.id} provider={provider} />
        ))}
      </section>
    </AppShell>
  );
}
