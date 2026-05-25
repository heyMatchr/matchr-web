"use client";

import { useEffect, useState } from "react";
import {
  type BrowserNotificationStatus,
  disableBrowserNotifications,
  getBrowserNotificationStatus,
  requestBrowserNotificationPermission,
} from "@/lib/browser-notifications";

const statusLabel: Record<BrowserNotificationStatus, string> = {
  blocked: "Blocked",
  enabled: "Enabled",
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

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setStatus(getBrowserNotificationStatus());
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  async function enableNotifications() {
    const nextStatus = await requestBrowserNotificationPermission();
    setStatus(nextStatus);
  }

  function turnOffNotifications() {
    disableBrowserNotifications();
    setStatus(getBrowserNotificationStatus());
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
          <p className="mt-1 text-sm text-neutral-400">
            Messages, calls, matches, and gifts can alert you while Matchr is open.
          </p>
        </div>
        <span
          className={`w-fit rounded-full border px-3 py-1 text-xs font-medium ${
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
            Enable notifications
          </button>
        ) : (
          <button
            type="button"
            onClick={turnOffNotifications}
            className="rounded-full border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 transition-colors hover:border-neutral-500 hover:bg-neutral-900"
          >
            Turn off browser alerts
          </button>
        )}
      </div>

      {status === "blocked" ? (
        <p className="mt-3 text-xs text-neutral-500">
          Notifications are blocked in your browser settings. Enable them there to receive Matchr alerts.
        </p>
      ) : null}
      {status === "unsupported" ? (
        <p className="mt-3 text-xs text-neutral-500">
          This browser does not support web notifications.
        </p>
      ) : null}
    </div>
  );
}
