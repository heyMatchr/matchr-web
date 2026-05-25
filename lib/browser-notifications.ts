"use client";

export type BrowserNotificationStatus =
  | "blocked"
  | "enabled"
  | "not-enabled"
  | "unsupported";

type BrowserNotificationPayload = {
  body?: string;
  icon?: string | null;
  requireHidden?: boolean;
  tag?: string;
  title: string;
};

const NOTIFICATION_PREF_KEY = "matchr_browser_notifications_enabled";
const ENABLE_NOTIFICATION_DEBUG = process.env.NODE_ENV === "development";

function hasNotificationApi() {
  return typeof window !== "undefined" && "Notification" in window;
}

export function getBrowserNotificationStatus(): BrowserNotificationStatus {
  if (!hasNotificationApi()) {
    return "unsupported";
  }

  if (Notification.permission === "denied") {
    return "blocked";
  }

  if (Notification.permission !== "granted") {
    return "not-enabled";
  }

  return localStorage.getItem(NOTIFICATION_PREF_KEY) === "enabled"
    ? "enabled"
    : "not-enabled";
}

export function areBrowserNotificationsEnabled() {
  return getBrowserNotificationStatus() === "enabled";
}

export async function requestBrowserNotificationPermission() {
  if (!hasNotificationApi()) {
    return "unsupported" satisfies BrowserNotificationStatus;
  }

  const permission = await Notification.requestPermission();

  if (permission === "granted") {
    localStorage.setItem(NOTIFICATION_PREF_KEY, "enabled");
    localStorage.setItem("matchr_call_alerts", "enabled");
    return "enabled" satisfies BrowserNotificationStatus;
  }

  localStorage.removeItem(NOTIFICATION_PREF_KEY);

  return permission === "denied"
    ? ("blocked" satisfies BrowserNotificationStatus)
    : ("not-enabled" satisfies BrowserNotificationStatus);
}

export function disableBrowserNotifications() {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.removeItem(NOTIFICATION_PREF_KEY);
  localStorage.removeItem("matchr_call_alerts");
}

export function sanitizeNotificationPreview({
  content,
  mediaType,
  messageType,
}: {
  content?: string | null;
  mediaType?: string | null;
  messageType?: string | null;
}) {
  if (messageType === "private_media") {
    return "Sent you private media";
  }

  if (messageType === "image") {
    return "Sent you a photo";
  }

  if (messageType === "video") {
    return "Sent you a video";
  }

  if (messageType === "gift") {
    return "Sent you a gift";
  }

  if (mediaType === "image") {
    return "Sent you a photo";
  }

  if (mediaType === "video") {
    return "Sent you a video";
  }

  const preview = content?.trim() ?? "";

  if (!preview) {
    return "Sent you a message";
  }

  return preview.length > 90 ? `${preview.slice(0, 87).trim()}...` : preview;
}

export function showBrowserNotification({
  body,
  icon,
  requireHidden = true,
  tag,
  title,
}: BrowserNotificationPayload) {
  const debugState = {
    enabledFlag:
      typeof window === "undefined"
        ? null
        : localStorage.getItem(NOTIFICATION_PREF_KEY),
    isSecureContext:
      typeof window === "undefined" ? false : window.isSecureContext,
    permission: hasNotificationApi() ? Notification.permission : "unsupported",
    requireHidden,
    visibilityState:
      typeof document === "undefined" ? "unknown" : document.visibilityState,
  };

  if (!hasNotificationApi()) {
    if (ENABLE_NOTIFICATION_DEBUG) {
      console.log("[BrowserNotification] skipped", {
        ...debugState,
        reason: "unsupported",
        title,
      });
    }
    return false;
  }

  if (!window.isSecureContext) {
    if (ENABLE_NOTIFICATION_DEBUG) {
      console.log("[BrowserNotification] skipped", {
        ...debugState,
        reason: "insecure-context",
        title,
      });
    }
    return false;
  }

  if (Notification.permission !== "granted") {
    if (ENABLE_NOTIFICATION_DEBUG) {
      console.log("[BrowserNotification] skipped", {
        ...debugState,
        reason: "permission-not-granted",
        title,
      });
    }
    return false;
  }

  if (localStorage.getItem(NOTIFICATION_PREF_KEY) !== "enabled") {
    if (ENABLE_NOTIFICATION_DEBUG) {
      console.log("[BrowserNotification] skipped", {
        ...debugState,
        reason: "local-storage-flag-disabled",
        title,
      });
    }
    return false;
  }

  if (requireHidden && document.visibilityState !== "hidden") {
    if (ENABLE_NOTIFICATION_DEBUG) {
      console.log("[BrowserNotification] skipped", {
        ...debugState,
        reason: "visible-tab",
        title,
      });
    }
    return false;
  }

  try {
    new Notification(title, {
      body,
      icon: icon ?? "/matchr-logo.png",
      tag,
    });
    if (ENABLE_NOTIFICATION_DEBUG) {
      console.log("[BrowserNotification] shown", {
        ...debugState,
        tag,
        title,
      });
    }
    return true;
  } catch (error) {
    if (ENABLE_NOTIFICATION_DEBUG) {
      console.log("[BrowserNotification] failed", {
        ...debugState,
        error,
        reason: "browser-blocked-notification",
        title,
      });
    }
    return false;
  }
}

export function showTestBrowserNotification() {
  return showBrowserNotification({
    body: "Browser notifications are ready for Matchr.",
    requireHidden: false,
    tag: "matchr-test-notification",
    title: "Matchr notifications enabled",
  });
}

export function getBrowserNotificationDebugState() {
  if (typeof window === "undefined") {
    return {
      enabledFlag: null,
      isSecureContext: false,
      permission: "unknown",
    };
  }

  return {
    enabledFlag: localStorage.getItem(NOTIFICATION_PREF_KEY),
    isSecureContext: window.isSecureContext,
    permission: hasNotificationApi() ? Notification.permission : "unsupported",
  };
}

export function vibrateForNotification(pattern: VibratePattern = [140, 70, 140]) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(pattern);
  }
}
