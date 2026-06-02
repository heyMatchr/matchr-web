import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, PaymentProviderRow } from "@/lib/supabase/types";

type Supabase = SupabaseClient<Database>;

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

  console.info("[PaymentProviders] Supabase provider query result", {
    count: data?.length ?? 0,
    currency: _currency,
    keys: data?.map((provider) => provider.provider_key) ?? [],
    userCountry: _userCountry ?? null,
  });

  if (error) {
    console.error("[PaymentProviders] Supabase provider query error", {
      currency: _currency,
      error: error.message,
      userCountry: _userCountry ?? null,
    });
    throw new Error(error.message);
  }

  console.info("[PaymentProviders] providers returned from helper", {
    count: data?.length ?? 0,
    keys: data?.map((provider) => provider.provider_key) ?? [],
  });

  return data ?? [];
}

export function isProviderAvailable(
  providers: PaymentProviderRow[],
  providerKey: string,
) {
  return providers.some((provider) => provider.provider_key === providerKey);
}
