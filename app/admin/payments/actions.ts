"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function getStringList(formData: FormData, key: string) {
  return getString(formData, key)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function getNumber(formData: FormData, key: string, fallback = 100) {
  const value = Number(getString(formData, key));
  return Number.isFinite(value) ? value : fallback;
}

function getBoolean(formData: FormData, key: string) {
  return getString(formData, key) === "true" || formData.get(key) === "on";
}

async function auditPaymentProviderAction(
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
    console.error("[AdminPayments] audit log write failed", {
      action,
      error: error.message,
    });
  }
}

export async function savePaymentProvider(formData: FormData) {
  const admin = await requireAdmin();
  const id = getString(formData, "id");
  const name = getString(formData, "name");
  const providerKey = getString(formData, "provider_key")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_");

  if (!name || !providerKey) {
    throw new Error("Payment provider needs a name and provider key.");
  }

  const payload = {
    active: getBoolean(formData, "active"),
    name,
    priority: Math.floor(getNumber(formData, "priority")),
    provider_key: providerKey,
    supported_countries: getStringList(formData, "supported_countries"),
    supported_currencies: getStringList(formData, "supported_currencies").map(
      (currency) => currency.toUpperCase(),
    ),
  };
  const supabase = createSupabaseAdminClient();
  const query = id
    ? supabase.from("payment_providers").update(payload).eq("id", id)
    : supabase.from("payment_providers").insert(payload);
  const { error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  await auditPaymentProviderAction(
    id ? "payment_provider_update" : "payment_provider_create",
    admin.id,
    { provider_key: providerKey },
  );
  revalidatePath("/admin/payments");
  revalidatePath("/wallet");
}
