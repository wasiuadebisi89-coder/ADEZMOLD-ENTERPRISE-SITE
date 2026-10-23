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

const nav = (page: Page, name: string) =>
  page
    .getByRole('navigation', { name: 'Company' })
    .getByRole('link', { name, exact: true })
    .click();

test('S1 a service is quoted, invoiced from the quote and shows in its project', async ({
  page,
}) => {
  await signUp(page, 'Ada Owner', 'owner@example.test');
  const companyId = await createCompany(page);

  await page.goto(`/c/${companyId}/products`);
  await page.getByRole('button', { name: 'New product' }).click();
  await page.getByLabel('SKU').fill('INSTALL');
  await page.getByLabel('Name').fill('Installation');
  await page.getByLabel('Kind').selectOption('service');
  await expect(page.getByLabel('Unit')).toHaveValue('hr');
  await page.getByLabel(/Selling price/).fill('500');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('row', { name: /INSTALL/ })).toContainText('Service');

  await newCustomer(page, companyId, 'SHOP', '100000');
  await nav(page, 'Projects');
  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByLabel('Code').fill('FIT-1');
  await page.getByLabel('Name').fill('Shop fit-out');
  await page.getByLabel('Customer (optional)').selectOption({ label: 'SHOP · SHOP Stores' });
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('row', { name: /FIT-1/ })).toBeVisible();

  await nav(page, 'Quotations');
  await page.getByRole('link', { name: 'New quotation' }).click();
  await page
    .getByLabel('Customer', { exact: true })
    .selectOption({ label: 'SHOP · SHOP Stores' });
  await page.getByLabel('Project (optional)').selectOption({ label: 'FIT-1 · Shop fit-out' });
  await page.getByLabel('Line 1 product').selectOption({ label: 'INSTALL · Installation' });
  await page.getByLabel('Line 1 quantity').fill('4');
  await expect(page.getByTestId('quote-total')).toHaveText(/2,000\.00/);
  await noA11yViolations(page);
  await page.getByRole('button', { name: 'Save quotation' }).click();
  await expect(page.getByRole('heading', { name: 'Quotation QT-000001' })).toBeVisible();
  await page.getByRole('button', { name: 'Mark as sent' }).click();
  await noA11yViolations(page);

  // The invoice takes the quote's customer, project and lines.
  await page.getByRole('link', { name: 'Create invoice' }).click();
  await expect(page.getByRole('heading', { name: 'Invoice QT-000001' })).toBeVisible();
  await expect(page.getByLabel('Line 1 quantity')).toHaveValue('4');
  await expect(page.getByTestId('sale-total')).toHaveText(/2,000\.00/);
  await page.getByRole('button', { name: 'Complete sale' }).click();
  await expect(page.getByRole('heading', { name: 'Sale SI-000001' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Sale lines' })).toContainText('Service');
  await expect(page.getByRole('link', { name: 'View quotation' })).toBeVisible();

  await page.getByRole('link', { name: 'View project' }).click();
  await expect(page.getByRole('heading', { name: 'FIT-1 · Shop fit-out' })).toBeVisible();
  await expect(page.getByTestId('project-margin')).toHaveText(/2,000\.00/);
  await noA11yViolations(page);
});

test('P1 materials and labour become finished goods at actual cost', async ({ page }) => {
  await signUp(page, 'Ada Owner', 'owner@example.test');
  const companyId = await createCompany(page);
  await stockedRice(page, companyId);

  await page.goto(`/c/${companyId}/products`);
  await page.getByRole('button', { name: 'New product' }).click();
  await page.getByLabel('SKU').fill('PARBOIL');
  await page.getByLabel('Name').fill('Parboiled rice bag');
  await page.getByLabel('Unit').selectOption('bag');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('row', { name: /PARBOIL/ })).toBeVisible();

  await nav(page, 'Production');
  await page.getByRole('link', { name: 'Bills of materials' }).click();
  await page.getByRole('button', { name: 'New bill' }).click();
  await page.getByLabel('Finished product').selectOption({ label: 'PARBOIL · Parboiled rice bag' });
  await page.getByLabel('Makes').fill('1');
  await page.getByLabel('Name', { exact: true }).fill('Parboiling');
  await page.getByLabel('Component 1', { exact: true }).selectOption({
    label: 'RICE-50 · Rice 50kg bag',
  });
  await page.getByLabel('Component 1 quantity').fill('1');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('row', { name: /Parboiling/ })).toBeVisible();
  await noA11yViolations(page);

  await page.getByRole('link', { name: 'Production orders' }).click();
  await page.getByRole('button', { name: 'New order' }).click();
  await page.getByLabel('Bill of materials').selectOption({ label: 'PARBOIL · Parboiling' });
  await page.getByLabel('Quantity to make').fill('5');
  await page.getByRole('button', { name: 'Create order' }).click();
  await expect(page.getByRole('heading', { name: 'Production MO-000001' })).toBeVisible();

  // The bill's quantity is suggested; 5 bags at 600 go into work in progress.
  await page.getByRole('button', { name: 'Issue materials' }).click();
  await expect(page.getByLabel('RICE-50 · Rice 50kg bag')).toHaveValue('5');
  await page.getByRole('button', { name: 'Issue', exact: true }).click();
  await expect(page.getByTestId('order-wip')).toHaveText(/3,000\.00/);

  await page.getByRole('button', { name: 'Add cost' }).click();
  await page.getByLabel('Paid from or owed on').selectOption({ label: '1110 · Cash on hand' });
  await page.getByLabel('Description').fill('Parboiling labour');
  await page.getByLabel('Amount').fill('500');
  await page.getByRole('button', { name: 'Post cost' }).click();
  await expect(page.getByTestId('order-wip')).toHaveText(/3,500\.00/);
  await noA11yViolations(page);

  await page.getByRole('button', { name: 'Complete' }).click();
  await page.getByLabel(/Good output/).fill('5');
  await page.getByRole('button', { name: 'Complete', exact: true }).last().click();
  await expect(page.getByTestId('order-finished-cost')).toHaveText(/3,500\.00/);
  await expect(page.getByText('completed')).toBeVisible();
  await noA11yViolations(page);
});
