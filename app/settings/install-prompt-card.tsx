"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function isIosDevice() {
  if (typeof navigator === "undefined") {
    return false;
  }

  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandalone() {
  if (typeof window === "undefined") {
    return false;
  }

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator && Boolean(navigator.standalone))
  );
}

export function InstallPromptCard({ compact = false }: { compact?: boolean }) {
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    const setupTimer = window.setTimeout(() => {
      setInstalled(isStandalone());
      setIos(isIosDevice());
    }, 0);

    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    }

    function handleInstalled() {
      setInstalled(true);
      setInstallPrompt(null);
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);

    return () => {
      window.clearTimeout(setupTimer);
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  async function installApp() {
    if (!installPrompt) {
      return;
    }

    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;

    if (choice.outcome === "accepted") {
      setInstalled(true);
    }

    setInstallPrompt(null);
  }

  return (
    <div
      className={
        compact
          ? "rounded-2xl border border-neutral-800 bg-white/[0.03] p-4"
          : "rounded-2xl border border-emerald-300/15 bg-emerald-300/10 p-4"
      }
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-black text-white">Install Matchr</p>
          <p className="mt-1 text-sm text-neutral-400">
            Add Matchr to your home screen for a faster app-style experience.
          </p>
        </div>
        {installed ? (
          <span className="w-fit rounded-full border border-emerald-300/30 bg-emerald-300/10 px-3 py-1 text-xs font-medium text-emerald-100">
            Installed
          </span>
        ) : null}
      </div>

      {!installed ? (
        <div className="mt-4">
          {installPrompt ? (
            <button
              type="button"
              onClick={() => void installApp()}
              className="rounded-full bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-neutral-200"
            >
              Install Matchr
            </button>
          ) : ios ? (
            <p className="rounded-xl border border-neutral-800/70 bg-black/25 px-3 py-2 text-xs leading-5 text-neutral-400">
              On iPhone, open Share, then choose Add to Home Screen.
            </p>
          ) : (
            <p className="rounded-xl border border-neutral-800/70 bg-black/25 px-3 py-2 text-xs leading-5 text-neutral-400">
              If your browser supports installation, an install prompt will appear here.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
