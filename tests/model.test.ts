import { test } from "node:test";
import assert from "node:assert/strict";
import {
  balance,
  cents,
  createPayments,
  phoneNumber,
  seed,
  transition,
  validIban,
  verifyPassword,
} from "../lib/model";
const iban = "TR330006100519786457841326";
function fixture() {
  const state = seed();
  state.users[5].iban = iban;
  state.users[5].bankName = "SAMEH";
  return { state, admin: state.users[5], member: state.users[0] };
}
test("six specified accounts, one admin, hashed initial passwords and normalized phones", () => {
  const { state } = fixture();
  assert.equal(state.users.length, 6);
  assert.equal(state.users.filter((u) => u.role === "admin").length, 1);
  assert.equal(state.users[5].name, "سامح");
  assert.ok(verifyPassword("mjd123", state.users[0].password));
  assert.notEqual(state.users[0].password, "mjd123");
  assert.equal(phoneNumber("+90 536 430 54 73"), state.users[1].phone);
  assert.equal(phoneNumber("05364305473"), state.users[1].phone);
});
test("exact equal splits preserve every cent and bank snapshot", () => {
  const { state, admin } = fixture();
  createPayments(state, admin, {
    amount: "100.00",
    reason: "كهرباء",
    userIds: state.users.map((u) => u.id),
    recipientId: admin.id,
  });
  assert.equal(
    state.payments.reduce((sum, p) => sum + p.amount, 0),
    10000,
  );
  assert.deepEqual(
    state.payments.map((p) => p.amount).sort(),
    [1666, 1666, 1667, 1667, 1667, 1667],
  );
  admin.iban = "changed";
  assert.ok(state.payments.every((p) => p.iban === iban));
  assert.equal(balance(state), 10000);
});
test("review retains debt, rejection allows resubmission, approval clears it once", () => {
  const { state, admin, member } = fixture();
  createPayments(state, admin, {
    amount: "60",
    reason: "مياه",
    userIds: [member.id],
    recipientId: admin.id,
  });
  const p = state.payments[0];
  transition(state, member, p.id, "submit");
  assert.equal(balance(state, member.id), 6000);
  assert.throws(() => transition(state, member, p.id, "submit"));
  transition(state, admin, p.id, "reject", "التحويل لم يصل");
  assert.equal(p.status, "unpaid");
  assert.equal(balance(state, member.id), 6000);
  transition(state, member, p.id, "submit");
  transition(state, admin, p.id, "approve");
  assert.equal(balance(state, member.id), 0);
  assert.throws(() => transition(state, admin, p.id, "approve"));
  assert.throws(() => transition(state, admin, p.id, "cancel"));
  assert.ok(
    state.notices.some(
      (n) => n.userId === member.id && n.text.includes("تم تأكيد"),
    ),
  );
});
test("members cannot create, approve, cancel, or submit another member request", () => {
  const { state, admin, member } = fixture();
  const input = {
    amount: "30",
    reason: "غاز",
    userIds: [member.id],
    recipientId: admin.id,
  };
  assert.throws(() => createPayments(state, member, input));
  createPayments(state, admin, input);
  const p = state.payments[0];
  assert.throws(() => transition(state, state.users[1], p.id, "submit"));
  assert.throws(() => transition(state, member, p.id, "approve"));
  assert.throws(() => transition(state, member, p.id, "cancel"));
});
test("cancellation removes debt and is retained in history", () => {
  const { state, admin, member } = fixture();
  createPayments(state, admin, {
    amount: "42.25",
    reason: "إنترنت",
    userIds: [member.id, member.id],
    recipientId: admin.id,
  });
  assert.equal(state.payments.length, 1);
  transition(state, admin, state.payments[0].id, "cancel");
  assert.equal(balance(state), 0);
  assert.equal(state.payments[0].status, "cancelled");
  assert.equal(state.audit.length, 2);
});
test("invalid money, IBAN and participant data are rejected", () => {
  assert.equal(cents("0.01"), 1);
  for (const amount of ["-1", "0", "NaN", "1.001", "1e3"])
    assert.throws(() => cents(amount));
  assert.ok(validIban(iban));
  assert.equal(validIban(iban.slice(0, -1) + "7"), false);
  const { state, admin } = fixture();
  assert.throws(() =>
    createPayments(state, admin, {
      amount: "1",
      reason: "xx",
      userIds: [],
      recipientId: admin.id,
    }),
  );
  assert.throws(() =>
    createPayments(state, admin, {
      amount: "0.01",
      reason: "xx",
      userIds: ["1", "2"],
      recipientId: admin.id,
    }),
  );
});
