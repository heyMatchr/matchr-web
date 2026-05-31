"use client";

const SERVICE_WORKER_PATH = "/matchr-sw.js";

export type PushSupportState = {
  browser: string;
  canInstallPush: boolean;
  isSecureContext: boolean;
  isStandalone: boolean;
  permission: NotificationPermission | "unsupported";
  platform: string;
  pushSupported: boolean;
  reason?: string;
  serviceWorkerSupported: boolean;
  vapidPublicKeyExists: boolean;
};

export type PushSubscriptionResult =
  | { activeCount: number; ok: true; message: string; subscriptionSaved: boolean }
  | { ok: false; message: string; reason: string };

export type PushSubscribeDebugEvent = {
  data?: Record<string, unknown>;
  step: string;
};

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
      pushSupported: false,
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
    pushSupported,
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

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string) {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => {
        reject(new Error(`${label} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    }),
  ]);
}

export async function subscribeToMatchrPush({
  accessToken,
  onDebug,
  userId,
}: {
  accessToken?: string | null;
  onDebug?: (event: PushSubscribeDebugEvent) => void;
  userId: string;
}): Promise<PushSubscriptionResult> {
  const debug = (step: string, data?: Record<string, unknown>) => {
    console.info(`[PushSubscribe] ${step}`, data ?? {});
    onDebug?.({ data, step });
  };
  const debugError = (step: string, data?: Record<string, unknown>) => {
    console.error(`[PushSubscribe] ${step}`, data ?? {});
    onDebug?.({ data, step });
  };

  debug("entered subscribeToMatchrPush", { userId });
  const support = getPushSupportState();
  debug("support state", support as unknown as Record<string, unknown>);

  if (!support.canInstallPush) {
    debugError("support checks failed", {
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

  debug("support checks passed", {
    browser: support.browser,
    platform: support.platform,
    standalone: support.isStandalone,
  });

  if (Notification.permission !== "granted") {
    debug("permission request starting", {
      permission: Notification.permission,
    });
    const permission = await Notification.requestPermission();
    debug("permission result", { permission });

    if (permission !== "granted") {
      debugError("permission not granted", { permission });
      return {
        ok: false,
        message: "Notifications were not enabled.",
        reason: permission,
      };
    }
  } else {
    debug("permission already granted", {
      permission: Notification.permission,
    });
  }

  let registration: ServiceWorkerRegistration;

  try {
    debug("service worker registration starting");
    registration = await registerMatchrServiceWorker();
    debug("service worker registration success", {
      scope: registration.scope,
    });
  } catch (error) {
    debugError("service worker registration failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      ok: false,
      message: "Service worker registration failed.",
      reason: error instanceof Error ? error.message : "service-worker-failed",
    };
  }

  try {
    debug("service worker ready wait starting");
    await withTimeout(navigator.serviceWorker.ready, 8000, "Service worker ready");
    debug("service worker ready success");
  } catch (error) {
    debugError("service worker ready failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      ok: false,
      message: "Service worker was not ready for push alerts.",
      reason: error instanceof Error ? error.message : "service-worker-not-ready",
    };
  }

  const existingSubscription = await registration.pushManager.getSubscription();
  debug("existing push subscription checked", {
    exists: Boolean(existingSubscription),
  });

  let subscription: PushSubscription;

  try {
    if (existingSubscription) {
      subscription = existingSubscription;
    } else {
      debug("pushManager.subscribe starting");
      subscription = await registration.pushManager.subscribe({
        applicationServerKey: urlBase64ToUint8Array(
          process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "",
        ),
        userVisibleOnly: true,
      });
    }

    debug("pushManager.subscribe success", {
      endpoint: subscription.endpoint ? `${subscription.endpoint.slice(0, 18)}...` : null,
      wasExisting: Boolean(existingSubscription),
    });
    debug("subscription object created", {
      hasEndpoint: Boolean(subscription.endpoint),
    });
  } catch (error) {
    debugError("pushManager.subscribe failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      ok: false,
      message: "This device could not create a push subscription.",
      reason: error instanceof Error ? error.message : "push-subscribe-failed",
    };
  }

  const serialized = subscription.toJSON();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  debug("BEFORE fetch /api/push/subscribe", {
    hasAuth: Boolean(serialized.keys?.auth),
    hasBearer: Boolean(accessToken),
    hasP256dh: Boolean(serialized.keys?.p256dh),
  });

  let response: Response;

  try {
    response = await fetch("/api/push/subscribe", {
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
    debug("AFTER fetch /api/push/subscribe", {
      ok: response.ok,
      status: response.status,
    });
  } catch (error) {
    debugError("fetch /api/push/subscribe threw", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      ok: false,
      message: "Push subscription request could not reach Matchr.",
      reason: error instanceof Error ? error.message : "subscribe-fetch-failed",
    };
  }

  if (!response.ok) {
    const result = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;

    debugError("POST /api/push/subscribe failed", {
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
    debugError("POST /api/push/subscribe did not save row", {
      activeCount: result?.activeCount ?? 0,
    });

    return {
      ok: false,
      message: "Notification permission is enabled, but this device was not saved for push alerts.",
      reason: "subscription-not-saved",
    };
  }

  debug("POST /api/push/subscribe success", {
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
