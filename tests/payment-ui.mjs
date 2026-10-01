import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.setDefaultTimeout(10000);
const me = {
  id: "1",
  name: "مجد الدين",
  phone: "+905343344584",
  role: "admin",
  iban: "TR330006100519786457841326",
  bankName: "MAJD",
  balance: 12000,
};
const payment = {
  id: "test",
  batch: "batch",
  userId: "1",
  amount: 12000,
  reason: "فاتورة الكهرباء",
  status: "unpaid",
  bankName: "SAMEH",
  iban: me.iban,
  createdAt: new Date().toISOString(),
};
const state = {
  me,
  users: [me],
  payments: [payment],
  notices: [],
  currency: "TRY",
  demo: true,
  stripe: { enabled: true, fee: 10000, currency: "try" },
};
let deleted = false;
await page.route("**/api/app", async (route) => {
  if (route.request().method() === "POST") {
    const input = route.request().postDataJSON();
    if (input.action === "delete") {
      deleted = true;
      state.payments = [];
    }
    await route.fulfill({ json: { ok: true } });
  } else await route.fulfill({ json: state });
});
try {
  await page.goto(process.env.TEST_BASE_URL || "http://localhost:3005");
  await page.locator(".payment-row").waitFor();
  const icons = page.locator('.payment-buttons button');
  for (const icon of await icons.all()) {
    assert.equal((await icon.innerText()).trim(), '');
    assert.ok((await icon.boundingBox()).width <= 44);
  }
  const receipt = page.getByLabel("رفع وصل الدفع");
  assert.equal(await receipt.count(), 1);
  const receiptBox = await receipt.boundingBox();
  assert.ok(receiptBox.height >= 40);
  await page
    .getByRole("button", { name: "حوّلت المبلغ، تنبيه المسؤول", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "الدفع عبر Stripe", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "اختر طريقة الدفع" });
  await dialog.waitFor();
  assert.equal(await dialog.getByText("رسوم إضافية: 1.75 دولار").count(), 1);
  assert.equal(await dialog.locator(".stripe-summary").count(), 3);
  await dialog
    .getByRole("button", { name: "المتابعة إلى Stripe ودفع الإجمالي" })
    .waitFor();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await dialog.getByRole("button", { name: "إغلاق", exact: true }).click();
  state.stripe.enabled = false;
  await page.reload();
  await page.getByRole('button', { name: 'الدفع عبر Stripe', exact: true }).click();
  await page.getByRole('dialog').getByRole('status').waitFor();
  assert.equal(await page.getByRole('button', { name: 'المتابعة إلى Stripe ودفع الإجمالي' }).count(), 0);
  await page.getByRole('dialog').getByRole('button', { name: 'إغلاق', exact: true }).click();
  state.stripe.enabled = true;
  payment.status = "cancelled";
  me.balance = 0;
  await page.reload();
  await page.getByRole("button", { name: /^ملغى/ }).click();
  await page.getByRole("button", { name: "حذف نهائي", exact: true }).click();
  await page
    .getByRole("dialog", { name: "حذف الطلب نهائيًا" })
    .getByRole("button", { name: "تأكيد الحذف النهائي" })
    .click();
  await page.locator(".payment-row").waitFor({ state: "hidden" });
  assert.equal(deleted, true);
  console.log(
    "PASS: mobile actions, accessible upload, Stripe fee preview, and permanent deletion confirmation.",
  );
} catch (error) {
  console.error(await page.locator("body").innerText());
  throw error;
} finally {
  await browser.close();
}
