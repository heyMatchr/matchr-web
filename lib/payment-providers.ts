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

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export function isProviderAvailable(
  providers: PaymentProviderRow[],
  providerKey: string,
) {
  return providers.some((provider) => provider.provider_key === providerKey);
}
