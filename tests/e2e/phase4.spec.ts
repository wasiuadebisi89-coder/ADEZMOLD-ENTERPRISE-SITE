import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { createCompany, resetEmulators, signUp } from './helpers';

test.beforeEach(async () => {
  await resetEmulators();
});

test('P1–P6 purchasing: supplier, receipt, matched invoice, payment, advance', async ({ page }) => {
  await signUp(page, 'Ada Owner', 'owner@example.test');
  const companyId = await createCompany(page);
  const nav = page.getByRole('navigation', { name: 'Company' });

  // Supplier and product
  await nav.getByRole('link', { name: 'Suppliers' }).click();
  await page.getByRole('button', { name: 'New supplier' }).click();
  await page.getByLabel('Code').fill('MILLS');
  await page.getByLabel('Name', { exact: true }).fill('Lagos Mills Ltd');
  await page.getByLabel('Payment terms (days)').fill('30');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('row', { name: /MILLS/ })).toContainText('30 days');

  await nav.getByRole('link', { name: 'Products' }).click();
  await page.getByRole('button', { name: 'New product' }).click();
  await page.getByLabel('SKU').fill('RICE-50');
  await page.getByLabel('Name').fill('Rice 50kg bag');
  await page.getByLabel('Unit').selectOption('bag');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('row', { name: /RICE-50/ })).toBeVisible();

  // Receive 10 bags at 65,000
  await nav.getByRole('link', { name: 'Purchases' }).click();
  await page.getByRole('link', { name: 'Receive goods' }).click();
  await page.getByLabel('Supplier').selectOption({ label: 'MILLS · Lagos Mills Ltd' });
  await page.getByLabel('Line 1 product').selectOption({ label: 'RICE-50 · Rice 50kg bag' });
  await page.getByLabel('Line 1 quantity').fill('10');
  await page.getByLabel('Line 1 unit cost').fill('65000');
  await expect(page.getByTestId('receipt-total')).toHaveText(/650,000\.00/);
  await page.getByRole('button', { name: 'Post receipt' }).click();
  await expect(page.getByRole('heading', { name: 'Goods received GRN-000001' })).toBeVisible();
  await expect(page.getByText('Awaiting invoice')).toBeVisible();

  // The invoice says 660,000 for the rice, plus 5,000 delivery
  await page.getByRole('link', { name: 'Record invoice' }).click();
  await page.getByLabel("Supplier's invoice number").fill('MLS-881');
  await page.getByLabel('Invoice GRN-000001 line 1').check();
  await expect(page.getByLabel('GRN-000001 line 1 quantity')).toHaveValue('10');
  await expect(page.getByLabel('GRN-000001 line 1 amount')).toHaveValue('650000.00');
  await page.getByLabel('GRN-000001 line 1 amount').fill('660000');
  await page.getByRole('button', { name: 'Add charge' }).click();
  await page
    .getByLabel('Charge 1 account')
    .selectOption({ label: '6400 · Transport and delivery' });
  await page.getByLabel('Charge 1 description').fill('Delivery to store');
  await page.getByLabel('Charge 1 amount').fill('5000');
  await expect(page.getByTestId('invoice-total')).toHaveText(/665,000\.00/);
  await page.getByRole('button', { name: 'Post invoice' }).click();
  await expect(page.getByRole('heading', { name: 'Supplier invoice PI-000001' })).toBeVisible();
  await expect(page.getByTestId('invoice-outstanding')).toHaveText(/665,000\.00/);
  const lines = page.getByRole('table', { name: 'Invoice lines' });
  await expect(lines.getByRole('row', { name: /RICE-50/ })).toContainText('10,000.00');

  // Pay 700,000: settle the invoice and keep 35,000 as an advance
  await page.getByRole('link', { name: 'Pay supplier' }).click();
  await page.getByLabel('Amount paid').fill('700000');
  await page.getByRole('button', { name: 'Allocate oldest first' }).click();
  await expect(page.getByLabel('Pay PI-000001')).toHaveValue('665000.00');
  await expect(page.getByText(/35,000\.00 will be kept as an advance/)).toBeVisible();
  await page.getByRole('button', { name: 'Post payment' }).click();
  await expect(page.getByRole('heading', { name: 'Supplier payment SP-000001' })).toBeVisible();
  await expect(page.getByTestId('payment-unallocated')).toHaveText(/35,000\.00/);

  // Supplier owes nothing; the advance is shown
  await page.getByRole('link', { name: 'Lagos Mills Ltd' }).click();
  await expect(page.getByTestId('supplier-owed')).toHaveText(/0\.00/);
  await expect(page.getByRole('row', { name: /PI-000001/ })).toContainText('paid');

  // Stock card shows the receipt and the cost adjustment from the invoice
  await page.goto(`/c/${companyId}/products`);
  await page.getByRole('link', { name: 'RICE-50' }).click();
  const movements = page.getByRole('table', { name: 'Stock movements' });
  await expect(movements.getByRole('row', { name: /GRN-000001/ })).toContainText('650,000.00');
  await expect(movements.getByRole('row', { name: /PI-000001/ })).toContainText('10,000.00');
  await expect(page.getByRole('table', { name: 'Stock by location' })).toContainText('660,000.00');

  await page.goto(`/c/${companyId}/purchases?tab=invoices`);
  await expect(page.getByRole('row', { name: /PI-000001/ })).toContainText('MLS-881');
  const a11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(a11y.violations).toEqual([]);
});

