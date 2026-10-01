import { randomUUID } from "node:crypto";
import Stripe from "stripe";
import { authenticated, sameOrigin, sessionHash } from "@/lib/auth";
import { limitedBody } from "@/lib/body";
import { AppError, ensure, stripePending } from "@/lib/model";
import { mutate, readState } from "@/lib/store";
import { fulfillStripe, stripeClient, stripeOptions } from "@/lib/stripe";

export const runtime = "nodejs";
export async function POST(request: Request) {
  let reservation: { paymentId: string; attempt: string } | undefined;
  try {
    const origin = sameOrigin(request);
    const hash = await sessionHash();
    const input = JSON.parse(
      (await limitedBody(request, 4000)).toString("utf8"),
    );
    ensure(
      input &&
        typeof input === "object" &&
        !Array.isArray(input) &&
        typeof input.id === "string",
      "صيغة الطلب غير صحيحة",
    );
    authenticated(await readState(), hash);
    const stripe = stripeClient();
    if (input.action === "verify" || input.action === "close") {
      const state = await readState();
      const actor = authenticated(state, hash);
      const p = state.payments.find(
        (p) => p.id === input.id && p.userId === actor.id,
      );
      ensure(p?.stripe?.sessionId, "جلسة الدفع غير موجودة", 404);
      let session = await stripe.checkout.sessions.retrieve(p.stripe.sessionId);
      if (input.action === "close" && session.status === "open")
        session = await stripe.checkout.sessions.expire(session.id);
      const paid = await mutate((state) => {
        authenticated(state, hash);
        const paid = fulfillStripe(state, session);
        const current = state.payments.find((item) => item.id === p.id);
        if (
          !paid &&
          session.status === "expired" &&
          current?.stripe?.sessionId === session.id
        )
          current.stripe = undefined;
        return paid;
      });
      return Response.json({ paid });
    }
    ensure(input.action === "checkout", "عملية غير معروفة");
    const options = await stripeOptions();
    ensure(
      options.enabled,
      "تعذر تجهيز دفع Stripe أو جلب سعر الصرف. يرجى المحاولة لاحقًا أو استخدام التحويل البنكي",
      503,
    );
    ensure(
      input.fee === options.fee,
      "تغيرت رسوم الدفع. حدّث الصفحة للاطلاع على الإجمالي الجديد",
    );
    const attempt = randomUUID();
    const payment = await mutate((state) => {
      const actor = authenticated(state, hash);
      const p = state.payments.find((p) => p.id === input.id);
      ensure(p && p.userId === actor.id, "الطلب غير موجود", 404);
      ensure(p.status === "unpaid", "يمكن دفع الطلبات غير المدفوعة فقط");
      ensure(
        !stripePending(p),
        "توجد جلسة Stripe مفتوحة؛ استكملها أو أغلقها أولًا",
      );
      p.stripe = {
        attempt,
        expires: Date.now() + 35 * 60_000,
        currency: options.currency,
        fee: options.fee,
        total: p.amount + options.fee,
      };
      return structuredClone(p);
    });
    reservation = { paymentId: payment.id, attempt };
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        allowed_payment_method_types: ["card"],
        adaptive_pricing: { enabled: false },
        client_reference_id: payment.id,
        metadata: { paymentId: payment.id, attempt },
        expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
        success_url: `${origin}/?payment=${payment.id}&stripe=success`,
        cancel_url: `${origin}/?payment=${payment.id}&stripe=cancel`,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: options.currency,
              unit_amount: payment.amount,
              product_data: { name: payment.reason },
            },
          },
          {
            quantity: 1,
            price_data: {
              currency: options.currency,
              unit_amount: options.fee,
              product_data: { name: "رسوم الدفع الإضافية — 2.50 USD" },
            },
          },
        ],
      },
      { idempotencyKey: attempt },
    );
    await mutate((state) => {
      const p = state.payments.find((p) => p.id === payment.id);
      ensure(p?.stripe?.attempt === attempt, "تغيرت جلسة الدفع");
      p.stripe.sessionId = session.id;
    });
    reservation = undefined;
    return Response.json({ url: session.url });
  } catch (error) {
    // Keep uncertain sessions locked until expiry to prevent duplicate charging.
    if (reservation && error instanceof Stripe.errors.StripeInvalidRequestError)
      await mutate((state) => {
        const p = state.payments.find((p) => p.id === reservation!.paymentId);
        if (p?.stripe?.attempt === reservation!.attempt && !p.stripe.sessionId)
          p.stripe = undefined;
      });
    return Response.json(
      {
        error:
          error instanceof AppError
            ? error.message
            : "تعذر الاتصال ببوابة الدفع؛ حاول لاحقًا",
      },
      { status: error instanceof AppError ? error.status : 502 },
    );
  }
}
