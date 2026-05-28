"use client";

const SERVICE_WORKER_PATH = "/matchr-sw.js";

export type PushSupportState = {
  browser: string;
  canInstallPush: boolean;
  isSecureContext: boolean;
  isStandalone: boolean;
  permission: NotificationPermission | "unsupported";
  platform: string;
  reason?: string;
  serviceWorkerSupported: boolean;
  vapidPublicKeyExists: boolean;
};

export type PushSubscriptionResult =
  | { activeCount: number; ok: true; message: string; subscriptionSaved: boolean }
  | { ok: false; message: string; reason: string };

function isBrowser() {
  return typeof window !== "undefined";
}

function detectBrowser(userAgent: string) {
  if (/CriOS|Chrome/i.test(userAgent)) return "Chrome";
  if (/FxiOS|Firefox/i.test(userAgent)) return "Firefox";
  if (/Edg/i.test(userAgent)) return "Edge";
  if (/Safari/i.test(userAgent)) return "Safari";
  return "Unknown";
}

function detectPlatform(userAgent: string) {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "iOS";
  if (/Android/i.test(userAgent)) return "Android";
  if (/Macintosh/i.test(userAgent)) return "macOS";
  if (/Windows/i.test(userAgent)) return "Windows";
  return "Unknown";
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = `${base64String}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index);
  }

  return outputArray;
}

export function getPushSupportState(): PushSupportState {
  if (!isBrowser()) {
    return {
      browser: "Unknown",
      canInstallPush: false,
      isSecureContext: false,
      isStandalone: false,
      permission: "unsupported",
      platform: "Unknown",
      reason: "server",
      serviceWorkerSupported: false,
      vapidPublicKeyExists: false,
    };
  }

  const userAgent = window.navigator.userAgent;
  const serviceWorkerSupported = "serviceWorker" in window.navigator;
  const pushSupported = "PushManager" in window;
  const notificationSupported = "Notification" in window;
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in window.navigator &&
      Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone));
  const vapidPublicKeyExists = Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);

  let reason: string | undefined;
  if (!notificationSupported) reason = "notifications-unsupported";
  else if (!serviceWorkerSupported) reason = "service-worker-unsupported";
  else if (!pushSupported) reason = "push-unsupported";
  else if (!window.isSecureContext) reason = "insecure-context";
  else if (!vapidPublicKeyExists) reason = "missing-vapid-key";

  return {
    browser: detectBrowser(userAgent),
    canInstallPush:
      notificationSupported &&
      serviceWorkerSupported &&
      pushSupported &&
      window.isSecureContext &&
      vapidPublicKeyExists,
    isSecureContext: window.isSecureContext,
    isStandalone,
    permission: notificationSupported ? Notification.permission : "unsupported",
    platform: detectPlatform(userAgent),
    reason,
    serviceWorkerSupported,
    vapidPublicKeyExists,
  };
}

export async function registerMatchrServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    throw new Error("Service workers are not supported on this device.");
  }

  const registration = await navigator.serviceWorker.register(SERVICE_WORKER_PATH, {
    scope: "/",
  });

  console.info("[PushSubscribe] service worker registered", {
    scope: registration.scope,
  });

  return registration;
}

export async function subscribeToMatchrPush({
  accessToken,
  userId,
}: {
  accessToken?: string | null;
  userId: string;
}): Promise<PushSubscriptionResult> {
  const support = getPushSupportState();

  if (!support.canInstallPush) {
    console.warn("[PushSubscribe] push support check failed", {
      reason: support.reason,
      support,
    });

    return {
      ok: false,
      message:
        support.platform === "iOS" && !support.isStandalone
          ? "Install Matchr to your Home Screen to use web push on iPhone."
          : "Push notifications are not available on this device yet.",
      reason: support.reason ?? "unsupported",
    };
  }

  if (Notification.permission !== "granted") {
    const permission = await Notification.requestPermission();
    console.info("[PushSubscribe] permission result", { permission });

    if (permission !== "granted") {
      return {
        ok: false,
        message: "Notifications were not enabled.",
        reason: permission,
      };
    }
  } else {
    console.info("[PushSubscribe] permission already granted");
  }

  const registration = await registerMatchrServiceWorker();
  const existingSubscription = await registration.pushManager.getSubscription();
  console.info("[PushSubscribe] existing subscription", {
    exists: Boolean(existingSubscription),
  });
  const subscription =
    existingSubscription ??
    (await registration.pushManager.subscribe({
      applicationServerKey: urlBase64ToUint8Array(
        process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "",
      ),
      userVisibleOnly: true,
    }));
  console.info("[PushSubscribe] pushManager subscription ready", {
    endpoint: subscription.endpoint ? `${subscription.endpoint.slice(0, 18)}...` : null,
    wasExisting: Boolean(existingSubscription),
  });

  const serialized = subscription.toJSON();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  console.info("[PushSubscribe] POST /api/push/subscribe started", {
    hasAuth: Boolean(serialized.keys?.auth),
    hasBearer: Boolean(accessToken),
    hasP256dh: Boolean(serialized.keys?.p256dh),
  });

  const response = await fetch("/api/push/subscribe", {
    body: JSON.stringify({
      auth: serialized.keys?.auth ?? null,
      browser: support.browser,
      device: support.isStandalone ? "pwa" : "browser",
      endpoint: subscription.endpoint,
      p256dh: serialized.keys?.p256dh ?? null,
      platform: support.platform,
      userId,
    }),
    credentials: "include",
    headers,
    method: "POST",
  });

  if (!response.ok) {
    const result = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;

    console.error("[PushSubscribe] POST /api/push/subscribe failed", {
      error: result?.error,
      status: response.status,
    });

    return {
      ok: false,
      message: "Push subscription could not be saved.",
      reason: result?.error ?? "subscribe-failed",
    };
  }

  const result = (await response.json().catch(() => null)) as {
    activeCount?: number;
    subscriptionSaved?: boolean;
  } | null;

  if (!result?.subscriptionSaved) {
    console.error("[PushSubscribe] POST /api/push/subscribe did not save row", {
      activeCount: result?.activeCount ?? 0,
    });

    return {
      ok: false,
      message: "Notification permission is enabled, but this device was not saved for push alerts.",
      reason: "subscription-not-saved",
    };
  }

  console.info("[PushSubscribe] POST /api/push/subscribe success", {
    activeCount: result.activeCount ?? 0,
    subscriptionSaved: result.subscriptionSaved,
  });

  return {
    activeCount: result.activeCount ?? 0,
    ok: true,
    message: "Push alerts are saved for this device.",
    subscriptionSaved: true,
  };
}

export async function unsubscribeFromMatchrPush({
  accessToken,
}: {
  accessToken?: string | null;
} = {}) {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  const registration = await navigator.serviceWorker.getRegistration(SERVICE_WORKER_PATH);
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) {
    return;
  }

  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  await fetch("/api/push/subscribe", {
    body: JSON.stringify({
      active: false,
      endpoint,
    }),
    credentials: "include",
    headers,
    method: "POST",
  });
}
