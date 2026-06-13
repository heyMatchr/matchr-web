import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, PaymentProviderRow } from "@/lib/supabase/types";

type Supabase = SupabaseClient<Database>;

const PUBLIC_CHECKOUT_PROVIDER_KEYS = new Set(["paystack"]);

export async function getAvailablePaymentProviders(
  supabase: Supabase,
  _userCountry?: string | null,
  _currency = "USD",
) {
  void _userCountry;
  void _currency;

  const { data, error } = await supabase
    .from("payment_providers")
    .select("*")
    .eq("active", true)
    .order("priority", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    console.error("[PaymentProviders] Supabase provider query error", {
      currency: _currency,
      error: error.message,
      userCountry: _userCountry ?? null,
    });
    throw new Error(error.message);
  }

  return (data ?? []).filter((provider) =>
    PUBLIC_CHECKOUT_PROVIDER_KEYS.has(provider.provider_key),
  );
}

export function isProviderAvailable(
  providers: PaymentProviderRow[],
  providerKey: string,
) {
  return providers.some((provider) => provider.provider_key === providerKey);
}
