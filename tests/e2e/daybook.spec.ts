import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { createCompany, fundMoneyAccounts, resetEmulators, signUp } from './helpers';
import { newCustomer, stockedRice } from './sales-helpers';

test.beforeEach(async () => {
  await resetEmulators();
});

test('D1 day book lists the day’s vouchers with filters and drill-down', async ({ page }) => {
  await signUp(page, 'Ada Owner', 'owner@example.test');
  const companyId = await createCompany(page);
  await fundMoneyAccounts(companyId);

  // Three kinds of voucher today: goods received, a credit sale and a manual journal
  await stockedRice(page, companyId);
  await newCustomer(page, companyId, 'BOLA', '50000');
  await page.goto(`/c/${companyId}/sales/new`);
  await page.getByLabel('Customer').selectOption({ label: 'BOLA · BOLA Stores' });
  await page.getByLabel('Line 1 product').selectOption({ label: 'RICE-50 · Rice 50kg bag' });
  await page.getByLabel('Line 1 quantity').fill('3');
  await page.getByRole('button', { name: 'Complete sale' }).click();
  await expect(page.getByRole('heading', { name: 'Sale SI-000001' })).toBeVisible();

  await page.goto(`/c/${companyId}/journals/new`);
  await page.getByLabel('Description').fill('Office rent for November');
  await page.getByLabel('Line 1 account').selectOption({ label: '6200 · Rent' });
  await page.getByLabel('Line 1 debit').fill('1250.50');
  await page.getByLabel('Line 2 account').selectOption({ label: '1110 · Cash on hand' });
  await page.getByLabel('Line 2 credit').fill('1250.50');
  await page.getByRole('button', { name: 'Post journal' }).click();
  await expect(page.getByRole('heading', { name: 'Journal JV-000001' })).toBeVisible();

  // The day book opens on today with every voucher, oldest first
  const nav = page.getByRole('navigation', { name: 'Company' });
  await nav.getByRole('link', { name: 'Day book' }).click();
  await expect(page.getByRole('heading', { name: 'Day book' })).toBeVisible();
  const book = page.getByRole('table', { name: 'Day book' });
  const rows = book.getByTestId('daybook-row');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText('Goods received');
  await expect(rows.nth(0)).toContainText('GRN-000001');
  await expect(rows.nth(1)).toContainText('Sales');
  await expect(rows.nth(1)).toContainText('SI-000001');
  await expect(rows.nth(2)).toContainText('Journal');
  await expect(rows.nth(2)).toContainText('Office rent for November');
  await expect(book.getByRole('row', { name: /6200 Rent/ })).toContainText('1,250.50');
  const debit = await page.getByTestId('daybook-debit').textContent();
  await expect(page.getByTestId('daybook-credit')).toHaveText(debit ?? '');
  await expect(page.getByTestId('daybook-count')).toHaveText('3');

  const axe = await new AxeBuilder({ page }).include('main').analyze();
  expect(axe.violations).toEqual([]);

  // Vouchers only: one line per voucher with its amount
  await page.getByLabel('View').selectOption('condensed');
  await expect(book.getByRole('row', { name: /6200 Rent/ })).toHaveCount(0);
  await expect(rows.nth(2)).toContainText('1,250.50');

  // Filter by voucher type
  await page.getByLabel('Voucher type').selectOption({ label: 'Sales' });
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('SI-000001');
  await expect(page).toHaveURL(/type=sales/);

  // Drill down to the sale, then come back with the filters kept
  await rows.first().getByRole('link', { name: 'SI-000001' }).click();
  await expect(page.getByRole('heading', { name: 'Sale SI-000001' })).toBeVisible();
  await page.goBack();
  await expect(page.getByLabel('Voucher type')).toHaveValue('sales');
  await expect(rows).toHaveCount(1);

  // The journal number opens the journal behind the voucher
  await rows.first().getByTitle('Open the journal').click();
  await expect(page.getByRole('heading', { name: /^Journal / })).toBeVisible();
  await page.goBack();

  // Yesterday had nothing posted
  await page.getByLabel('Voucher type').selectOption({ label: 'All vouchers' });
  await page.getByRole('button', { name: 'Previous day' }).click();
  await expect(page.getByText('Nothing posted')).toBeVisible();
  await page.getByRole('button', { name: 'Today' }).click();
  await expect(rows).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'Print or save PDF' })).toBeEnabled();
});
