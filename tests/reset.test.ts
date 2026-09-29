import { test } from "node:test";
import assert from "node:assert/strict";
import { seed, verifyPassword } from "../lib/model";
import { canReset, resetState } from "../lib/reset";
test("reset is exclusive to Majd even among admins and needs password and confirmation", () => {
  const state = seed();
  const original = structuredClone(state);
  assert.equal(canReset(state.users[0]), true);
  assert.equal(canReset(state.users[5]), false);
  assert.throws(() =>
    resetState(state, state.users[5], "mjd123", "إعادة تعيين كل شيء"),
  );
  assert.throws(() =>
    resetState(state, state.users[0], "wrong", "إعادة تعيين كل شيء"),
  );
  assert.throws(() => resetState(state, state.users[0], "mjd123", "yes"));
  assert.deepEqual(state, original);
});
test("reset clears all operational data and restores six clean accounts and both admins", () => {
  const state = seed();
  state.users[0].iban = "old";
  state.users[0].avatar = "old";
  state.sessions.push({
    hash: "old",
    userId: "1",
    expires: Date.now() + 10000,
  });
  state.notices.push({
    id: "old",
    userId: "1",
    paymentId: "old",
    text: "old",
    read: false,
    createdAt: "",
  });
  state.attempts.x = { count: 2, until: 100 };
  state.audit.push({ actor: "1", action: "old", target: "old", at: "" });
  state.files.push({
    id: "old",
    key: "old",
    ownerId: "1",
    kind: "avatar",
    name: "old",
    type: "image/png",
  });
  resetState(state, state.users[0], "mjd123", "إعادة تعيين كل شيء");
  assert.equal(state.users.length, 6);
  assert.equal(state.users.filter((u) => u.role === "admin").length, 2);
  assert.ok(
    state.users.every(
      (u) =>
        !u.iban &&
        !u.bankName &&
        !u.avatar &&
        verifyPassword("mjd123", u.password),
    ),
  );
  for (const key of [
    "payments",
    "notices",
    "sessions",
    "files",
    "audit",
  ] as const)
    assert.equal(state[key].length, 0);
  assert.deepEqual(state.attempts, {});
});
