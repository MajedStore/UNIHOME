import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const me = { id:'1', name:'مجد الدين', phone:'+905343344584', role:'member', iban:'', bankName:'', balance:0 };
let failSave = true;
const state = { me, users:[me], payments:[], notices:[], currency:'TRY', demo:true };
await page.route('**/api/app', async route => {
  if (route.request().method() === 'POST') {
    const input = route.request().postDataJSON();
    if (input.action === 'profile') {
      if (failSave) { await route.fulfill({status:400,json:{error:'رقم الآيبان غير صحيح'}}); return; }
      me.iban = input.iban; me.bankName = input.bankName;
    }
    await route.fulfill({json:{ok:true}}); return;
  }
  await route.fulfill({json:state});
});
try {
  await page.goto('http://localhost:3000');
  const dialog = page.getByRole('dialog', {name:'أكمل بيانات حسابك البنكي'});
  await dialog.waitFor();
  await page.keyboard.press('Escape'); assert.equal(await dialog.count(),1);
  await dialog.getByLabel('اسم صاحب الحساب',{exact:true}).fill('MAJD');
  await dialog.getByLabel('رقم الآيبان (IBAN)',{exact:true}).fill('TR330006100519786457841326');
  await dialog.getByRole('button',{name:'حفظ ومتابعة إلى الرئيسية'}).click();
  await dialog.getByRole('alert').waitFor();
  await page.locator('[data-sonner-toast][data-type=error]').waitFor();
  failSave=false;
  await dialog.getByRole('button',{name:'حفظ ومتابعة إلى الرئيسية'}).click();
  await dialog.waitFor({state:'hidden'});
  await page.getByRole('heading',{name:/أهلًا بك، مجد الدين/}).waitFor();
  assert.equal(await page.locator('.stat-card').count(),0);
  assert.equal(await page.locator('.balance-clear').count(),1);
  await page.getByRole('button',{name:'قائمة الحساب'}).click();
  await page.getByRole('button',{name:'الإعدادات',exact:true}).click();
  await page.getByRole('heading',{name:'إعدادات حسابك.'}).waitFor();
  await page.getByLabel('اسم صاحب الحساب',{exact:true}).fill('MAJD UPDATED');
  await page.getByRole('button',{name:'حفظ البيانات',exact:true}).click();
  await page.getByRole('heading',{name:/أهلًا بك، مجد الدين/}).waitFor();
  assert.equal(me.bankName,'MAJD UPDATED');
  state.payments.push({id:'test',userId:'1',amount:12000,reason:'فاتورة الكهرباء',status:'unpaid',bankName:'SAMEH',iban:me.iban,createdAt:new Date().toISOString()});
  await page.reload(); await page.locator('.balance-due').waitFor();
  assert.equal(await page.locator('.stat-card').count(),0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:'test-results/simple-member-mobile.png',fullPage:true});
  console.log('PASS: required onboarding, error toast, save and return home, avatar settings, single balance and debt color, mobile width.');
} finally { await browser.close(); }
