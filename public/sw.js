self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data?.json() || {};
  } catch {}
  event.waitUntil(
    self.registration.showNotification(data.title || "يوني هوم", {
      body: data.body || "لديك إشعار جديد",
      tag: data.tag,
      icon: "/icon-192.png",
      data: { url: data.url || "/" },
      dir: "rtl",
      lang: "ar",
    }),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(
    event.notification.data?.url || "/",
    self.location.origin,
  );
  if (target.origin !== self.location.origin) return;
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(async (clients) => {
        const client = clients.find(
          (c) => new URL(c.url).origin === target.origin,
        );
        if (client) {
          await client.navigate(target.href);
          return client.focus();
        }
        return self.clients.openWindow(target.href);
      }),
  );
});
