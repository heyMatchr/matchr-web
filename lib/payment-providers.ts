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

function providerSupportsCurrency(
  provider: PaymentProviderRow,
  currency: string,
) {
  return providerSupports(provider.supported_currencies, currency, [
    "global",
    "*",
  ]);
}

function providerSupportsCountry(
  provider: PaymentProviderRow,
  country: string,
) {
  return providerSupports(provider.supported_countries, country, [
    "global",
    "*",
  ]);
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

  const activeProviders = data ?? [];
  const currencyProviders = activeProviders.filter((provider) =>
    providerSupportsCurrency(provider, currency),
  );
  const country = normalize(userCountry);

  if (!country) {
    return currencyProviders;
  }

  const countryProviders = currencyProviders.filter((provider) =>
    providerSupportsCountry(provider, country),
  );

  return countryProviders.length ? countryProviders : currencyProviders;
}

export function isProviderAvailable(
  providers: PaymentProviderRow[],
  providerKey: string,
) {
  return providers.some((provider) => provider.provider_key === providerKey);
}
