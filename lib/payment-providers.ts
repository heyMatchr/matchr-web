import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, PaymentProviderRow } from "@/lib/supabase/types";

type Supabase = SupabaseClient<Database>;

function normalize(value: string | null | undefined) {
  return `${value ?? ""}`.trim().toLowerCase();
}

function providerSupports(
  values: string[] | null | undefined,
  requested: string,
  globalTokens: string[],
) {
  const normalizedValues = (values ?? []).map(normalize);
  const normalizedRequested = normalize(requested);

  return (
    normalizedValues.length === 0 ||
    normalizedValues.some((value) => globalTokens.includes(value)) ||
    normalizedValues.includes(normalizedRequested)
  );
}

export async function getAvailablePaymentProviders(
  supabase: Supabase,
  userCountry?: string | null,
  currency = "USD",
) {
  const { data, error } = await supabase
    .from("payment_providers")
    .select("*")
    .eq("active", true)
    .order("priority", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const country = userCountry || "GLOBAL";
  const providers = (data ?? []).filter(
    (provider) =>
      providerSupports(provider.supported_countries, country, ["global", "*"]) &&
      providerSupports(provider.supported_currencies, currency, ["global", "*"]),
  );

  return providers.length ? providers : (data ?? []).filter((provider) =>
    providerSupports(provider.supported_countries, "GLOBAL", ["global", "*"]),
  );
}

export function isProviderAvailable(
  providers: PaymentProviderRow[],
  providerKey: string,
) {
  return providers.some((provider) => provider.provider_key === providerKey);
}
