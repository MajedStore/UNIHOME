import Stripe from "stripe";
import { ensure, notify, now, type State } from "./model";
import { usdExchangeRate } from "./exchange-rate";

export function stripeClient() {
  ensure(process.env.STRIPE_SECRET_KEY, "دفع Stripe غير مفعّل", 503);
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}
export async function stripeOptions(readRate = usdExchangeRate) {
  const currency = (process.env.APP_CURRENCY || "TRY").toLowerCase();
  const configured =
    !!process.env.STRIPE_SECRET_KEY && !!process.env.STRIPE_WEBHOOK_SECRET;
  const quote = configured ? await readRate(currency) : null;
  const rate = quote?.rate || 0;
  // This app stores money in hundredths; only supported two-decimal currencies are allowed.
  const fee = Math.round(175 * rate);
  return {
    enabled:
      configured &&
      ["usd", "try", "eur", "gbp"].includes(currency) &&
      Number.isFinite(rate) &&
      rate > 0 &&
      Number.isSafeInteger(fee) &&
      fee > 0,
    currency,
    fee,
    rateDate: quote?.date,
    unavailableReason: !configured
      ? "الدفع الإلكتروني غير مفعّل حاليًا. يرجى التواصل مع المسؤول أو استخدام التحويل البنكي."
      : !quote
        ? "تعذر جلب سعر الصرف حاليًا. حاول مجددًا بعد قليل أو استخدم التحويل البنكي."
        : undefined,
  };
}
export function fulfillStripe(state: State, session: Stripe.Checkout.Session) {
  if (session.payment_status !== "paid") return false;
  const p = state.payments.find((p) => p.id === session.metadata?.paymentId);
  if (!p) return false;
  const checkout = p.stripe;
  ensure(
    checkout &&
      checkout.attempt === session.metadata?.attempt &&
      checkout.sessionId === session.id &&
      session.client_reference_id === p.id &&
      session.currency === checkout.currency &&
      session.amount_total === checkout.total,
    "بيانات الدفع لا تطابق الطلب",
    400,
  );
  if (checkout.paid) return true;
  ensure(p.status === "unpaid", "حالة الطلب لا تسمح بتأكيد الدفع");
  p.status = "paid";
  p.paymentMethod = "stripe";
  p.rejection = undefined;
  checkout.paid = true;
  p.updatedAt = now();
  notify(
    state,
    p.userId,
    p.id,
    "تم الدفع والتأكيد تلقائيًا عبر Stripe: " + p.reason,
  );
  state.users
    .filter((u) => u.role === "admin")
    .forEach((u) =>
      notify(state, u.id, p.id, "تم تأكيد الدفع عبر Stripe: " + p.reason),
    );
  state.audit.push({
    actor: p.userId,
    action: "stripe-paid",
    target: p.id,
    at: now(),
  });
  return true;
}
