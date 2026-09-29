import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const base = process.env.TEST_BASE_URL || 'http://localhost:3000';
const browser = await chromium.launch();
const page = await browser.newPage();
try {
  await page.goto(base);
  await page.locator('input[type=tel]').fill('+905374778847');
  await page.locator('input[type=password]').fill('mjd123');
  await page.locator('form button').first().click();
  await page.locator('.app-shell').waitFor({ timeout: 15000 });
  const response = await page.request.get(base + '/api/app');
  const data = await response.json();
  assert.equal(data.me.name, 'سامح');
  assert.equal(data.me.role, 'admin');
  assert.equal(data.users.length, 6);
  assert.equal(data.payments.length, 0);
  assert.ok(data.users.every(u => u.balance === 0));
  await page.request.post(base + '/api/app', { headers: { Origin: base }, data: { action: 'logout' } });
  console.log('PASS: production browser login, admin permissions, six accounts and clean initial balances.');
} finally {
  await browser.close();
}
