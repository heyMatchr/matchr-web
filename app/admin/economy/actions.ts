"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function getNumber(formData: FormData, key: string, fallback = 0) {
  const value = Number(getString(formData, key));
  return Number.isFinite(value) ? value : fallback;
}

function getBoolean(formData: FormData, key: string) {
  return getString(formData, key) === "true" || formData.get(key) === "on";
}

function getNullableNumber(formData: FormData, key: string) {
  const value = getString(formData, key);

  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

type GiftRarity = "common" | "select" | "rare" | "icon" | "signature";

function getGiftRarity(formData: FormData): GiftRarity {
  const rarity = getString(formData, "rarity");

  if (
    rarity === "common" ||
    rarity === "select" ||
    rarity === "rare" ||
    rarity === "icon" ||
    rarity === "signature"
  ) {
    return rarity;
  }

  return "common";
}

function parseJson(value: string, fallback: Record<string, unknown> = {}) {
  if (!value) return fallback;

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : fallback;
  } catch {
    throw new Error("Enter valid JSON.");
  }
}

function parseJsonValue(value: string) {
  if (!value) return null;

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

async function auditEconomyAction(
  action: string,
  adminUserId: string,
  metadata: Record<string, unknown>,
) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("admin_audit_logs").insert({
    action,
    admin_user_id: adminUserId,
    metadata,
    target_user_id: null,
  });

  if (error) {
    console.error("[AdminEconomy] audit log write failed", {
      action,
      error: error.message,
    });
  }
}

function refreshEconomy() {
  revalidatePath("/admin/economy");
  revalidatePath("/admin/revenue");
  revalidatePath("/wallet");
}

export async function saveGoldPackage(formData: FormData) {
  const admin = await requireAdmin();
  const id = getString(formData, "id");
  const name = getString(formData, "name");
  const usdPrice = getNumber(formData, "usd_price");
  const goldAmount = Math.floor(getNumber(formData, "gold_amount"));

  if (!name || usdPrice <= 0 || goldAmount <= 0) {
    throw new Error("Gold package needs a name, price, and Gold amount.");
  }

  const payload = {
    active: getBoolean(formData, "active"),
    bonus_gold: Math.max(0, Math.floor(getNumber(formData, "bonus_gold"))),
    gold_amount: goldAmount,
    name,
    price_usd: usdPrice,
    sort_order: Math.floor(getNumber(formData, "sort_order")),
    usd_price: usdPrice,
    updated_at: new Date().toISOString(),
  };
  const supabase = createSupabaseAdminClient();
  const query = id
    ? supabase.from("gold_packages").update(payload).eq("id", id)
    : supabase.from("gold_packages").insert(payload);
  const { error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  await auditEconomyAction(id ? "economy_gold_package_update" : "economy_gold_package_create", admin.id, { id, name });
  refreshEconomy();
}

export async function saveGift(formData: FormData) {
  const admin = await requireAdmin();
  const rawId = getString(formData, "id");
  const id = rawId.toLowerCase().replace(/[^a-z0-9_]/g, "_");
  const name = getString(formData, "name");
  const goldCost = Math.floor(getNumber(formData, "gold_cost"));

  if (!id || !name || goldCost <= 0) {
    throw new Error("Gift needs an id, name, and Gold cost.");
  }

  const payload = {
    active: getBoolean(formData, "active"),
    animation_key: getString(formData, "animation_key") || null,
    category: getString(formData, "category") || "classic",
    creator_percentage: Math.max(0, Math.min(100, getNumber(formData, "creator_percentage", 50))),
    description: getString(formData, "description"),
    gold_cost: goldCost,
    icon_url: getString(formData, "icon_url") || null,
    id,
    limited_until: getString(formData, "limited_until") || null,
    name,
    rarity: getGiftRarity(formData),
    requires_elite_level: getNullableNumber(formData, "requires_elite_level"),
    signature: getBoolean(formData, "signature"),
    sort_order: Math.floor(getNumber(formData, "sort_order")),
    updated_at: new Date().toISOString(),
  };
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("gift_catalog").upsert(payload);

  if (error) {
    throw new Error(error.message);
  }

  await auditEconomyAction("economy_gift_save", admin.id, { id, name });
  refreshEconomy();
}

export async function savePremiumPlan(formData: FormData) {
  const admin = await requireAdmin();
  const id = getString(formData, "id");
  const name = getString(formData, "name");
  const durationDays = Math.floor(getNumber(formData, "duration_days"));
  const priceUsd = getNumber(formData, "price_usd");

  if (!name || durationDays <= 0 || priceUsd <= 0) {
    throw new Error("Premium plan needs a name, duration, and price.");
  }

  const interval = durationDays <= 7 ? "week" : durationDays <= 31 ? "month" : "year";
  const payload = {
    active: getBoolean(formData, "active"),
    description: getString(formData, "description"),
    duration_days: durationDays,
    interval,
    name,
    plan_name: name,
    price_usd: priceUsd,
    updated_at: new Date().toISOString(),
  };
  const supabase = createSupabaseAdminClient();
  const query = id
    ? supabase.from("premium_plans").update(payload).eq("id", id)
    : supabase.from("premium_plans").insert(payload);
  const { error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  await auditEconomyAction(id ? "economy_premium_update" : "economy_premium_create", admin.id, { id, name });
  refreshEconomy();
}

export async function saveEliteLevel(formData: FormData) {
  const admin = await requireAdmin();
  const level = Math.floor(getNumber(formData, "level"));
  const badge = getString(formData, "badge");

  if (level <= 0 || !badge) {
    throw new Error("Elite level needs a level and badge.");
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("elite_levels").upsert({
    badge,
    benefits_json: parseJson(getString(formData, "benefits_json")),
    level,
    monthly_gold_requirement: Math.max(
      0,
      Math.floor(getNumber(formData, "monthly_gold_requirement")),
    ),
    updated_at: new Date().toISOString(),
  });

  if (error) {
    throw new Error(error.message);
  }

  await auditEconomyAction("economy_elite_save", admin.id, { level });
  refreshEconomy();
}

export async function saveCreatorTier(formData: FormData) {
  const admin = await requireAdmin();
  const id = getString(formData, "id");
  const name = getString(formData, "name");

  if (!name) {
    throw new Error("Creator tier needs a name.");
  }

  const payload = {
    active: getBoolean(formData, "active"),
    creator_percentage: Math.max(0, Math.min(100, getNumber(formData, "creator_percentage", 50))),
    name,
    requirements_json: parseJson(getString(formData, "requirements_json")),
    sort_order: Math.floor(getNumber(formData, "sort_order")),
    updated_at: new Date().toISOString(),
  };
  const supabase = createSupabaseAdminClient();
  const query = id
    ? supabase.from("creator_tiers").update(payload).eq("id", id)
    : supabase.from("creator_tiers").insert(payload);
  const { error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  await auditEconomyAction(id ? "economy_creator_tier_update" : "economy_creator_tier_create", admin.id, { id, name });
  refreshEconomy();
}

export async function saveEconomyConfig(formData: FormData) {
  const admin = await requireAdmin();
  const key = getString(formData, "key");
  const value = parseJsonValue(getString(formData, "value"));

  if (!key || value === null) {
    throw new Error("Config needs a key and value.");
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("economy_config").upsert({
    description: getString(formData, "description"),
    key,
    value,
    value_json: value,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    throw new Error(error.message);
  }

  await auditEconomyAction("economy_config_save", admin.id, { key });
  refreshEconomy();
}
