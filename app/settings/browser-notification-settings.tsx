"use client";

import { useEffect, useState } from "react";
import {
  type BrowserNotificationStatus,
  disableBrowserNotifications,
  getBrowserNotificationDebugState,
  getBrowserNotificationStatus,
  requestBrowserNotificationPermission,
  showTestBrowserNotification,
} from "@/lib/browser-notifications";

const statusLabel: Record<BrowserNotificationStatus, string> = {
  blocked: "Blocked",
  enabled: "Permission enabled",
  "not-enabled": "Not enabled",
  unsupported: "Unsupported",
};

export function BrowserNotificationSettings({
  compact = false,
}: {
  compact?: boolean;
}) {
  const [status, setStatus] =
    useState<BrowserNotificationStatus>("not-enabled");
  const [debugState, setDebugState] = useState({
    enabledFlag: null as string | null,
    isSecureContext: false,
    permission: "unknown",
  });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setStatus(getBrowserNotificationStatus());
      setDebugState(getBrowserNotificationDebugState());
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  async function enableNotifications() {
    const nextStatus = await requestBrowserNotificationPermission();
    setStatus(nextStatus);
    setDebugState(getBrowserNotificationDebugState());
  }

  function turnOffNotifications() {
    disableBrowserNotifications();
    setStatus(getBrowserNotificationStatus());
    setDebugState(getBrowserNotificationDebugState());
  }

  function sendTestNotification() {
    showTestBrowserNotification();
    setDebugState(getBrowserNotificationDebugState());
  }

  return (
    <div
      className={
        compact
          ? "rounded-2xl border border-emerald-300/15 bg-emerald-300/10 p-4"
          : "rounded-2xl border border-neutral-800 bg-white/[0.03] p-4"
      }
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-black text-white">Browser notifications</p>
          <p className="mt-2 text-[15px] leading-6 text-neutral-300">
            Local browser permission only. Use PWA push alerts below to save this device for background notifications.
          </p>
        </div>
        <span
          className={`w-fit rounded-full border px-3 py-1 text-[13px] font-medium ${
            status === "enabled"
              ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-100"
              : "border-neutral-700 text-neutral-300"
          }`}
        >
          {statusLabel[status]}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {status !== "enabled" ? (
          <button
            type="button"
            onClick={() => void enableNotifications()}
            disabled={status === "unsupported"}
            className="rounded-full bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Enable local permission
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={sendTestNotification}
              className="rounded-full bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-neutral-200"
            >
              Test local notification
            </button>
            <button
              type="button"
              onClick={turnOffNotifications}
              className="rounded-full border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 transition-colors hover:border-neutral-500 hover:bg-neutral-900"
            >
              Turn off browser alerts
            </button>
          </>
        )}
      </div>

      {status === "blocked" ? (
        <p className="mt-3 text-sm leading-6 text-neutral-400">
          Notifications are blocked in your browser settings. Enable them there to receive Matchr alerts.
        </p>
      ) : null}
      {status === "unsupported" ? (
        <p className="mt-3 text-sm leading-6 text-neutral-400">
          This browser does not support web notifications.
        </p>
      ) : null}
      <div className="mt-3 rounded-xl border border-neutral-800/70 bg-black/25 px-3 py-2 text-xs leading-5 text-neutral-400">
        <span>Permission: {debugState.permission}</span>
        <span className="mx-2 text-neutral-700">/</span>
        <span>
          Enabled flag: {debugState.enabledFlag === "enabled" ? "yes" : "no"}
        </span>
        <span className="mx-2 text-neutral-700">/</span>
        <span>Secure context: {debugState.isSecureContext ? "yes" : "no"}</span>
      </div>
    </div>
  );
}
