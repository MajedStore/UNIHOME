import { test } from "node:test";
import assert from "node:assert/strict";
import type Stripe from "stripe";
import {
  balance,
  createPayments,
  deletePayment,
  seed,
  transition,
} from "../lib/model";
import { fulfillStripe, stripeOptions } from "../lib/stripe";

function fixture() {
  const state = seed(),
    admin = state.users[5],
    member = state.users[2];
  admin.iban = "TR330006100519786457841326";
  admin.bankName = "SAMEH";
  createPayments(state, admin, {
    amount: "20",
    reason: "كهرباء",
    userIds: [member.id],
    recipientId: admin.id,
  });
  const p = state.payments[0];
  return { state, admin, member, p };
}
test("permanent deletion requires an admin and erases related data only", () => {
  const { state, admin, member, p } = fixture();
  transition(state, admin, p.id, "cancel");
  assert.throws(() => deletePayment(state, member, p.id));
  state.files.push({
    id: "receipt",
    key: "receipt",
    ownerId: member.id,
    paymentId: p.id,
    kind: "receipt",
    type: "application/pdf",
    name: "receipt.pdf",
  });
  state.files.push({
    id: "avatar",
    key: "avatar",
    ownerId: member.id,
    kind: "avatar",
    type: "image/png",
    name: "avatar.png",
  });
  deletePayment(state, admin, p.id);
  assert.equal(state.payments.length, 0);
  assert.equal(state.notices.length, 0);
  assert.equal(state.audit.length, 0);
  assert.deepEqual(
    state.files.map((f) => f.id),
    ["avatar"],
  );
});
test("admins can permanently delete every payment status, including completed Stripe payments", () => {
  for (const status of ["unpaid", "review", "paid", "cancelled"] as const) {
    const { state, admin, member, p } = fixture();
    p.status = status;
    if (status === "paid")
      p.stripe = {
        attempt: "done",
        sessionId: "cs_done",
        expires: Date.now() + 10000,
        currency: "try",
        fee: 100,
        total: 2100,
        paid: true,
      };
    assert.throws(() => deletePayment(state, member, p.id));
    deletePayment(state, admin, p.id);
    assert.equal(state.payments.length, 0);
    assert.equal(balance(state), 0);
  }
});
test("deletion waits for unresolved Stripe sessions and deletion locks prevent new changes", () => {
  const { state, admin, member, p } = fixture();
  p.stripe = {
    attempt: "open",
    sessionId: "cs_open",
    expires: Date.now() + 10000,
    currency: "try",
    fee: 100,
    total: 2100,
  };
  assert.throws(() => deletePayment(state, admin, p.id));
  p.stripe = undefined;
  p.deleting = true;
  assert.throws(() => transition(state, member, p.id, "submit"));
  assert.throws(() => transition(state, admin, p.id, "cancel"));
  deletePayment(state, admin, p.id);
  assert.equal(state.payments.length, 0);
});
test("Stripe validates the session and total, confirms once, and blocks conflicting changes", () => {
  const { state, admin, member, p } = fixture();
  p.stripe = {
    attempt: "attempt",
    sessionId: "cs_test",
    expires: Date.now() - 1,
    currency: "usd",
    fee: 215,
    total: 2215,
  };
  const session = {
    id: "cs_test",
    client_reference_id: p.id,
    metadata: { paymentId: p.id, attempt: "attempt" },
    currency: "usd",
    amount_total: 2215,
    payment_status: "paid",
  } as unknown as Stripe.Checkout.Session;
  assert.throws(() => transition(state, admin, p.id, "cancel"));
  assert.throws(() => transition(state, member, p.id, "submit"));
  assert.equal(
    fulfillStripe(state, { ...session, payment_status: "unpaid" }),
    false,
  );
  for (const mismatch of [
    { amount_total: 2000 },
    { currency: "try" },
    { id: "another" },
    { metadata: { paymentId: p.id, attempt: "another" } },
  ])
    assert.throws(() =>
      fulfillStripe(state, {
        ...session,
        ...mismatch,
      } as Stripe.Checkout.Session),
    );
  assert.equal(balance(state), 2000);
  assert.equal(fulfillStripe(state, session), true);
  assert.equal(p.paymentMethod, "stripe");
  assert.equal(balance(state), 0);
  const noticeCount = state.notices.length,
    auditCount = state.audit.length;
  assert.equal(fulfillStripe(state, session), true);
  assert.equal(state.notices.length, noticeCount);
  assert.equal(state.audit.length, auditCount);
});
test("Stripe fee uses automatic rates and disables new checkout when rates are unavailable", async () => {
  const previous = { ...process.env };
  try {
    process.env.STRIPE_SECRET_KEY = "sk_test_placeholder";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_placeholder";
    process.env.APP_ORIGIN = "https://example.com";
    process.env.APP_CURRENCY = "USD";
    assert.equal((await stripeOptions()).fee, 215);
    assert.equal((await stripeOptions()).enabled, true);
    delete process.env.APP_ORIGIN;
    assert.equal((await stripeOptions()).enabled, true);
    process.env.APP_CURRENCY = "TRY";
    delete process.env.STRIPE_USD_EXCHANGE_RATE;
    const quote = async () => ({ rate: 40.25, date: "2026-10-01" });
    assert.equal((await stripeOptions(quote)).fee, 8654);
    assert.equal((await stripeOptions(quote)).enabled, true);
    process.env.STRIPE_USD_EXCHANGE_RATE = "999";
    assert.equal((await stripeOptions(quote)).fee, 8654);
    assert.equal((await stripeOptions(async () => null)).enabled, false);
  } finally {
    for (const key of Object.keys(process.env))
      if (!(key in previous)) delete process.env[key];
    Object.assign(process.env, previous);
  }
});
