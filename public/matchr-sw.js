/* Matchr service worker.
 *
 * This worker intentionally avoids cache interception so it cannot fight with
 * Next/Vercel assets or future runtime caching. Its first job is push delivery.
 *
 * iOS note: Safari Web Push works only for supported installed Home Screen
 * web apps over HTTPS. Browser tabs may still fall back to in-app/browser
 * notifications. Native-scale APNs/Firebase fanout can be layered behind the
 * same payload shape later.
 */

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

function parsePushPayload(event) {
  if (!event.data) {
    return {};
  }

  try {
    return event.data.json();
  } catch {
    return {
      title: "Matchr",
      body: event.data.text(),
    };
  }
}

self.addEventListener("push", (event) => {
  const payload = parsePushPayload(event);
  const title = payload.title || "Matchr";
  const options = {
    badge: "/matchr-icon-192.png",
    body: payload.body || "You have a new Matchr update.",
    data: {
      type: payload.type || "matchr",
      url: payload.url || "/notifications",
      ...(payload.data || {}),
    },
    icon: payload.icon || "/matchr-icon-192.png",
    tag: payload.tag || payload.type || "matchr-notification",
    vibrate: payload.vibrate || [80, 40, 80],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || "/notifications";
  const absoluteUrl = new URL(targetUrl, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ includeUncontrolled: true, type: "window" }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client && client.url.startsWith(self.location.origin)) {
          client.navigate(absoluteUrl);
          return client.focus();
        }
      }

      return self.clients.openWindow(absoluteUrl);
    }),
  );
});
