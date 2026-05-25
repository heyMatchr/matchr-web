"use client";

import { useEffect, useState } from "react";
import { MATCHR_HAPTIC_EVENT, type MatchrHapticPattern } from "@/lib/haptics";

function isStandaloneDisplay() {
  if (typeof window === "undefined") {
    return false;
  }

  const navigatorWithStandalone = window.navigator as Navigator & {
    standalone?: boolean;
  };

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    navigatorWithStandalone.standalone === true
  );
}

function vibrate(pattern: MatchrHapticPattern) {
  if (!("vibrate" in navigator)) {
    return;
  }

  try {
    navigator.vibrate(pattern);
  } catch {
    // Haptics are best effort and intentionally silent when unsupported.
  }
}

export function PwaEnhancer() {
  const [showStartupSplash, setShowStartupSplash] = useState(true);

  useEffect(() => {
    const root = document.documentElement;

    function syncDisplayMode() {
      root.dataset.matchrStandalone = isStandaloneDisplay() ? "true" : "false";
    }

    function handleHaptic(event: Event) {
      const customEvent = event as CustomEvent<MatchrHapticPattern>;
      vibrate(customEvent.detail ?? 12);
    }

    syncDisplayMode();
    root.dataset.matchrReady = "false";

    const standaloneQuery = window.matchMedia("(display-mode: standalone)");
    standaloneQuery.addEventListener("change", syncDisplayMode);
    window.addEventListener("appinstalled", syncDisplayMode);
    window.addEventListener(MATCHR_HAPTIC_EVENT, handleHaptic);

    const readyTimer = window.setTimeout(() => {
      root.dataset.matchrReady = "true";
      setShowStartupSplash(false);
    }, 420);

    return () => {
      window.clearTimeout(readyTimer);
      standaloneQuery.removeEventListener("change", syncDisplayMode);
      window.removeEventListener("appinstalled", syncDisplayMode);
      window.removeEventListener(MATCHR_HAPTIC_EVENT, handleHaptic);
    };
  }, []);

  if (!showStartupSplash) {
    return null;
  }

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[9999] grid place-items-center bg-[#050907] text-white transition-opacity duration-300"
    >
      <div className="grid place-items-center gap-3">
        <div className="grid h-16 w-16 place-items-center rounded-3xl border border-emerald-300/20 bg-emerald-300/10 shadow-[0_0_60px_rgba(16,185,129,0.18)]">
          <span className="text-3xl font-black text-emerald-100">m</span>
        </div>
        <div className="h-1 w-24 overflow-hidden rounded-full bg-white/10">
          <div className="h-full w-1/2 animate-[matchr-splash_0.75s_ease-in-out_infinite] rounded-full bg-emerald-300" />
        </div>
      </div>
    </div>
  );
}
