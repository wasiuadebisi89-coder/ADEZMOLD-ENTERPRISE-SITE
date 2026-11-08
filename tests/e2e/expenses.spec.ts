import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { createCompany, fundMoneyAccounts, resetEmulators, signUp } from './helpers';

test.beforeEach(async () => {
  await resetEmulators();
});

test('E1 office expenses are recorded paid now or on credit, without a journal', async ({
  page,
}) => {
  await signUp(page, 'Ada Owner', 'owner@example.test');
  const companyId = await createCompany(page);
  await fundMoneyAccounts(companyId);
  const nav = page.getByRole('navigation', { name: 'Company' });

  // Paid now from cash, to someone who is not a supplier on file
  await nav.getByRole('link', { name: 'Expenses' }).click();
  await expect(page.getByRole('heading', { name: 'Expenses' })).toBeVisible();
  await page.getByRole('link', { name: 'Record expense' }).click();
  await expect(page.getByRole('heading', { name: 'Record expense' })).toBeVisible();
  const type1 = page.getByLabel('Item 1 expense type');
  // Only expense accounts are offered; assets go to Fixed assets.
  await expect(type1.locator('option', { hasText: '1530 · Office equipment' })).toHaveCount(0);
  await expect(type1.locator('option', { hasText: '5100 · Cost of goods sold' })).toHaveCount(0);
  await type1.selectOption({ label: '6500 · Repairs and maintenance' });
  await page.getByLabel('Item 1 description').fill('Generator repair');
  await page.getByLabel('Item 1 amount').fill('45000');
  await page.getByRole('button', { name: 'Add item' }).click();
  await page.getByLabel('Item 2 expense type').selectOption({ label: '6900 · Other expenses' });
  await page.getByLabel('Item 2 description').fill('Printer toner');
  await page.getByLabel('Item 2 amount').fill('12500.50');
  await page.getByLabel('Paid from').selectOption({ label: '1110 · Cash on hand' });
  await page.getByLabel('Paid to').fill('Ade Repairs');
  await expect(page.getByTestId('expense-total')).toHaveText(/57,500\.50/);
  await expect(page.getByRole('link', { name: 'record it under Fixed assets' })).toBeVisible();
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/new-expense.png` });
  const axe = await new AxeBuilder({ page }).include('main').analyze();
  expect(axe.violations).toEqual([]);
  await page.getByRole('button', { name: 'Post expense' }).click();

  await expect(page.getByRole('heading', { name: 'Expense EXP-000001' })).toBeVisible();
  await expect(page.getByTestId('expense-total')).toHaveText(/57,500\.50/);
  await expect(page.getByText('1110 Cash on hand')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Voucher' })).toBeVisible();
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/expense.png` });

  // The journal was posted for them
  await page.getByRole('link', { name: 'View journal' }).click();
  await expect(page.getByRole('heading', { name: /^Journal / })).toBeVisible();
  await expect(page.getByRole('row', { name: /6500/ })).toContainText('45,000.00');
  await expect(page.getByRole('row', { name: /1110/ })).toContainText('57,500.50');

  // On credit to a supplier: owed through a supplier invoice
  await nav.getByRole('link', { name: 'Suppliers' }).click();
  await page.getByRole('button', { name: 'New supplier' }).click();
  await page.getByLabel('Code').fill('FIXIT');
  await page.getByLabel('Name', { exact: true }).fill('Fixit Services');
  await page.getByLabel('Payment terms (days)').fill('14');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('row', { name: /FIXIT/ })).toBeVisible();

  await page.goto(`/c/${companyId}/expenses/new`);
  await page.getByLabel('Item 1 expense type').selectOption({ label: '6300 · Utilities' });
  await page.getByLabel('Item 1 description').fill('Air conditioner servicing');
  await page.getByLabel('Item 1 amount').fill('30000');
  await page.getByLabel('Payment').selectOption('credit');
  await page
    .getByLabel('Supplier', { exact: true })
    .selectOption({ label: 'FIXIT · Fixit Services' });
  await page.getByLabel('Receipt or invoice number (optional)').fill('FX-1001');
  await page.getByRole('button', { name: 'Post expense' }).click();
  await expect(page.getByRole('heading', { name: 'Expense EXP-000002' })).toBeVisible();
  await page.getByRole('link', { name: 'PI-000001' }).click();
  await expect(page.getByRole('heading', { name: /PI-000001/ })).toBeVisible();
  await page.goBack();
  await page.getByRole('link', { name: 'Fixit Services' }).click();
  await expect(page.getByTestId('supplier-owed')).toHaveText(/30,000\.00/);

  // Both are listed, and the day book shows them as expenses
  await nav.getByRole('link', { name: 'Expenses' }).click();
  const list = page.getByRole('table', { name: 'Expenses' });
  await expect(list.getByRole('row', { name: /EXP-000001/ })).toContainText('Paid');
  await expect(list.getByRole('row', { name: /EXP-000002/ })).toContainText('On credit');
  await nav.getByRole('link', { name: 'Day book' }).click();
  const rows = page.getByRole('table', { name: 'Day book' }).getByTestId('daybook-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('Expense');
  await rows.nth(0).getByRole('link', { name: 'EXP-000001' }).click();
  await expect(page.getByRole('heading', { name: 'Expense EXP-000001' })).toBeVisible();
});
