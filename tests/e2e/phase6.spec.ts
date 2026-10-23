import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { createCompany, resetEmulators, signUp } from './helpers';
import { newCustomer, stockedRice } from './sales-helpers';

test.beforeEach(async () => {
  await resetEmulators();
});

async function noA11yViolations(page: Page) {
  const a11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(a11y.violations).toEqual([]);
}

/** A walk-in sale of one bag, paid in full into the account given. */
async function walkInSale(page: Page, companyId: string, into?: string) {
  await page.goto(`/c/${companyId}/sales/new`);
  await page.getByLabel('Line 1 product').selectOption({ label: 'RICE-50 · Rice 50kg bag' });
  if (into) await page.getByLabel('Received into').selectOption({ label: into });
  await page.getByRole('button', { name: 'Paid in full' }).click();
  await page.getByRole('button', { name: 'Complete sale' }).click();
  await expect(page.getByRole('heading', { name: /^Sale SI-/ })).toBeVisible();
}

async function returnOne(page: Page, condition?: 'Damaged') {
  await page.getByRole('link', { name: 'Return goods' }).click();
  await page.getByLabel('Return quantity line 1').fill('1');
  if (condition) await page.getByLabel('Condition line 1').selectOption({ label: condition });
  await page.getByLabel('Reason').fill('Wrong size');
}

test('R1 a return on a credit sale reduces what the customer owes and restocks', async ({
  page,
}) => {
  await signUp(page, 'Ada Owner', 'owner@example.test');
  const companyId = await createCompany(page);
  await stockedRice(page, companyId);
  await newCustomer(page, companyId, 'SHOP', '5000');

  await page.getByRole('link', { name: 'SHOP' }).click();
  await page
    .getByRole('link', { name: 'New sale' })
    .and(page.locator('[href*="customer="]'))
    .click();
  await page.getByLabel('Line 1 product').selectOption({ label: 'RICE-50 · Rice 50kg bag' });
  await page.getByLabel('Line 1 quantity').fill('2');
  await page.getByRole('button', { name: 'Complete sale' }).click();
  await expect(page.getByRole('heading', { name: 'Sale SI-000001' })).toBeVisible();
  await expect(page.getByTestId('sale-outstanding')).toHaveText(/2,000\.00/);

  await returnOne(page);
  await expect(page.getByRole('heading', { name: 'Return goods from SI-000001' })).toBeVisible();
  await noA11yViolations(page);
  await page.getByRole('button', { name: 'Post return' }).click();
  await expect(page.getByRole('heading', { name: 'Return CN-000001' })).toBeVisible();
  await expect(page.getByTestId('credit-total')).toHaveText(/1,000\.00/);
  await expect(page.getByTestId('credit-unused')).toHaveText(/0\.00/);
  await noA11yViolations(page);

  await page.getByRole('link', { name: 'SI-000001' }).click();
  await expect(page.getByTestId('sale-outstanding')).toHaveText(/1,000\.00/);
  await expect(page.getByTestId('invoice-returned')).toHaveText(/1,000\.00/);
  await expect(page.getByRole('row', { name: /CN-000001/ })).toContainText('posted');

  await page.goto(`/c/${companyId}/products`);
  await page.getByRole('link', { name: 'RICE-50' }).click();
  const movements = page.getByRole('table', { name: 'Stock movements' });
  await expect(movements.getByRole('row', { name: /CN-000001/ })).toContainText(
    'Returned by customer',
  );
  await expect(page.getByRole('table', { name: 'Stock by location' })).toContainText('5,400.00');
});

