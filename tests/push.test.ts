import { test } from "node:test";
import assert from "node:assert/strict";
import { validEndpoint, subscriptionId, deliverPush } from "../lib/push";
import webpush from "web-push";
import type { Db } from "mongodb";
test("push endpoints only allow known HTTPS browser services", () => {
  for (const endpoint of [
    "https://fcm.googleapis.com/fcm/send/test",
    "https://web.push.apple.com/test",
    "https://updates.push.services.mozilla.com/wpush/test",
  ])
    assert.ok(validEndpoint(endpoint));
  for (const endpoint of [
    "http://fcm.googleapis.com/test",
    "https://localhost/test",
    "https://169.254.169.254/",
    "https://fcm.googleapis.com.evil.test/",
    "https://user:password@web.push.apple.com/",
  ])
    assert.equal(validEndpoint(endpoint), false);
  assert.equal(
    subscriptionId("https://example.test"),
    subscriptionId("https://example.test"),
  );
});
test("delivery routes by user, removes expired endpoints, and preserves transient subscriptions", async () => {
  const previous = { ...process.env };
  Object.assign(process.env, {
    VAPID_PUBLIC_KEY: "test",
    VAPID_PRIVATE_KEY: "test",
    VAPID_SUBJECT: "https://example.com",
  });
  const original = webpush.sendNotification;
  const sent: string[] = [];
  const removed: string[] = [];
  const db = {
    collection: () => ({
      find: ({ userId }: { userId: string }) => ({
        toArray: async () => [
          {
            _id: "expired",
            userId,
            endpoint: "https://fcm.googleapis.com/test",
            keys: { auth: "a", p256dh: "b" },
          },
          {
            _id: "temporary",
            userId,
            endpoint: "https://web.push.apple.com/test",
            keys: { auth: "a", p256dh: "b" },
          },
        ],
      }),
      deleteOne: async ({ _id }: { _id: string }) => removed.push(_id),
    }),
  } as unknown as Db;
  webpush.sendNotification = (async (subscription) => {
    sent.push(subscription.endpoint);
    throw {
      statusCode: subscription.endpoint.includes("googleapis") ? 410 : 503,
    };
  }) as typeof webpush.sendNotification;
  try {
    await deliverPush(db, [
      {
        id: "n",
        userId: "1",
        paymentId: "p",
        text: "test",
        read: false,
        createdAt: "",
      },
    ]);
    assert.equal(sent.length, 2);
    assert.deepEqual(removed, ["expired"]);
  } finally {
    webpush.sendNotification = original;
    for (const key of [
      "VAPID_PUBLIC_KEY",
      "VAPID_PRIVATE_KEY",
      "VAPID_SUBJECT",
    ]) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
