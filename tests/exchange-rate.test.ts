import { test } from "node:test";
import assert from "node:assert/strict";
import { createExchangeRateReader } from "../lib/exchange-rate";

const start = Date.parse("2026-10-01T12:00:00Z");
const hour = 3600_000;
test("rates are shared across concurrent requests, cached hourly, and refreshed", async () => {
  let time = start,
    calls = 0;
  const reader = createExchangeRateReader(
    async (url) => {
      assert.match(String(url), /\/USD\/TRY$/);
      calls++;
      return Response.json({
        base: "USD",
        quote: "TRY",
        rate: 40 + calls,
        date: "2026-10-01",
      });
    },
    () => time,
  );
  const results = await Promise.all([reader("try"), reader("TRY")]);
  assert.equal(calls, 1);
  assert.equal(results[0]?.rate, 41);
  assert.equal(results[1]?.rate, 41);
  await reader("TRY");
  assert.equal(calls, 1);
  time += hour;
  assert.equal((await reader("TRY"))?.rate, 42);
  assert.equal(calls, 2);
  assert.equal((await reader("USD"))?.rate, 1);
  assert.equal(await reader("INVALID"), null);
  assert.equal(calls, 2);
});
test("outages use recent cached rates, throttle retries, and stop after 24 hours", async () => {
  let time = start,
    calls = 0;
  const reader = createExchangeRateReader(
    async () => {
      if (++calls > 1) throw new Error("offline");
      return Response.json({
        base: "USD",
        quote: "TRY",
        rate: 40,
        date: "2026-10-01",
      });
    },
    () => time,
  );
  await reader("TRY");
  time += hour;
  assert.equal((await reader("TRY"))?.rate, 40);
  assert.equal((await reader("TRY"))?.rate, 40);
  assert.equal(calls, 2);
  time = start + 24 * hour;
  assert.equal(await reader("TRY"), null);
});
test("invalid, stale, future, wrong-currency and unsuccessful responses fail closed", async () => {
  const valid = { base: "USD", quote: "TRY", rate: 40, date: "2026-10-01" };
  for (const change of [
    { rate: 0 },
    { rate: -5 },
    { rate: "40" },
    { quote: "EUR" },
    { base: "EUR" },
    { date: "2026-09-01" },
    { date: "2026-10-02" },
    { date: "invalid" },
  ]) {
    const reader = createExchangeRateReader(
      async () => Response.json({ ...valid, ...change }),
      () => start,
    );
    assert.equal(await reader("TRY"), null);
  }
  const reader = createExchangeRateReader(
    async () => new Response("error", { status: 503 }),
    () => start,
  );
  assert.equal(await reader("TRY"), null);
});
