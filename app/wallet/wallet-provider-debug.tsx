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
    <section className="fixed left-1/2 top-[calc(env(safe-area-inset-top)+0.75rem)] z-[9999] max-h-[45dvh] w-[min(42rem,calc(100vw-1.5rem))] -translate-x-1/2 overflow-y-auto rounded-3xl border-2 border-amber-300 bg-black/95 p-4 text-xs leading-5 text-amber-50 shadow-[0_20px_80px_rgba(245,158,11,0.28)] backdrop-blur-xl sm:p-5">
      <p className="text-base font-black tracking-[0.14em] text-white">
        WALLET PROVIDER DEBUG
      </p>
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
