"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getPushSupportState,
  subscribeToMatchrPush,
  unsubscribeFromMatchrPush,
  type PushSupportState,
} from "@/lib/push-notifications";
import type { Database } from "@/lib/supabase/types";

type PushNotificationSettingsProps = {
  anonKey: string;
  currentUserId: string;
  supabaseUrl: string;
};

export function PushNotificationSettings({
  anonKey,
  currentUserId,
  supabaseUrl,
}: PushNotificationSettingsProps) {
  const [support, setSupport] = useState<PushSupportState | null>(null);
  const [activeSubscriptionCount, setActiveSubscriptionCount] = useState<number | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState(
    "Get notified when someone messages you, sends a gift, or matches with you.",
  );
  const supabase = useMemo(
    () => createBrowserClient<Database>(supabaseUrl, anonKey),
    [anonKey, supabaseUrl],
  );

  const getAccessToken = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    return session?.access_token ?? null;
  }, [supabase]);

  const refreshSubscriptionStatus = useCallback(async () => {
    const accessToken = await getAccessToken();
    const headers: Record<string, string> = {};

    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }

    const response = await fetch("/api/push/subscribe", {
      headers,
      method: "GET",
    });

    if (!response.ok) {
      setActiveSubscriptionCount(null);
      return;
    }

    const result = (await response.json()) as {
      activeCount?: number;
      subscriptionSaved?: boolean;
    };
    setActiveSubscriptionCount(result.activeCount ?? 0);
  }, [getAccessToken]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSupport(getPushSupportState());
      void refreshSubscriptionStatus();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [refreshSubscriptionStatus]);

  async function enablePush() {
    setIsBusy(true);
    setMessage("Preparing push alerts...");
    const accessToken = await getAccessToken();
    const result = await subscribeToMatchrPush({
      accessToken,
      userId: currentUserId,
    });

    setSupport(getPushSupportState());
    setMessage(result.message);
    await refreshSubscriptionStatus();
    setIsBusy(false);
  }

  async function disablePush() {
    setIsBusy(true);
    const accessToken = await getAccessToken();
    await unsubscribeFromMatchrPush({ accessToken });
    setSupport(getPushSupportState());
    await refreshSubscriptionStatus();
    setMessage("This device will stop receiving Matchr push alerts.");
    setIsBusy(false);
  }

  async function sendTestPush() {
    setIsBusy(true);
    const response = await fetch("/api/push/test", {
      method: "POST",
    });
    setMessage(
      response.ok
        ? "Test push sent. If this device is subscribed, it should arrive shortly."
        : "Test push could not be sent. Check VAPID and subscription setup.",
    );
    setIsBusy(false);
  }

  const permission = support?.permission ?? "unknown";
  const canInstall = support?.canInstallPush ?? false;
  const isGranted = permission === "granted";
  const subscriptionStatus =
    activeSubscriptionCount === null
      ? "Checking subscription..."
      : activeSubscriptionCount > 0
        ? "Subscription saved"
        : "No subscription found";

  return (
    <div className="rounded-2xl border border-emerald-300/15 bg-emerald-300/10 p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-black text-white">PWA push alerts</p>
          <p className="mt-2 text-[15px] leading-6 text-neutral-300">
            Let Matchr reach you after you leave the app for messages, matches, gifts, calls, and gentle reminders.
          </p>
        </div>
        <span className="w-fit rounded-full border border-emerald-300/30 bg-black/30 px-3 py-1 text-[13px] font-medium text-emerald-100">
          {isGranted ? "Allowed" : permission}
        </span>
      </div>

      <div className="mt-4 grid gap-2 rounded-2xl border border-white/10 bg-black/35 p-3 text-[13px] leading-5 text-neutral-300">
        <p>{message}</p>
        <p className="text-neutral-400">
          iPhone support depends on Safari Web Push from an installed Home Screen PWA. If your browser cannot subscribe, in-app toasts and badges still work.
        </p>
        <p className="font-medium text-emerald-100">
          {subscriptionStatus}
          {activeSubscriptionCount !== null ? ` (${activeSubscriptionCount} active)` : ""}
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void enablePush()}
          disabled={isBusy || (!canInstall && !isGranted)}
          className="rounded-full bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isBusy ? "Working..." : "Enable push alerts"}
        </button>
        {isGranted ? (
          <button
            type="button"
            onClick={() => void sendTestPush()}
            disabled={isBusy}
            className="rounded-full border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 transition-colors hover:border-neutral-500 hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Test push
          </button>
        ) : null}
        {isGranted ? (
          <button
            type="button"
            onClick={() => void disablePush()}
            disabled={isBusy}
            className="rounded-full border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 transition-colors hover:border-neutral-500 hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Disable on this device
          </button>
        ) : null}
      </div>

      <div className="mt-3 rounded-xl border border-neutral-800/70 bg-black/25 px-3 py-2 text-xs leading-5 text-neutral-400">
        <span>Service worker: {support?.serviceWorkerSupported ? "yes" : "no"}</span>
        <span className="mx-2 text-neutral-700">/</span>
        <span>Secure: {support?.isSecureContext ? "yes" : "no"}</span>
        <span className="mx-2 text-neutral-700">/</span>
        <span>Installed: {support?.isStandalone ? "yes" : "no"}</span>
        <span className="mx-2 text-neutral-700">/</span>
        <span>VAPID key: {support?.vapidPublicKeyExists ? "yes" : "no"}</span>
      </div>
    </div>
  );
}
