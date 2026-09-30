import { authenticated, sameOrigin, sessionHash } from "@/lib/auth";
import { connection, demo, readState } from "@/lib/store";
import { AppError, ensure } from "@/lib/model";
import { limitedBody } from "@/lib/body";
import {
  pushReady,
  subscriptionId,
  validEndpoint,
  type PushRecord,
} from "@/lib/push";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function failure(error: unknown) {
  return Response.json(
    {
      error:
        error instanceof AppError
          ? error.message
          : "تعذر تفعيل الإشعارات، حاول مجددًا",
    },
    { status: error instanceof AppError ? error.status : 500 },
  );
}
export async function GET() {
  try {
    authenticated(await readState(), await sessionHash());
    return Response.json(
      {
        enabled: !demo && pushReady(),
        publicKey: !demo && pushReady() ? process.env.VAPID_PUBLIC_KEY : null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const actor = authenticated(await readState(), await sessionHash());
    ensure(
      !demo && pushReady(),
      "إشعارات الهاتف غير مفعلة على الخادم بعد",
      503,
    );
    const input = JSON.parse((await limitedBody(request, 6000)).toString());
    ensure(
      typeof input.endpoint === "string" &&
        input.endpoint.length < 4096 &&
        validEndpoint(input.endpoint),
      "عنوان خدمة الإشعارات غير مدعوم",
    );
    const { db } = await connection();
    const col = db.collection<PushRecord>("push_subscriptions");
    const _id = subscriptionId(input.endpoint);
    if (input.action === "unsubscribe")
      await col.deleteOne({ _id, userId: actor.id });
    else {
      ensure(
        typeof input.keys?.p256dh === "string" &&
          /^[A-Za-z0-9_-]{87}=?$/.test(input.keys.p256dh) &&
          typeof input.keys?.auth === "string" &&
          /^[A-Za-z0-9_-]{22}={0,2}$/.test(input.keys.auth),
        "بيانات الاشتراك غير صحيحة",
      );
      await col.updateOne(
        { _id },
        {
          $set: {
            userId: actor.id,
            endpoint: input.endpoint,
            keys: { p256dh: input.keys.p256dh, auth: input.keys.auth },
          },
        },
        { upsert: true },
      );
    }
    return Response.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
