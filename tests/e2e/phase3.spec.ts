import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { createCompany, resetEmulators, signUp } from './helpers';

test.beforeEach(async () => {
  await resetEmulators();
});

async function inviteStoreOfficer(page: Page, email: string): Promise<string> {
  await page
    .getByRole('navigation', { name: 'Company' })
    .getByRole('link', { name: 'Users' })
    .click();
  await page.getByRole('button', { name: 'Invite user' }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel(/Store Officer/).check();
  await page.getByRole('button', { name: 'Create invitation' }).click();
  const link = await page.getByRole('textbox', { name: 'Invitation link' }).inputValue();
  await page.getByRole('button', { name: 'Done' }).click();
  return new URL(link).pathname + new URL(link).search;
}

async function approve(page: Page, companyId: string, number: string) {
  await page.goto(`/c/${companyId}/stock-adjustments`);
  await page.getByRole('link', { name: number }).click();
  await page.getByRole('button', { name: 'Approve and post' }).click();
  await page.getByLabel('Reason').fill('Checked against the count sheet');
  await page.getByRole('dialog').getByRole('button', { name: 'Approve and post' }).click();
  await expect(page.getByText('posted', { exact: true })).toBeVisible();
}

test('S1–S5 store workflow: product, opening stock, approval, count, stock card', async ({
  page,
  browser,
}) => {
  // Owner sets up a product and invites a store officer
  await signUp(page, 'Ada Owner', 'owner@example.test');
  const companyId = await createCompany(page);
  const nav = page.getByRole('navigation', { name: 'Company' });
  await nav.getByRole('link', { name: 'Products' }).click();
  await page.getByRole('button', { name: 'New product' }).click();
  await page.getByLabel('SKU').fill('RICE-50');
  await page.getByLabel('Name').fill('Rice 50kg bag');
  await page.getByLabel('Unit').selectOption('bag');
  await page.getByLabel(/Selling price/).fill('78000');
  await page.getByLabel(/Reorder level/).fill('5');
  await page.getByRole('button', { name: 'Save' }).click();
  const products = page.getByRole('table', { name: 'Products' });
  await expect(products.getByRole('row', { name: /RICE-50/ })).toContainText('78,000.00');
  const invitePath = await inviteStoreOfficer(page, 'store@example.test');

  // Store officer joins and records opening stock
  const storeCtx = await browser.newContext();
  const store = await storeCtx.newPage();
  await signUp(store, 'Sola Store', 'store@example.test', 'CorrectHorse9!', invitePath);
  await store.getByRole('button', { name: 'Accept invitation' }).click();
  await expect(store.getByRole('heading', { name: /Welcome, Sola Store/ })).toBeVisible();
  await store.goto(`/c/${companyId}/stock-adjustments/new`);
  await store.getByLabel('Type').selectOption({ label: 'Opening stock' });
  await store.getByLabel('Reason').fill('Stock on hand at go-live');
  await store.getByLabel('Line 1 product').selectOption({ label: 'RICE-50 · Rice 50kg bag' });
  await store.getByLabel('Line 1 quantity').fill('20');
  await store.getByLabel('Line 1 unit cost').fill('65000');
  await store.getByRole('button', { name: 'Send for approval' }).click();
  await expect(store.getByRole('heading', { name: /Opening stock OST-000001/ })).toBeVisible();
  await expect(store.getByText('Waiting for another person with approval rights.')).toBeVisible();
  await expect(store.getByRole('button', { name: 'Approve and post' })).toHaveCount(0);

  // Owner approves; stock and ledger move together
  await approve(page, companyId, 'OST-000001');
  await page.getByRole('link', { name: 'View journal' }).click();
  const lines = page.getByRole('table', { name: 'Journal lines' });
  await expect(lines.getByRole('row', { name: /1300 Inventory/ })).toContainText('1,300,000.00');
  await expect(lines.getByRole('row', { name: /3300 Opening balance equity/ })).toContainText(
    '1,300,000.00',
  );

  // Store officer counts 18 bags; the system works out the shortfall
  await store.goto(`/c/${companyId}/stock-adjustments/new`);
  await store.getByLabel('Type').selectOption({ label: 'Stock count' });
  await store.getByLabel('Reason').fill('Month-end count');
  await store.getByLabel('Line 1 product').selectOption({ label: 'RICE-50 · Rice 50kg bag' });
  await expect(store.getByRole('table', { name: 'Adjustment lines' })).toContainText('20');
  await store.getByLabel('Line 1 quantity').fill('18');
  await store.getByRole('button', { name: 'Send for approval' }).click();
  await expect(store.getByRole('heading', { name: /Stock count CNT-000001/ })).toBeVisible();
  await expect(store.getByRole('table', { name: 'Adjustment lines' })).toContainText('-2');

  await approve(page, companyId, 'CNT-000001');
  await expect(page.getByRole('table', { name: 'Adjustment lines' })).toContainText('130,000.00');

  // Stock card: 18 bags at 65,000 average
  await page.goto(`/c/${companyId}/products`);
  await products.getByRole('link', { name: 'RICE-50' }).click();
  const byLocation = page.getByRole('table', { name: 'Stock by location' });
  await expect(byLocation.getByRole('row', { name: /Store/ })).toContainText('18');
  await expect(byLocation.getByRole('row', { name: /Store/ })).toContainText('1,170,000.00');
  const movements = page.getByRole('table', { name: 'Stock movements' });
  await expect(movements.getByRole('row')).toHaveCount(3);
  await expect(movements.getByRole('row', { name: /CNT-000001/ })).toContainText('-2');

  // Costing method is locked after the first stock posting
  await page.goto(`/c/${companyId}/settings`);
  await expect(page.getByLabel('Costing method')).toBeDisabled();

  const a11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(a11y.violations).toEqual([]);
  await storeCtx.close();
});

test('@mobile stock adjustment entry fits a phone screen', async ({ page }) => {
  await signUp(page, 'Ada Owner', 'owner@example.test');
  const companyId = await createCompany(page);
  await page.goto(`/c/${companyId}/stock-adjustments/new`);
  await expect(page.getByLabel('Line 1 product')).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
