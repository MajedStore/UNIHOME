import { limitedBody } from "@/lib/body";
import { mutate } from "@/lib/store";
import { fulfillStripe, stripeClient } from "@/lib/stripe";
import type Stripe from "stripe";
export const runtime = "nodejs";
export async function POST(request: Request) {
  let event: Stripe.Event;
  try {
    if (!process.env.STRIPE_WEBHOOK_SECRET)
      return Response.json({ error: "Webhook unavailable" }, { status: 503 });
    event = stripeClient().webhooks.constructEvent(
      await limitedBody(request, 1024 * 1024),
      request.headers.get("stripe-signature") || "",
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch {
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }
  try {
    if (
      [
        "checkout.session.completed",
        "checkout.session.async_payment_succeeded",
      ].includes(event.type)
    ) {
      // Retrieve authoritative amounts (including when an event uses another API version).
      const session = await stripeClient().checkout.sessions.retrieve(
        (event.data.object as Stripe.Checkout.Session).id,
      );
      await mutate((state) => fulfillStripe(state, session));
    }
    return Response.json({ received: true });
  } catch {
    return Response.json(
      { error: "Payment confirmation temporarily unavailable" },
      { status: 500 },
    );
  }
}
