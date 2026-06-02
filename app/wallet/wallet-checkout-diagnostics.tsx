"use client";

import { useEffect, useState } from "react";

type SubmitSnapshot = {
  packageId: string;
  providerKey: string;
  submitCount: number;
  submittedAt: string;
};

export function WalletCheckoutDiagnostics() {
  const [snapshot, setSnapshot] = useState<SubmitSnapshot | null>(null);

  useEffect(() => {
    function handleSubmit(event: SubmitEvent) {
      const form = event.target;

      if (!(form instanceof HTMLFormElement)) {
        return;
      }

      if (form.dataset.walletCheckoutForm !== "gold") {
        return;
      }

      const formData = new FormData(form);
      const nextSnapshot = {
        packageId: String(formData.get("package_id") ?? ""),
        providerKey: String(formData.get("provider_key") ?? ""),
        submitCount: (snapshot?.submitCount ?? 0) + 1,
        submittedAt: new Date().toLocaleTimeString(),
      };

      console.info("[WalletCheckoutDebug] form submit fired", nextSnapshot);
      setSnapshot(nextSnapshot);
    }

    document.addEventListener("submit", handleSubmit, true);

    return () => {
      document.removeEventListener("submit", handleSubmit, true);
    };
  }, [snapshot?.submitCount]);

  return (
    <section className="fixed bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] left-1/2 z-[9999] w-[min(38rem,calc(100vw-1.5rem))] -translate-x-1/2 rounded-2xl border-2 border-cyan-300 bg-black/95 p-3 font-mono text-[11px] leading-5 text-cyan-50 shadow-[0_20px_80px_rgba(34,211,238,0.22)]">
      <p className="text-xs font-black tracking-[0.12em] text-white">
        WALLET CHECKOUT DEBUG
      </p>
      <div className="mt-2 grid gap-0.5">
        <p>form submit fires: {snapshot ? "yes" : "not yet"}</p>
        <p>submit count: {snapshot?.submitCount ?? 0}</p>
        <p>submitted at: {snapshot?.submittedAt ?? "none"}</p>
        <p>package id: {snapshot?.packageId || "none"}</p>
        <p>provider key: {snapshot?.providerKey || "none"}</p>
      </div>
    </section>
  );
}
