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
    permissionGranted: false,
    pushSubscriptionCreated: false,
    serviceWorkerReady: false,
    subscribeApiCalled: false,
    subscribeApiError: "",
    subscribeApiResponse: "",
    subscribeApiSuccess: false,
    supportDetected: false,
    lastStep: "not started",
  });
  const [pushDebugLog, setPushDebugLog] = useState<string[]>([]);
  const [forceSaveDebug, setForceSaveDebug] = useState({
    apiCalled: false,
    errorText: "",
    responseBody: "",
    responseStatus: "",
  });
  const [showDebugTools, setShowDebugTools] = useState(false);
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
      permissionGranted: false,
      pushSubscriptionCreated: false,
      serviceWorkerReady: false,
      subscribeApiCalled: false,
      subscribeApiError: "",
      subscribeApiResponse: "",
      subscribeApiSuccess: false,
      supportDetected: false,
      lastStep: "starting",
    });
    setPushDebugLog([]);
    console.info("[PushSettings] Enable push alerts clicked", {
      currentUserId,
    });

    try {
      const accessToken = await getAccessToken();
      const handleDebugEvent = (event: PushSubscribeDebugEvent) => {
        setPushDebug((current) => ({
          permissionGranted:
            current.permissionGranted ||
            event.step === "permission result" ||
            event.step === "permission already granted",
          pushSubscriptionCreated:
            current.pushSubscriptionCreated ||
            event.step === "subscription object created" ||
            event.step === "pushManager.subscribe success",
          serviceWorkerReady:
            current.serviceWorkerReady ||
            event.step === "service worker ready success",
          subscribeApiCalled:
            current.subscribeApiCalled ||
            event.step === "BEFORE fetch /api/push/subscribe" ||
            event.step === "AFTER fetch /api/push/subscribe" ||
            event.step === "POST /api/push/subscribe success",
          subscribeApiError:
            event.step.includes("failed") || event.step.includes("threw")
              ? String(event.data?.error ?? event.data?.reason ?? event.step)
              : current.subscribeApiError,
          subscribeApiResponse:
            event.step === "AFTER fetch /api/push/subscribe"
              ? `status ${String(event.data?.status ?? "unknown")}`
              : current.subscribeApiResponse,
          subscribeApiSuccess:
            current.subscribeApiSuccess ||
            event.step === "POST /api/push/subscribe success",
          supportDetected:
            current.supportDetected ||
            event.step === "support checks passed",
          lastStep: event.step,
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

  async function forceSaveTestSubscription() {
    setIsBusy(true);
    setForceSaveDebug({
      apiCalled: true,
      errorText: "",
      responseBody: "",
      responseStatus: "calling",
    });
    setMessage("Calling /api/push/subscribe directly...");
    console.info("[PushSettings] Force Save Test Subscription clicked", {
      currentUserId,
    });

    try {
      const accessToken = await getAccessToken();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`;
      }

      console.info("[PushSettings] force save BEFORE fetch /api/push/subscribe", {
        hasBearer: Boolean(accessToken),
      });

      const response = await fetch("/api/push/subscribe", {
        body: JSON.stringify({
          auth: "force-save-test-auth",
          browser: "debug",
          device: "force-save-test",
          endpoint: `https://matchr.local/force-save-test/${currentUserId}/${Date.now()}`,
          p256dh: "force-save-test-p256dh",
          platform: "debug",
          userId: currentUserId,
        }),
        credentials: "include",
        headers,
        method: "POST",
      });
      const responseText = await response.text();

      console.info("[PushSettings] force save AFTER fetch /api/push/subscribe", {
        body: responseText,
        ok: response.ok,
        status: response.status,
      });

      setForceSaveDebug({
        apiCalled: true,
        errorText: response.ok ? "" : responseText,
        responseBody: responseText,
        responseStatus: `${response.status} ${response.statusText}`,
      });
      setMessage(
        response.ok
          ? "Force save reached /api/push/subscribe. Check push_subscriptions now."
          : "Force save reached the API, but the API rejected it.",
      );
      await refreshSubscriptionStatus();
    } catch (error) {
      const errorText = error instanceof Error ? error.message : String(error);
      console.error("[PushSettings] force save fetch failed", error);
      setForceSaveDebug({
        apiCalled: true,
        errorText,
        responseBody: "",
        responseStatus: "fetch failed",
      });
      setMessage("Force save could not reach /api/push/subscribe.");
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
  const backgroundPushUnavailable = Boolean(support && !support.canInstallPush);
  const backgroundPushMessage =
    support?.reason === "push-unsupported"
      ? "Background alerts are not available here."
      : support?.reason === "missing-vapid-key"
        ? "Background push is not configured yet."
        : support?.reason === "notifications-unsupported"
          ? "Notifications are not supported on this device/browser."
          : support?.reason === "service-worker-unsupported"
            ? "Background push needs service worker support, which is unavailable here."
            : support?.reason === "insecure-context"
              ? "Background push requires a secure HTTPS context."
              : "Background push is not available in this browser session.";
  const showPushActions = !backgroundPushUnavailable;
  const isDevelopment = process.env.NODE_ENV !== "production";
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
        {backgroundPushUnavailable ? (
          <p className="rounded-xl border border-amber-300/20 bg-amber-300/10 px-3 py-2 font-medium text-amber-100">
            {backgroundPushMessage} Matchr will still use in-app notification toasts and unread badges while you are inside the app.
          </p>
        ) : null}
        <p className="font-medium text-emerald-100">
          {subscriptionStatus}
          {activeSubscriptionCount !== null ? ` (${activeSubscriptionCount} active)` : ""}
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {showPushActions ? (
          <button
            type="button"
            onClick={() => void enablePush()}
            disabled={isBusy}
            className="rounded-full bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isBusy ? "Working..." : "Enable push alerts"}
          </button>
        ) : (
          <button
            type="button"
            disabled
            className="rounded-full border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-500"
          >
            Background push unavailable
          </button>
        )}
        {isDevelopment ? (
          <button
            type="button"
            onClick={() => setShowDebugTools((current) => !current)}
            disabled={isBusy}
            className="rounded-full border border-amber-300/40 bg-amber-300/10 px-4 py-2 text-sm font-medium text-amber-100 transition-colors hover:bg-amber-300/15 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {showDebugTools ? "Hide push debug tools" : "Show push debug tools"}
          </button>
        ) : null}
        {showDebugTools && isDevelopment ? (
          <button
            type="button"
            onClick={() => void forceSaveTestSubscription()}
            disabled={isBusy}
            className="rounded-full border border-amber-300/40 bg-amber-300/10 px-4 py-2 text-sm font-medium text-amber-100 transition-colors hover:bg-amber-300/15 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Force Save Test Subscription
          </button>
        ) : null}
        {isGranted && showPushActions ? (
          <button
            type="button"
            onClick={() => void sendTestPush()}
            disabled={isBusy}
            className="rounded-full border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 transition-colors hover:border-neutral-500 hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Test push
          </button>
        ) : null}
        {isGranted && showPushActions ? (
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

      <details className="mt-3 rounded-xl border border-neutral-800/70 bg-black/25 px-3 py-2 text-xs leading-5 text-neutral-400">
        <summary className="cursor-pointer text-sm font-medium text-neutral-300">
          Details
        </summary>
        <div className="mt-2">
          <span>Permission granted: {isGranted ? "yes" : "no"}</span>
          <span className="mx-2 text-neutral-700">/</span>
          <span>Subscription saved: {activeSubscriptionCount && activeSubscriptionCount > 0 ? "yes" : "no"}</span>
          <span className="mx-2 text-neutral-700">/</span>
          <span>Active subscriptions: {activeSubscriptionCount ?? "unknown"}</span>
          <br />
          <span>Service worker: {support?.serviceWorkerSupported ? "yes" : "no"}</span>
          <span className="mx-2 text-neutral-700">/</span>
          <span>PushManager: {support?.pushSupported ? "yes" : "no"}</span>
          <span className="mx-2 text-neutral-700">/</span>
          <span>Secure: {support?.isSecureContext ? "yes" : "no"}</span>
          <span className="mx-2 text-neutral-700">/</span>
          <span>Installed: {support?.isStandalone ? "yes" : "no"}</span>
          <span className="mx-2 text-neutral-700">/</span>
          <span>VAPID key: {support?.vapidPublicKeyExists ? "yes" : "no"}</span>
        </div>
        <div className="mt-3 rounded-xl border border-emerald-300/15 bg-black/45 px-3 py-2 text-neutral-300">
          <p className="font-semibold text-emerald-100">Push subscription debug</p>
          <div className="mt-1 grid gap-x-3 gap-y-1 sm:grid-cols-2">
            <span>supportDetected: {pushDebug.supportDetected ? "yes" : "no"}</span>
            <span>permissionGranted: {pushDebug.permissionGranted || isGranted ? "yes" : "no"}</span>
            <span>serviceWorkerReady: {pushDebug.serviceWorkerReady ? "yes" : "no"}</span>
            <span>pushSubscriptionCreated: {pushDebug.pushSubscriptionCreated ? "yes" : "no"}</span>
            <span>subscribeApiCalled: {pushDebug.subscribeApiCalled ? "yes" : "no"}</span>
            <span>subscribeApiSuccess: {pushDebug.subscribeApiSuccess ? "yes" : "no"}</span>
          </div>
          <p className="mt-1 text-neutral-400">
            subscribeApiResponse: {pushDebug.subscribeApiResponse || "none"}
          </p>
          <p className="mt-1 text-neutral-400">
            subscribeApiError: {pushDebug.subscribeApiError || "none"}
          </p>
          <p className="mt-1 text-neutral-400">Last step: {pushDebug.lastStep}</p>
          {pushDebugLog.length ? (
            <div className="mt-2 space-y-1 text-[11px] text-neutral-500">
              {pushDebugLog.map((entry) => (
                <p key={entry}>{entry}</p>
              ))}
            </div>
          ) : null}
        </div>
        {showDebugTools && isDevelopment ? (
          <div className="mt-3 rounded-xl border border-amber-300/20 bg-black/45 px-3 py-2 text-neutral-300">
            <p className="font-semibold text-amber-100">Force save debug</p>
            <div className="mt-1 grid gap-x-3 gap-y-1 sm:grid-cols-2">
              <span>apiCalled: {forceSaveDebug.apiCalled ? "yes" : "no"}</span>
              <span>response status: {forceSaveDebug.responseStatus || "none"}</span>
            </div>
            <p className="mt-1 break-words text-neutral-400">
              response body: {forceSaveDebug.responseBody || "none"}
            </p>
            <p className="mt-1 break-words text-neutral-400">
              error text: {forceSaveDebug.errorText || "none"}
            </p>
          </div>
        ) : null}
      </details>
    </div>
  );
}
