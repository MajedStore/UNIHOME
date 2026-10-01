import { test } from "node:test";
import assert from "node:assert/strict";
import {
  balance,
  createPayments,
  deletePayment,
  seed,
  transition,
} from "../lib/model";

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
test("admins can permanently delete every payment status, including completed payments", () => {
  for (const status of ["unpaid", "review", "paid", "cancelled"] as const) {
    const { state, admin, member, p } = fixture();
    p.status = status;
    assert.throws(() => deletePayment(state, member, p.id));
    deletePayment(state, admin, p.id);
    assert.equal(state.payments.length, 0);
    assert.equal(balance(state), 0);
  }
});
test("deletion locks prevent new changes", () => {
  const { state, admin, member, p } = fixture();
  p.deleting = true;
  assert.throws(() => transition(state, member, p.id, "submit"));
  assert.throws(() => transition(state, admin, p.id, "cancel"));
  deletePayment(state, admin, p.id);
  assert.equal(state.payments.length, 0);
});
