import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const base = process.env.TEST_BASE_URL || "http://localhost:3001";
const browser = await chromium.launch({ headless: true });
const admin = await browser.newContext({
  viewport: { width: 1440, height: 1080 },
});
const member = await browser.newContext({
  viewport: { width: 390, height: 844 },
});
const third = await browser.newContext();
const a = await admin.newPage();
const m = await member.newPage();
a.setDefaultTimeout(15000);
m.setDefaultTimeout(15000);
const errors = [];
[a, m].forEach((p) => p.on("pageerror", (e) => errors.push(e.message)));
async function api(context, input, expected = 200) {
  const response = await context.request.post(base + "/api/app", {
    data: input,
    headers: { Origin: base },
  });
  assert.equal(response.status(), expected, await response.text());
  return response.json();
}
async function state(context) {
  return (await context.request.get(base + "/api/app")).json();
}
async function ready(page) {
  await page.waitForSelector(".app-shell");
}
try {
  await mkdir("test-results", { recursive: true });
  await a.goto(base);
  await a.getByRole("heading", { name: "أهلًا بك في بيتك" }).waitFor();
  await a.screenshot({
    path: "test-results/login-desktop.png",
    fullPage: true,
  });
  await a.getByLabel("رقم الهاتف", { exact: true }).fill("+905374778847");
  await a.getByLabel("كلمة المرور", { exact: true }).fill("mjd123");
  await a.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await ready(a);
  await a.getByRole("heading", { name: "لنُكمل بياناتك أولًا" }).waitFor();
  await a.getByLabel("اسم صاحب الحساب", { exact: true }).fill("SAMEH");
  await a
    .getByLabel("رقم الآيبان (IBAN)", { exact: true })
    .fill("TR330006100519786457841326");
  await a.getByRole("button", { name: "حفظ البيانات" }).click();
  await a.getByRole("heading", { name: /أهلًا بك، سامح/ }).waitFor();
  await a.getByRole("button", { name: "لوحة التحكم", exact: true }).click();
  await a.getByRole("button", { name: "إنشاء طلب", exact: true }).click();
  await a.getByLabel("المبلغ الإجمالي (TRY)", { exact: true }).fill("100.00");
  await a.getByLabel("سبب الطلب", { exact: true }).fill("كهرباء سبتمبر");
  await a.getByLabel("التحويل إلى", { exact: true }).selectOption("6");
  await a.getByRole("button", { name: "إنشاء الطلب وتوزيع المبلغ" }).click();
  await a.getByRole("dialog").waitFor({ state: "hidden" });
  let s = await state(admin);
  assert.equal(s.payments.length, 6);
  assert.equal(
    s.payments.reduce((n, p) => n + p.amount, 0),
    10000,
  );
  await m.goto(base);
  await m.getByLabel("رقم الهاتف", { exact: true }).fill("+905343344584");
  await m.getByLabel("كلمة المرور", { exact: true }).fill("mjd123");
  await m.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await ready(m);
  await m.getByLabel("اسم صاحب الحساب", { exact: true }).fill("MAJD");
  await m
    .getByLabel("رقم الآيبان (IBAN)", { exact: true })
    .fill("TR330006100519786457841326");
  await m.getByRole("button", { name: "حفظ البيانات" }).click();
  await m.getByRole("button", { name: "دفع", exact: true }).waitFor();
  const mine = (await state(member)).payments[0];
  assert.equal((await state(member)).users.length, 1);
  await api(
    member,
    {
      action: "create",
      amount: "10",
      reason: "forbidden",
      userIds: ["1"],
      recipientId: "6",
    },
    403,
  );
  await api(
    member,
    { action: "submit", id: s.payments.find((p) => p.userId === "2").id },
    403,
  );
  const cross = await member.request.post(base + "/api/app", {
    data: { action: "submit", id: mine.id },
    headers: { Origin: "https://other.example" },
  });
  assert.equal(cross.status(), 403);
  const uploaded = await member.request.post(base + "/api/files", {
    headers: { Origin: base },
    multipart: {
      kind: "receipt",
      paymentId: mine.id,
      file: {
        name: "receipt.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("%PDF-1.4\n%%EOF"),
      },
    },
  });
  assert.equal(uploaded.status(), 200, await uploaded.text());
  const fileId = (await uploaded.json()).id;
  await api(third, {
    action: "login",
    phone: "+905364305473",
    password: "mjd123",
  });
  assert.equal(
    (await third.request.get(base + "/api/files?id=" + fileId)).status(),
    403,
  );
  assert.equal(
    (await admin.request.get(base + "/api/files?id=" + fileId)).status(),
    200,
  );
  await m.reload();
  await ready(m);
  await m.getByRole("button", { name: "دفع", exact: true }).click();
  await m.getByRole("dialog").getByText("SAMEH", { exact: true }).waitFor();
  await m.getByRole("button", { name: "حوّلت المبلغ، تنبيه المسؤول" }).click();
  await m.getByRole("button", { name: "نعم، أرسل التنبيه" }).click();
  await m.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal((await state(member)).me.balance, 1667);
  await a.reload();
  await ready(a);
  await a.getByRole("button", { name: /الإشعارات،/ }).click();
  await a.getByRole("button", { name: /مجد الدين طلب تأكيد الدفع/ }).click();
  await a.getByRole("heading", { name: /حساب مجد الدين/ }).waitFor();
  await a.getByRole("button", { name: "رفض التأكيد", exact: true }).click();
  await a.getByLabel("سبب الرفض", { exact: true }).fill("لم يصل التحويل بعد");
  await a.getByRole("button", { name: "رفض التأكيد وإرسال السبب" }).click();
  await a.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal((await state(member)).payments[0].status, "unpaid");
  await api(member, { action: "submit", id: mine.id });
  await a.reload();
  await ready(a);
  await a.getByRole("button", { name: "لوحة التحكم", exact: true }).click();
  await a
    .locator('[id="' + mine.id + '"]')
    .getByRole("button", { name: "تأكيد الدفع", exact: true })
    .click();
  await a.getByRole("status").filter({ hasText: "تم تأكيد الدفعة" }).waitFor();
  assert.equal((await state(member)).me.balance, 0);
  await api(admin, { action: "approve", id: mine.id }, 400);
  const other = (await state(admin)).payments.find((p) => p.userId === "2");
  await api(admin, {
    action: "edit",
    id: other.id,
    amount: "5.25",
    reason: "تصحيح قيمة الفاتورة",
  });
  assert.equal(
    (await state(admin)).users.find((u) => u.id === "2").balance,
    525,
  );
  await api(admin, { action: "cancel", id: other.id });
  assert.equal((await state(admin)).users.find((u) => u.id === "2").balance, 0);
  await a.reload();
  await ready(a);
  await a.getByRole("button", { name: "لوحة التحكم", exact: true }).click();
  await a.screenshot({
    path: "test-results/admin-desktop.png",
    fullPage: true,
  });
  await m.reload();
  await ready(m);
  await m.screenshot({
    path: "test-results/member-mobile.png",
    fullPage: true,
  });
  assert.equal(
    await m.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
  );
  await a.setViewportSize({ width: 390, height: 844 });
  await a.screenshot({ path: "test-results/admin-mobile.png", fullPage: true });
  assert.equal(
    await a.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
  );
  await api(member, {
    action: "password",
    current: "mjd123",
    password: "updated123",
  });
  await api(third, { action: "logout" });
  await api(
    third,
    { action: "login", phone: "+905343344584", password: "mjd123" },
    401,
  );
  await api(third, {
    action: "login",
    phone: "+905343344584",
    password: "updated123",
  });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: login, onboarding, allocation, ownership, CSRF, receipt privacy, review/rejection/approval, notices, edits/cancellation, password change and mobile layout.",
  );
} catch (error) {
  await a.screenshot({
    path: "test-results/failure-admin.png",
    fullPage: true,
  });
  await m.screenshot({
    path: "test-results/failure-member.png",
    fullPage: true,
  });
  throw error;
} finally {
  await browser.close();
}
