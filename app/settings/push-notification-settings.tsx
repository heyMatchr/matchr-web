"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getPushSupportState,
  subscribeToMatchrPush,
  unsubscribeFromMatchrPush,
  type PushSubscribeDebugEvent,
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
  const [pushDebug, setPushDebug] = useState({
    apiCalled: false,
    apiSuccess: false,
    lastStep: "not started",
    serviceWorkerReady: false,
    subscriptionCreated: false,
  });
  const [pushDebugLog, setPushDebugLog] = useState<string[]>([]);
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
      credentials: "include",
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
    setPushDebug({
      apiCalled: false,
      apiSuccess: false,
      lastStep: "starting",
      serviceWorkerReady: false,
      subscriptionCreated: false,
    });
    setPushDebugLog([]);
    console.info("[PushSettings] Enable push alerts clicked", {
      currentUserId,
    });

    try {
      const accessToken = await getAccessToken();
      const handleDebugEvent = (event: PushSubscribeDebugEvent) => {
        setPushDebug((current) => ({
          apiCalled:
            current.apiCalled ||
            event.step === "BEFORE fetch /api/push/subscribe" ||
            event.step === "AFTER fetch /api/push/subscribe" ||
            event.step === "POST /api/push/subscribe success",
          apiSuccess:
            current.apiSuccess ||
            event.step === "POST /api/push/subscribe success",
          lastStep: event.step,
          serviceWorkerReady:
            current.serviceWorkerReady ||
            event.step === "service worker ready success",
          subscriptionCreated:
            current.subscriptionCreated ||
            event.step === "subscription object created" ||
            event.step === "pushManager.subscribe success",
        }));
        setPushDebugLog((current) =>
          [
            `${new Date().toLocaleTimeString()} ${event.step}`,
            ...current,
          ].slice(0, 8),
        );
      };
      const result = await subscribeToMatchrPush({
        accessToken,
        onDebug: handleDebugEvent,
        userId: currentUserId,
      });

      setSupport(getPushSupportState());
      setMessage(result.message);
      if (result.ok) {
        setActiveSubscriptionCount(result.activeCount);
      } else {
        await refreshSubscriptionStatus();
      }
    } catch (error) {
      console.error("[PushSettings] Enable push alerts failed", error);
      setMessage(
        error instanceof Error
          ? error.message
          : "Push alerts could not be enabled. Try again.",
      );
      await refreshSubscriptionStatus();
    } finally {
      setIsBusy(false);
    }
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
          disabled={isBusy}
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
        <span>Permission granted: {isGranted ? "yes" : "no"}</span>
        <span className="mx-2 text-neutral-700">/</span>
        <span>Subscription saved: {activeSubscriptionCount && activeSubscriptionCount > 0 ? "yes" : "no"}</span>
        <span className="mx-2 text-neutral-700">/</span>
        <span>Active subscriptions: {activeSubscriptionCount ?? "unknown"}</span>
        <br />
        <span>Service worker: {support?.serviceWorkerSupported ? "yes" : "no"}</span>
        <span className="mx-2 text-neutral-700">/</span>
        <span>Secure: {support?.isSecureContext ? "yes" : "no"}</span>
        <span className="mx-2 text-neutral-700">/</span>
        <span>Installed: {support?.isStandalone ? "yes" : "no"}</span>
        <span className="mx-2 text-neutral-700">/</span>
        <span>VAPID key: {support?.vapidPublicKeyExists ? "yes" : "no"}</span>
      </div>

      <div className="mt-3 rounded-xl border border-emerald-300/15 bg-black/45 px-3 py-2 text-xs leading-5 text-neutral-300">
        <p className="font-semibold text-emerald-100">Push subscription debug</p>
        <div className="mt-1 grid gap-x-3 gap-y-1 sm:grid-cols-2">
          <span>Permission: {permission}</span>
          <span>Standalone: {support?.isStandalone ? "yes" : "no"}</span>
          <span>Service worker ready: {pushDebug.serviceWorkerReady ? "yes" : "no"}</span>
          <span>Subscription object: {pushDebug.subscriptionCreated ? "yes" : "no"}</span>
          <span>Subscribe API called: {pushDebug.apiCalled ? "yes" : "no"}</span>
          <span>Subscribe API success: {pushDebug.apiSuccess ? "yes" : "no"}</span>
        </div>
        <p className="mt-1 text-neutral-400">Last step: {pushDebug.lastStep}</p>
        {pushDebugLog.length ? (
          <div className="mt-2 space-y-1 text-[11px] text-neutral-500">
            {pushDebugLog.map((entry) => (
              <p key={entry}>{entry}</p>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
