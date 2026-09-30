import webpush from "web-push";
import { createHash } from "node:crypto";
import type { Db } from "mongodb";
import type { Notice } from "./model";
export const pushSubject = () =>
  process.env.VAPID_SUBJECT ||
  (process.env.RAILWAY_PUBLIC_DOMAIN
    ? "https://" + process.env.RAILWAY_PUBLIC_DOMAIN
    : process.env.APP_ORIGIN);
export const pushReady = () =>
  !!(
    process.env.VAPID_PUBLIC_KEY &&
    process.env.VAPID_PRIVATE_KEY &&
    pushSubject()
  );
export const subscriptionId = (endpoint: string) =>
  createHash("sha256").update(endpoint).digest("hex");
export function validEndpoint(endpoint: string) {
  try {
    const url = new URL(endpoint);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      (url.hostname === "fcm.googleapis.com" ||
        url.hostname === "updates.push.services.mozilla.com" ||
        url.hostname.endsWith(".push.services.mozilla.com") ||
        url.hostname === "web.push.apple.com" ||
        url.hostname.endsWith(".notify.windows.com"))
    );
  } catch {
    return false;
  }
}
export type PushRecord = {
  _id: string;
  userId: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
};
export async function deliverPush(db: Db, notices: Notice[]) {
  if (!pushReady() || !notices.length) return;
  const col = db.collection<PushRecord>("push_subscriptions");
  for (const notice of notices) {
    const records = await col.find({ userId: notice.userId }).toArray();
    await Promise.all(
      records.map(async (record) => {
        if (!validEndpoint(record.endpoint)) return;
        try {
          await webpush.sendNotification(
            record,
            JSON.stringify({
              title: "يوني هوم",
              body: notice.text,
              tag: notice.id,
              url: "/?payment=" + encodeURIComponent(notice.paymentId),
            }),
            {
              TTL: 86400,
              timeout: 7000,
              vapidDetails: {
                subject: pushSubject()!,
                publicKey: process.env.VAPID_PUBLIC_KEY!,
                privateKey: process.env.VAPID_PRIVATE_KEY!,
              },
            },
          );
        } catch (error) {
          if ([404, 410].includes((error as { statusCode: number }).statusCode))
            await col.deleteOne({ _id: record._id });
          else
            console.warn(
              "Push delivery failed; in-app notification remains available.",
            );
        }
      }),
    );
  }
}