test('R2 walk-in returns are paid back; customer credit can be refunded', async ({ page }) => {
  await signUp(page, 'Ada Owner', 'owner@example.test');
  const companyId = await createCompany(page);
  await stockedRice(page, companyId);

  // Walk-in: damaged goods to quarantine, money back at once
  await walkInSale(page, companyId);
  await returnOne(page, 'Damaged');
  await expect(page.getByLabel('Damaged goods go to')).toHaveValue(/quarantine/);
  await expect(page.getByLabel('Pay back from')).toBeVisible();
  await page.getByRole('button', { name: 'Post return' }).click();
  await expect(page.getByRole('heading', { name: 'Return CN-000001' })).toBeVisible();
  await expect(page.getByTestId('credit-refunded')).toHaveText(/1,000\.00/);
  await expect(page.getByRole('table', { name: 'Returned goods' })).toContainText('Quarantine');

  // Customer who paid in full: credit kept, then part refunded
  await newCustomer(page, companyId, 'SHOP', '0');
  await page.goto(`/c/${companyId}/sales/new`);
  await page.getByLabel('Customer').selectOption({ label: 'SHOP · SHOP Stores' });
  await page.getByLabel('Line 1 product').selectOption({ label: 'RICE-50 · Rice 50kg bag' });
  await page.getByRole('button', { name: 'Paid in full' }).click();
  await page.getByRole('button', { name: 'Complete sale' }).click();
  await expect(page.getByRole('heading', { name: 'Sale SI-000002' })).toBeVisible();
  await returnOne(page);
  await page.getByRole('button', { name: 'Post return' }).click();
  await expect(page.getByRole('heading', { name: 'Return CN-000002' })).toBeVisible();
  await expect(page.getByTestId('credit-unused')).toHaveText(/1,000\.00/);

  await page.getByRole('button', { name: 'Refund' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Amount to pay back')).toHaveValue('1000.00');
  await dialog.getByLabel('Amount to pay back').fill('400');
  await dialog.getByLabel('Reason').fill('Customer asked for cash');
  await noA11yViolations(page);
  await dialog.getByRole('button', { name: 'Pay back' }).click();
  await expect(page.getByRole('heading', { name: 'Refund RF-000001' })).toBeVisible();
  await expect(page.getByTestId('refund-amount')).toHaveText(/400\.00/);

  await page.getByRole('link', { name: 'CN-000002' }).click();
  await expect(page.getByTestId('credit-unused')).toHaveText(/600\.00/);
  await expect(page.getByRole('table', { name: 'Refunds' })).toContainText('RF-000001');

  await page.goto(`/c/${companyId}/sales?tab=returns`);
  await expect(page.getByRole('row', { name: /CN-000002/ })).toContainText('SHOP Stores');
  await noA11yViolations(page);
});

test('R3 bank reconciliation clears entries that match the statement', async ({ page }) => {
  await signUp(page, 'Ada Owner', 'owner@example.test');
  const companyId = await createCompany(page);
  await stockedRice(page, companyId);
  await walkInSale(page, companyId, '1120 · Bank current account');

  await page
    .getByRole('navigation', { name: 'Company' })
    .getByRole('link', {
      name: 'Bank reconciliation',
    })
    .click();
  await page.getByLabel('Account').selectOption({ label: '1120 · Bank current account' });
  await expect(page.getByTestId('bank-last')).toContainText('Not reconciled yet');
  await page.getByLabel('Closing balance on the statement').fill('1000');
  await expect(page.getByTestId('bank-difference')).toHaveText(/1,000\.00/);
  const finish = page.getByRole('button', { name: 'Finish reconciliation' });
  await expect(finish).toBeDisabled();
  await page
    .getByRole('checkbox', { name: /On statement/ })
    .first()
    .check();
  await expect(page.getByTestId('bank-difference')).toHaveText(/0\.00/);
  await noA11yViolations(page);
  await finish.click();
  await expect(page.getByText('Reconciliation saved.')).toBeVisible();
  await expect(page.getByTestId('bank-last')).toContainText(/1,000\.00/);
  await expect(page.getByText('Nothing left to tick up to this date.')).toBeVisible();
  await expect(page.getByRole('table', { name: 'Past reconciliations' })).toContainText('1');
});

test('@mobile the return screen fits a phone screen', async ({ page }) => {
  await signUp(page, 'Ada Owner', 'owner@example.test');
  const companyId = await createCompany(page);
  await stockedRice(page, companyId);
  await walkInSale(page, companyId);
  await page.getByRole('link', { name: 'Return goods' }).click();
  await expect(page.getByLabel('Return quantity line 1')).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
