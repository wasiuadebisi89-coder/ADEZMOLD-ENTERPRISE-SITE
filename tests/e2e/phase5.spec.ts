import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { createCompany, resetEmulators, signUp } from './helpers';
import { newCustomer, stockedRice } from './sales-helpers';

test.beforeEach(async () => {
  await resetEmulators();
});

test('S1–S5 sales: tax, till sale with change, credit sale, payment and advance', async ({
  page,
}) => {
  await signUp(page, 'Ada Owner', 'owner@example.test');
  const companyId = await createCompany(page);
  const nav = page.getByRole('navigation', { name: 'Company' });

  // Tax code: entered by the company, nothing preset
  await nav.getByRole('link', { name: 'Tax codes' }).click();
  await expect(page.getByText('No tax codes')).toBeVisible();
  await page.getByRole('button', { name: 'New tax code' }).click();
  await page.getByLabel('Code', { exact: true }).fill('VAT');
  await page.getByLabel('Name', { exact: true }).fill('Value added tax');
  await page.getByLabel('Rate (%)').fill('7.5');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('row', { name: /VAT/ })).toContainText('7.5%');

  await stockedRice(page, companyId);

  // Walk-in sale at the till: 2 bags with VAT, paid 3,000 cash, change 850
  await nav.getByRole('link', { name: 'New sale' }).click();
  await page.getByLabel('Line 1 product').selectOption({ label: 'RICE-50 · Rice 50kg bag' });
  await expect(page.getByText('10 bag available')).toBeVisible();
  await expect(page.getByLabel('Line 1 price')).toHaveValue('1000.00');
  await page.getByLabel('Line 1 quantity').fill('2');
  await page.getByLabel('Line 1 tax').selectOption({ label: 'VAT 7.5%' });
  await expect(page.getByTestId('sale-total')).toHaveText(/2,150\.00/);
  await page.getByLabel('Amount received').fill('3000');
  await expect(page.getByTestId('sale-change')).toHaveText(/850\.00/);
  await page.getByRole('button', { name: 'Complete sale' }).click();
  await expect(page.getByRole('heading', { name: 'Sale SI-000001' })).toBeVisible();
  await expect(page.getByTestId('invoice-total')).toHaveText(/2,150\.00/);
  await expect(page.getByTestId('sale-outstanding')).toHaveText(/0\.00/);
  await expect(page.getByText('Walk-in customer').first()).toBeVisible();

  // Credit sale to a customer within their limit
  await newCustomer(page, companyId, 'SHOP', '1000');
  await page.getByRole('link', { name: 'SHOP' }).click();
  await page
    .getByRole('link', { name: 'New sale' })
    .and(page.locator('[href*="customer="]'))
    .click();
  await expect(page.getByLabel('Customer')).toHaveValue(/.+/);
  await page.getByLabel('Line 1 product').selectOption({ label: 'RICE-50 · Rice 50kg bag' });
  await expect(page.getByText('1,000.00 will be owed by SHOP Stores')).toBeVisible();
  await page.getByRole('button', { name: 'Complete sale' }).click();
  await expect(page.getByRole('heading', { name: 'Sale SI-000002' })).toBeVisible();
  await expect(page.getByTestId('sale-outstanding')).toHaveText(/1,000\.00/);

  // Payment of 1,500: settles the invoice, 500 kept as an advance
  await page.getByRole('link', { name: 'Receive payment' }).click();
  await page.getByLabel('Amount received').fill('1500');
  await page.getByRole('button', { name: 'Allocate oldest first' }).click();
  await expect(page.getByLabel('Settle SI-000002')).toHaveValue('1000.00');
  await expect(page.getByText(/500\.00 will be kept as an advance/)).toBeVisible();
  await page.getByRole('button', { name: 'Post receipt' }).click();
  await expect(page.getByRole('heading', { name: 'Payment received CR-000001' })).toBeVisible();
  await expect(page.getByTestId('receipt-unallocated')).toHaveText(/500\.00/);

  await page.getByRole('link', { name: 'SHOP Stores' }).click();
  await expect(page.getByTestId('customer-owes')).toHaveText(/0\.00/);
  await expect(page.getByTestId('customer-advance')).toHaveText(/500\.00/);
  await expect(page.getByRole('row', { name: /SI-000002/ })).toContainText('paid');

  // The stock card shows both sales
  await page.goto(`/c/${companyId}/products`);
  await page.getByRole('link', { name: 'RICE-50' }).click();
  const movements = page.getByRole('table', { name: 'Stock movements' });
  await expect(movements.getByRole('row', { name: /SI-000001/ })).toContainText('Sold');
  await expect(page.getByRole('table', { name: 'Stock by location' })).toContainText('4,200.00');

  await page.goto(`/c/${companyId}/sales`);
  await expect(page.getByRole('row', { name: /SI-000001/ })).toContainText('Walk-in customer');
  const a11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(a11y.violations).toEqual([]);
});

test('S6 a cash-only customer cannot buy on credit without an override', async ({ page }) => {
  await signUp(page, 'Ada Owner', 'owner@example.test');
  const companyId = await createCompany(page);
  await stockedRice(page, companyId);
  await newCustomer(page, companyId, 'CASH', '0');
  await page.goto(`/c/${companyId}/sales/new`);
  await page.getByLabel('Customer').selectOption({ label: 'CASH · CASH Stores' });
  await page.getByLabel('Line 1 product').selectOption({ label: 'RICE-50 · Rice 50kg bag' });
  // The owner may override, and is told so before completing the sale.
  await expect(page.getByText(/CASH Stores is cash only/)).toBeVisible();
  await expect(page.getByText(/You can allow this/)).toBeVisible();
  const a11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(a11y.violations).toEqual([]);
});

test('@mobile the sale screen fits a phone screen', async ({ page }) => {
  await signUp(page, 'Ada Owner', 'owner@example.test');
  const companyId = await createCompany(page);
  await page.goto(`/c/${companyId}/sales/new`);
  await expect(page.getByLabel('Line 1 product')).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
