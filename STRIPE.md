# Stripe payments

Set these server environment variables (never add real secrets to Git):

- `APP_ORIGIN`: optional fixed site origin, without a trailing slash. When omitted, Checkout returns to the current request's origin after the server verifies it matches the site's host. This supports both localhost and the deployed domain without hiding Stripe when this variable is absent.
- `STRIPE_SECRET_KEY`: the Stripe account's test or live secret key.
- `STRIPE_WEBHOOK_SECRET`: signing secret for this site's webhook endpoint.
- `APP_CURRENCY`: `TRY` (default), `USD`, `EUR`, or `GBP`.
- Exchange rates are automatic: `STRIPE_USD_EXCHANGE_RATE` is no longer required and any old value is ignored. The extra USD 2.15 is converted to the app currency using [Frankfurter's daily reference rates](https://frankfurter.dev/), rounded to the nearest minor unit. No exchange-rate API key is needed. The entire payment is charged in the app currency.

The server checks for new rates on demand at most once per hour per running process. A validated cached rate can be reused for up to 24 hours during an outage, and source dates older than seven days are rejected (weekends and holidays can retain the previous business day's rate). Failed lookups retry after one minute. Without a usable rate, new Stripe payments are unavailable; existing payments can still be verified and webhooks still confirm them. Checkout freezes the fee when the session is created. If the displayed fee changes before checkout, the user must refresh and review the new total. These are reference rates, not live trading quotes or Stripe's settlement conversion rates.

Create a Stripe webhook endpoint at `https://YOUR-SITE/api/stripe/webhook`, subscribing to `checkout.session.completed` and `checkout.session.async_payment_succeeded`. Use the matching test/live signing secret. Checkout accepts cards; the order is marked paid only after server-side verification of the session, currency, and total. Both the signed webhook and the return from Checkout use the same idempotent confirmation logic. See [Stripe's fulfillment guide](https://docs.stripe.com/payments/checkout/fulfill-orders).

The payment dialog shows the original amount, additional fee, and total before redirecting. Checkout uses the account belonging to the configured secret key: funds go to that Stripe account, rather than the bank beneficiary stored in the order. Transferring funds to individual beneficiaries is a separate Stripe Connect integration.

Open sessions prevent edits, cancellation, and manual confirmation to avoid conflicting payments. The payer can check or close a session in the payment dialog. An uncertain network result keeps the order reserved briefly to prevent duplicate charging. Stripe Checkout expires after about 31 minutes. Existing sessions must be checked or closed before using another payment method.

The electronic payment icon is always shown on the payer's unpaid orders. Checkout requires Stripe credentials and an available exchange rate; if unavailable, the payment dialog explains this. Live card payments and webhook delivery require testing with your own Stripe account; unit tests do not contact Stripe.

For local webhook testing, forward events with the Stripe CLI:

```sh
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Use the signing secret printed by the CLI and Stripe test credentials. Verify successful payments, cancelled Checkout, repeated webhook delivery, and rejected signatures before switching to live credentials.

Permanent deletion is restricted to admins and supports every order status, including completed payments. Unresolved Stripe sessions must be closed or verified first. Deletion does not refund a payment. It removes uploaded receipt objects first, then deletes the order, related file records, notices, and audit records. Storage failures leave the order locked against new payments or edits and available for deletion retry. Shared batch creation records remain while other orders in that batch still exist. External Stripe records and already delivered browser push messages are managed by those external services.
