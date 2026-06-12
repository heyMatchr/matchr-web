import { redirect } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";
import { AppShell } from "@/app/_components/app-shell";
import { requireAdmin } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  saveCreatorTier,
  saveEconomyConfig,
  saveEliteLevel,
  saveGift,
  saveGoldPackage,
  savePremiumPlan,
} from "./actions";

type EconomyTab = "gold" | "gifts" | "premium" | "elite" | "tiers" | "config";

type AdminEconomyPageProps = {
  searchParams?: Promise<{
    tab?: string;
  }>;
};

const tabs: Array<{ key: EconomyTab; label: string }> = [
  { key: "gold", label: "Gold Packages" },
  { key: "gifts", label: "Gifts" },
  { key: "premium", label: "Premium" },
  { key: "elite", label: "Elite" },
  { key: "tiers", label: "Creator Tiers" },
  { key: "config", label: "Config" },
];

function jsonValue(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}

function formatCurrency(value: number) {
  return `$${value.toLocaleString(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}`;
}

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
const textareaClass =
  "min-h-24 rounded-2xl border border-neutral-800 bg-black px-4 py-3 font-mono text-xs leading-5 text-white placeholder:text-neutral-600";

function SubmitButton({ children = "Save" }: { children?: React.ReactNode }) {
  return (
    <button
      type="submit"
      className="rounded-full bg-white px-5 py-3 text-sm font-black text-black transition-opacity hover:opacity-90"
    >
      {children}
    </button>
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

function ActiveCheckbox({ defaultChecked }: { defaultChecked: boolean }) {
  return (
    <label className="flex items-center gap-2 rounded-2xl border border-neutral-800 bg-white/[0.03] px-4 py-3 text-sm text-neutral-200">
      <input
        defaultChecked={defaultChecked}
        name="active"
        type="checkbox"
        className="h-4 w-4 accent-emerald-300"
      />
      Active
    </label>
  );
}

function GoldPackageForm({
  pack,
}: {
  pack?: {
    active: boolean;
    bonus_gold: number;
    gold_amount: number;
    id: string;
    name: string;
    sort_order: number;
    usd_price: number;
  };
}) {
  return (
    <form action={saveGoldPackage} className="rounded-2xl border border-neutral-800 bg-white/[0.03] p-4">
      {pack ? <input name="id" type="hidden" value={pack.id} /> : null}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Field label="Name">
          <input className={inputClass} defaultValue={pack?.name} name="name" placeholder="Starter Pack" />
        </Field>
        <Field label="USD price">
          <input className={inputClass} defaultValue={pack?.usd_price} min="0" name="usd_price" step="0.01" type="number" />
        </Field>
        <Field label="Gold amount">
          <input className={inputClass} defaultValue={pack?.gold_amount} min="1" name="gold_amount" type="number" />
        </Field>
        <Field label="Bonus Gold">
          <input className={inputClass} defaultValue={pack?.bonus_gold ?? 0} min="0" name="bonus_gold" type="number" />
        </Field>
        <Field label="Sort order">
          <input className={inputClass} defaultValue={pack?.sort_order ?? 0} name="sort_order" type="number" />
        </Field>
        <div className="flex items-end">
          <ActiveCheckbox defaultChecked={pack?.active ?? true} />
        </div>
        <div className="flex items-end">
          <SubmitButton>{pack ? "Update package" : "Create package"}</SubmitButton>
        </div>
      </div>
    </form>
  );
}

function GiftForm({
  gift,
}: {
  gift?: {
    active: boolean;
    animation_key: string | null;
    category: string;
    creator_percentage: number;
    description: string;
    gold_cost: number;
    icon_url: string | null;
    id: string;
    limited_until: string | null;
    name: string;
    rarity: "common" | "select" | "rare" | "icon" | "signature";
    requires_elite_level: number | null;
    signature: boolean;
    sort_order: number;
  };
}) {
  return (
    <form action={saveGift} className="rounded-2xl border border-neutral-800 bg-white/[0.03] p-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Field label="Gift id">
          <input className={inputClass} defaultValue={gift?.id} name="id" placeholder="rose" readOnly={Boolean(gift)} />
        </Field>
        <Field label="Name">
          <input className={inputClass} defaultValue={gift?.name} name="name" placeholder="Rose" />
        </Field>
        <Field label="Category">
          <input className={inputClass} defaultValue={gift?.category ?? "classic"} name="category" />
        </Field>
        <Field label="Rarity">
          <select className={inputClass} defaultValue={gift?.rarity ?? "common"} name="rarity">
            <option value="common">Common</option>
            <option value="select">Select</option>
            <option value="rare">Rare</option>
            <option value="icon">Icon</option>
            <option value="signature">Signature</option>
          </select>
        </Field>
        <Field label="Gold cost">
          <input className={inputClass} defaultValue={gift?.gold_cost} min="1" name="gold_cost" type="number" />
        </Field>
        <Field label="Creator %">
          <input className={inputClass} defaultValue={gift?.creator_percentage ?? 50} max="100" min="0" name="creator_percentage" step="0.01" type="number" />
        </Field>
        <Field label="Elite level">
          <input className={inputClass} defaultValue={gift?.requires_elite_level ?? ""} min="1" name="requires_elite_level" placeholder="Optional" type="number" />
        </Field>
        <Field label="Limited until">
          <input className={inputClass} defaultValue={gift?.limited_until ? gift.limited_until.slice(0, 16) : ""} name="limited_until" type="datetime-local" />
        </Field>
        <Field label="Animation key">
          <input className={inputClass} defaultValue={gift?.animation_key ?? ""} name="animation_key" />
        </Field>
        <Field label="Icon URL / emoji">
          <input className={inputClass} defaultValue={gift?.icon_url ?? ""} name="icon_url" />
        </Field>
        <Field label="Sort order">
          <input className={inputClass} defaultValue={gift?.sort_order ?? 0} name="sort_order" type="number" />
        </Field>
        <div className="md:col-span-2 xl:col-span-3">
          <Field label="Description">
            <input className={inputClass} defaultValue={gift?.description} name="description" />
          </Field>
        </div>
        <div className="flex items-end">
          <ActiveCheckbox defaultChecked={gift?.active ?? true} />
        </div>
        <label className="flex items-end gap-2 text-sm text-neutral-300">
          <input defaultChecked={gift?.signature ?? false} name="signature" type="checkbox" />
          Signature
        </label>
        <div className="flex items-end">
          <SubmitButton>{gift ? "Update gift" : "Add gift"}</SubmitButton>
        </div>
      </div>
    </form>
  );
}

function PremiumPlanForm({
  plan,
}: {
  plan?: {
    active: boolean;
    description: string;
    duration_days: number;
    id: string;
    name: string;
    price_usd: number;
  };
}) {
  return (
    <form action={savePremiumPlan} className="rounded-2xl border border-neutral-800 bg-white/[0.03] p-4">
      {plan ? <input name="id" type="hidden" value={plan.id} /> : null}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Field label="Name">
          <input className={inputClass} defaultValue={plan?.name} name="name" placeholder="Matchr Premium" />
        </Field>
        <Field label="Duration days">
          <input className={inputClass} defaultValue={plan?.duration_days ?? 7} min="1" name="duration_days" type="number" />
        </Field>
        <Field label="USD price">
          <input className={inputClass} defaultValue={plan?.price_usd} min="0" name="price_usd" step="0.01" type="number" />
        </Field>
        <div className="flex items-end">
          <ActiveCheckbox defaultChecked={plan?.active ?? true} />
        </div>
        <div className="md:col-span-2 xl:col-span-3">
          <Field label="Description">
            <input className={inputClass} defaultValue={plan?.description} name="description" />
          </Field>
        </div>
        <div className="flex items-end">
          <SubmitButton>{plan ? "Update plan" : "Create plan"}</SubmitButton>
        </div>
      </div>
    </form>
  );
}

function EliteLevelForm({
  level,
}: {
  level?: {
    badge: string;
    benefits_json: Record<string, unknown>;
    level: number;
    monthly_gold_requirement: number;
  };
}) {
  return (
    <form action={saveEliteLevel} className="rounded-2xl border border-neutral-800 bg-white/[0.03] p-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Field label="Level">
          <input className={inputClass} defaultValue={level?.level} min="1" name="level" readOnly={Boolean(level)} type="number" />
        </Field>
        <Field label="Monthly Gold requirement">
          <input className={inputClass} defaultValue={level?.monthly_gold_requirement ?? 0} min="0" name="monthly_gold_requirement" type="number" />
        </Field>
        <Field label="Badge">
          <input className={inputClass} defaultValue={level?.badge} name="badge" placeholder="Elite" />
        </Field>
        <div className="flex items-end">
          <SubmitButton>{level ? "Update level" : "Create level"}</SubmitButton>
        </div>
        <div className="md:col-span-2 xl:col-span-4">
          <Field label="Benefits JSON">
            <textarea className={textareaClass} defaultValue={jsonValue(level?.benefits_json)} name="benefits_json" />
          </Field>
        </div>
      </div>
    </form>
  );
}

function CreatorTierForm({
  tier,
}: {
  tier?: {
    active: boolean;
    creator_percentage: number;
    id: string;
    name: string;
    requirements_json: Record<string, unknown>;
    sort_order: number;
  };
}) {
  return (
    <form action={saveCreatorTier} className="rounded-2xl border border-neutral-800 bg-white/[0.03] p-4">
      {tier ? <input name="id" type="hidden" value={tier.id} /> : null}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Field label="Name">
          <input className={inputClass} defaultValue={tier?.name} name="name" placeholder="Verified" />
        </Field>
        <Field label="Creator %">
          <input className={inputClass} defaultValue={tier?.creator_percentage ?? 50} max="100" min="0" name="creator_percentage" step="0.01" type="number" />
        </Field>
        <Field label="Sort order">
          <input className={inputClass} defaultValue={tier?.sort_order ?? 0} name="sort_order" type="number" />
        </Field>
        <div className="flex items-end">
          <ActiveCheckbox defaultChecked={tier?.active ?? true} />
        </div>
        <div className="md:col-span-2 xl:col-span-3">
          <Field label="Requirements JSON">
            <textarea className={textareaClass} defaultValue={jsonValue(tier?.requirements_json)} name="requirements_json" />
          </Field>
        </div>
        <div className="flex items-end">
          <SubmitButton>{tier ? "Update tier" : "Create tier"}</SubmitButton>
        </div>
      </div>
    </form>
  );
}

function ConfigForm({
  config,
}: {
  config?: {
    description: string;
    key: string;
    value: unknown;
    value_json: unknown;
  };
}) {
  const value = config?.value ?? config?.value_json;

  return (
    <form action={saveEconomyConfig} className="rounded-2xl border border-neutral-800 bg-white/[0.03] p-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Field label="Key">
          <input className={inputClass} defaultValue={config?.key} name="key" placeholder="profile_boost_cost" readOnly={Boolean(config)} />
        </Field>
        <div className="md:col-span-2">
          <Field label="Description">
            <input className={inputClass} defaultValue={config?.description} name="description" />
          </Field>
        </div>
        <div className="flex items-end">
          <SubmitButton>{config ? "Update config" : "Create config"}</SubmitButton>
        </div>
        <div className="md:col-span-2 xl:col-span-4">
          <Field label="Value JSON">
            <textarea className={textareaClass} defaultValue={jsonValue(value)} name="value" />
          </Field>
        </div>
      </div>
    </form>
  );
}

export default async function AdminEconomyPage({ searchParams }: AdminEconomyPageProps) {
  const params = await searchParams;
  const selectedTab = tabs.some((tab) => tab.key === params?.tab)
    ? (params?.tab as EconomyTab)
    : "gold";
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
    goldPackagesResult,
    giftsResult,
    premiumPlansResult,
    eliteLevelsResult,
    creatorTiersResult,
    configResult,
    giftTransactionsResult,
    paymentOrdersResult,
  ] = await Promise.all([
    supabase.from("gold_packages").select("*").order("sort_order", { ascending: true }).order("usd_price", { ascending: true }),
    supabase.from("gift_catalog").select("*").order("sort_order", { ascending: true }).order("name", { ascending: true }),
    supabase.from("premium_plans").select("*").order("price_usd", { ascending: true }),
    supabase.from("elite_levels").select("*").order("level", { ascending: true }),
    supabase.from("creator_tiers").select("*").order("sort_order", { ascending: true }).order("name", { ascending: true }),
    supabase.from("economy_config").select("*").order("key", { ascending: true }),
    supabase.from("gift_transactions").select("gift_type, gold_cost, created_at").order("created_at", { ascending: false }).limit(5000),
    supabase.from("payment_orders").select("order_type, status, amount, amount_usd, gold_amount, metadata, created_at").order("created_at", { ascending: false }).limit(5000),
  ]);

  const firstError = [
    goldPackagesResult,
    giftsResult,
    premiumPlansResult,
    eliteLevelsResult,
    creatorTiersResult,
    configResult,
    giftTransactionsResult,
    paymentOrdersResult,
  ].find((result) => result.error)?.error;

  if (firstError) {
    throw new Error(firstError.message);
  }

  const topGifts = new Map<string, number>();
  for (const gift of giftTransactionsResult.data ?? []) {
    topGifts.set(gift.gift_type, (topGifts.get(gift.gift_type) ?? 0) + 1);
  }

  const packagePurchases = new Map<string, number>();
  const revenueSources = new Map<string, number>();
  for (const order of paymentOrdersResult.data ?? []) {
    if (order.status === "paid") {
      revenueSources.set(
        order.order_type,
        (revenueSources.get(order.order_type) ?? 0) + Number(order.amount ?? order.amount_usd ?? 0),
      );
    }
    const metadata = order.metadata as Record<string, unknown> | null;
    const packageName = typeof metadata?.package_name === "string" ? metadata.package_name : null;
    if (packageName) {
      packagePurchases.set(packageName, (packagePurchases.get(packageName) ?? 0) + 1);
    }
  }

  return (
    <AppShell
      currentUserId={admin.id}
      maxWidth="max-w-7xl"
      profileId={currentProfile.public_id ?? currentProfile.id}
      title="Economy Management"
    >
      <div className="mt-6 rounded-3xl border border-amber-300/20 bg-amber-300/10 p-5">
        <Link href="/admin" className="text-sm font-medium text-amber-100">
          Back to admin
        </Link>
        <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-2xl font-black tracking-tight text-white">
              Economy controls
            </h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-amber-50/80">
              Manage Gold, gifts, premium plans, creator tiers, and configurable
              pricing values without code changes.
            </p>
          </div>
          <Link
            href="/admin/revenue"
            className="rounded-full border border-amber-200/40 px-4 py-2 text-sm font-medium text-amber-50"
          >
            Revenue dashboard
          </Link>
        </div>
      </div>

      <section className="mt-6 grid gap-4 md:grid-cols-3">
        <StatCard label="Top gift" value={[...topGifts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "None"} />
        <StatCard label="Most purchased package" value={[...packagePurchases.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "None"} />
        <StatCard label="Highest revenue source" value={(() => {
          const top = [...revenueSources.entries()].sort((a, b) => b[1] - a[1])[0];
          return top ? `${top[0]} · ${formatCurrency(top[1])}` : "$0.00";
        })()} />
      </section>

      <nav className="mt-6 flex gap-2 overflow-x-auto rounded-2xl border border-neutral-800 bg-black/50 p-2">
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            href={`/admin/economy?tab=${tab.key}`}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              selectedTab === tab.key
                ? "bg-white text-black"
                : "text-neutral-300 hover:bg-white/[0.05]"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      <section className="mt-6 space-y-4">
        {selectedTab === "gold" ? (
          <>
            <GoldPackageForm />
            {(goldPackagesResult.data ?? []).map((pack) => (
              <GoldPackageForm key={pack.id} pack={pack} />
            ))}
          </>
        ) : null}

        {selectedTab === "gifts" ? (
          <>
            <GiftForm />
            {(giftsResult.data ?? []).map((gift) => (
              <GiftForm key={gift.id} gift={gift} />
            ))}
          </>
        ) : null}

        {selectedTab === "premium" ? (
          <>
            <PremiumPlanForm />
            {(premiumPlansResult.data ?? []).map((plan) => (
              <PremiumPlanForm key={plan.id} plan={plan} />
            ))}
          </>
        ) : null}

        {selectedTab === "elite" ? (
          <>
            <EliteLevelForm />
            {(eliteLevelsResult.data ?? []).map((level) => (
              <EliteLevelForm key={level.level} level={level} />
            ))}
          </>
        ) : null}

        {selectedTab === "tiers" ? (
          <>
            <CreatorTierForm />
            {(creatorTiersResult.data ?? []).map((tier) => (
              <CreatorTierForm key={tier.id} tier={tier} />
            ))}
          </>
        ) : null}

        {selectedTab === "config" ? (
          <>
            <ConfigForm />
            {(configResult.data ?? []).map((config) => (
              <ConfigForm key={config.key} config={config} />
            ))}
          </>
        ) : null}
      </section>
    </AppShell>
  );
}