test('P7 return goods not yet invoiced', async ({ page }) => {
  await signUp(page, 'Ada Owner', 'owner@example.test');
  const companyId = await createCompany(page);
  await page.goto(`/c/${companyId}/suppliers`);
  await page.getByRole('button', { name: 'New supplier' }).click();
  await page.getByLabel('Code').fill('OILCO');
  await page.getByLabel('Name', { exact: true }).fill('Oil Co');
  await page.getByLabel('Payment terms (days)').fill('0');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.goto(`/c/${companyId}/products`);
  await page.getByRole('button', { name: 'New product' }).click();
  await page.getByLabel('SKU').fill('OIL');
  await page.getByLabel('Name').fill('Palm oil');
  await page.getByLabel('Unit').selectOption('l');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('row', { name: /OIL/ })).toBeVisible();

  await page.goto(`/c/${companyId}/purchases/receipts/new`);
  await page.getByLabel('Supplier').selectOption({ label: 'OILCO · Oil Co' });
  await page.getByLabel('Line 1 product').selectOption({ label: 'OIL · Palm oil' });
  await page.getByLabel('Line 1 quantity').fill('20');
  await page.getByLabel('Line 1 unit cost').fill('1500');
  await page.getByRole('button', { name: 'Post receipt' }).click();
  await expect(page.getByRole('heading', { name: 'Goods received GRN-000001' })).toBeVisible();

  await page.getByRole('link', { name: 'Return goods' }).click();
  await page.getByLabel('Reason').fill('Two drums leaking');
  await page.getByLabel('Line 1 received goods').selectOption({ index: 1 });
  await expect(page.getByLabel('Line 1 invoice')).toContainText('Not invoiced (20 l waiting)');
  await page.getByLabel('Line 1 quantity').fill('2');
  await page.getByRole('button', { name: 'Post return' }).click();
  await expect(page.getByRole('heading', { name: 'Return to supplier SR-000001' })).toBeVisible();
  const lines = page.getByRole('table', { name: 'Return lines' });
  await expect(lines.getByRole('row', { name: /OIL/ })).toContainText('Not yet invoiced');
  await expect(lines.getByRole('row', { name: /OIL/ })).toContainText('3,000.00');
  await page.getByRole('link', { name: 'GRN-000001' }).click();
  await expect(page.getByText('Partly invoiced')).toBeVisible();
});

test('@mobile supplier invoice entry fits a phone screen', async ({ page }) => {
  await signUp(page, 'Ada Owner', 'owner@example.test');
  const companyId = await createCompany(page);
  await page.goto(`/c/${companyId}/purchases/invoices/new`);
  await page.getByRole('button', { name: 'Add charge' }).click();
  await expect(page.getByLabel('Charge 1 amount')).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
