"use client";

import { useEffect, useState } from "react";

type WalletProviderDebugProps = {
  currency: string;
  defaultProviderKey: string;
  fallbackProvidersUsed: boolean;
  helperProviderKeys: string[];
  rawProviderCount: number;
  rawProviderKeys: string[];
  userCountry: string | null;
};

export function WalletProviderDebug({
  currency,
  defaultProviderKey,
  fallbackProvidersUsed,
  helperProviderKeys,
  rawProviderCount,
  rawProviderKeys,
  userCountry,
}: WalletProviderDebugProps) {
  const [selectedPackageId, setSelectedPackageId] = useState("");
  const [selectedProviderKey, setSelectedProviderKey] =
    useState(defaultProviderKey);
  const [locale] = useState(() =>
    typeof navigator === "undefined" ? "server" : navigator.language || "unknown",
  );

  useEffect(() => {
    function syncSelection(event: Event) {
      const target = event.target;

      if (!(target instanceof HTMLElement)) {
        return;
      }

      const form = target.closest("form");
      const packageInput = form?.querySelector<HTMLInputElement>(
        'input[name="package_id"]',
      );
      const providerInput = form?.querySelector<HTMLInputElement>(
        'input[name="provider_key"]:checked',
      );

      if (packageInput?.value) {
        setSelectedPackageId(packageInput.value);
      }

      if (providerInput?.value) {
        setSelectedProviderKey(providerInput.value);
      }
    }

    document.addEventListener("change", syncSelection);
    document.addEventListener("click", syncSelection);

    return () => {
      document.removeEventListener("change", syncSelection);
      document.removeEventListener("click", syncSelection);
    };
  }, []);

  return (
    <section className="rounded-3xl border border-amber-300/30 bg-amber-300/10 p-4 text-xs leading-5 text-amber-50 sm:p-5">
      <p className="text-sm font-black text-white">Wallet provider debug</p>
      <div className="mt-3 grid gap-1">
        <p>raw provider count: {rawProviderCount}</p>
        <p>raw provider keys: {rawProviderKeys.join(", ") || "none"}</p>
        <p>
          helper provider keys: {helperProviderKeys.join(", ") || "none"}
        </p>
        <p>
          wallet UI provider keys: {helperProviderKeys.join(", ") || "none"}
        </p>
        <p>selected package id: {selectedPackageId || "none selected"}</p>
        <p>selected provider key: {selectedProviderKey || "none selected"}</p>
        <p>fallback providers used: {fallbackProvidersUsed ? "yes" : "no"}</p>
        <p>detected country: {userCountry || "none"}</p>
        <p>detected currency: {currency}</p>
        <p>detected user locale: {locale}</p>
      </div>
    </section>
  );
}
