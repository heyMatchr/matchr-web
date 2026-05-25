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
  if (!areBrowserNotificationsEnabled()) {
    return false;
  }

  if (requireHidden && document.visibilityState !== "hidden") {
    return false;
  }

  try {
    new Notification(title, {
      body,
      icon: icon ?? "/matchr-logo.png",
      tag,
    });
    return true;
  } catch {
    return false;
  }
}

export function vibrateForNotification(pattern: VibratePattern = [140, 70, 140]) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(pattern);
  }
}
