import { test } from "node:test";
import assert from "node:assert/strict";
import type { MongoClient } from "mongodb";
import { connection } from "../lib/store";

test("idle MongoDB closes only after all concurrent users release and clears its cache", async (t) => {
  const globals = globalThis as typeof globalThis & {
    mongoV2?: Promise<MongoClient>;
    mongoSchemaV2?: Promise<void>;
    mongoUsers?: number;
    mongoIdleTimer?: ReturnType<typeof setTimeout>;
  };
  const previousUri = process.env.MONGODB_URI;
  process.env.MONGODB_URI = "mongodb://unused.test";
  let closed = 0;
  const fake = {
    db: () => ({}),
    close: async () => {
      closed++;
    },
  } as unknown as MongoClient;
  globals.mongoV2 = Promise.resolve(fake);
  globals.mongoSchemaV2 = Promise.resolve();
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const first = await connection();
    const second = await connection();
    first.release();
    first.release(); // Releasing twice must not close another request's client.
    t.mock.timers.tick(120_000);
    assert.equal(closed, 0);
    second.release();
    t.mock.timers.tick(59_000);
    assert.equal(closed, 0);
    const third = await connection(); // New work cancels the pending idle close.
    t.mock.timers.tick(120_000);
    assert.equal(closed, 0);
    third.release();
    t.mock.timers.tick(60_000);
    await Promise.resolve();
    assert.equal(closed, 1);
    assert.equal(globals.mongoV2, undefined);
    assert.equal(globals.mongoSchemaV2, undefined);
    assert.equal(globals.mongoUsers, 0);
  } finally {
    clearTimeout(globals.mongoIdleTimer);
    delete globals.mongoV2;
    delete globals.mongoSchemaV2;
    delete globals.mongoUsers;
    delete globals.mongoIdleTimer;
    if (previousUri === undefined) delete process.env.MONGODB_URI;
    else process.env.MONGODB_URI = previousUri;
    t.mock.timers.reset();
  }
});
