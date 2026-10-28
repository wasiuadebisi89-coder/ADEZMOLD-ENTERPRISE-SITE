import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { addDays, addMonths, businessDate } from '@bms/domain';
import { createCompany, resetEmulators, signUp } from './helpers';
import { newCustomer, stockedRice } from './sales-helpers';

const TODAY = businessDate(new Date(), 'Africa/Lagos');
const month = (n: number) => addMonths(TODAY.slice(0, 7), n);

test.beforeEach(async () => {
  await resetEmulators();
});

async function noA11yViolations(page: Page) {
  const a11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(a11y.violations).toEqual([]);
}

/** A company whose financial year started at least two months ago, posting up to a year back. */
async function companyForPastMonths(page: Page) {
  await page.goto('/companies/new');
  await page.getByLabel('Legal name').fill('Adezmold Trading Ltd');
  await page
    .getByLabel('Financial year starts in')
    .selectOption(String(Number(addDays(TODAY, -70).slice(5, 7))));
  await page.getByRole('button', { name: 'Create company' }).click();
  await expect(page.getByRole('heading', { name: /Welcome/ })).toBeVisible();
  const companyId = page.url().split('/c/')[1]!.split('/')[0]!;
  await page.goto(`/c/${companyId}/settings`);
  await page.getByLabel('Backdating window (days)').fill('366');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Settings saved.')).toBeVisible();
  return companyId;
}

const nav = (page: Page, name: string) =>
  page
    .getByRole('navigation', { name: 'Company' })
    .getByRole('link', { name, exact: true })
    .click();

test('F1 a fixed asset is bought, depreciated and disposed of, and the books still balance', async ({
  page,
}) => {
  await signUp(page, 'Ada Owner', 'owner@example.test');
  await companyForPastMonths(page);

  await nav(page, 'Fixed assets');
  await page.getByRole('link', { name: 'Add asset' }).click();
  await page.getByLabel('Asset name').fill('Delivery van');
  await page.getByLabel('Asset account').selectOption({ label: '1520 · Motor vehicles' });
  await page.getByLabel('Cost').fill('120000');
  await page.getByLabel('Residual value').fill('12000');
  await page.getByLabel('Useful life in months').fill('36');
  await page.getByLabel('Date bought').fill(`${month(-2)}-10`);
  await page.getByLabel('In use from').fill(`${month(-2)}-10`);
  await page.getByLabel('Paid from').selectOption({ label: '1120 · Bank current account' });
  await expect(page.getByTestId('fa-monthly')).toHaveText(/3,000\.00/);
  await noA11yViolations(page);
  await page.getByRole('button', { name: 'Post purchase' }).click();
  await expect(page.getByRole('heading', { name: 'FA-000001 Delivery van' })).toBeVisible();
  await expect(page.getByTestId('fa-book')).toHaveText(/120,000\.00/);
  await expect(page.getByTestId('fa-through')).toHaveText('Not yet');

  // Two months caught up in one run, posted on the last day of last month.
  await page.getByRole('link', { name: 'All assets' }).click();
  await page.getByLabel('Up to the end of').fill(month(-1));
  await page.getByRole('button', { name: 'Post depreciation' }).click();
  await expect(page.getByText(/DR-000001 posted for 1 asset/)).toBeVisible();
  await expect(page.getByTestId('fa-book-value')).toHaveText(/114,000\.00/);
  await expect(page.getByRole('table', { name: 'Depreciation runs' })).toContainText('6,000.00');
  await expect(page.getByText('Agrees')).toBeVisible();
  await noA11yViolations(page);

  await nav(page, 'Reports');
  await expect(page.getByTestId('pl-net')).toHaveText(/6,000\.00/);
  await page.getByRole('tab', { name: 'Balance sheet' }).click();
  await expect(page.getByText('Balanced')).toBeVisible();
  await expect(page.getByTestId('bs-assets')).toHaveText(/^-.*6,000\.00$/);
  await noA11yViolations(page);

  await nav(page, 'Fixed assets');
  await page.getByRole('link', { name: 'FA-000001' }).click();
  await page.getByRole('button', { name: 'Dispose' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Date disposed of').fill(`${month(-1)}-20`);
  await dialog.getByLabel('Sold for').fill('110000');
  await dialog.getByLabel('Money received into').selectOption({ label: '1110 · Cash on hand' });
  await dialog.getByLabel('Reason').fill('Replaced with a larger van');
  await expect(page.getByTestId('dispose-preview')).toHaveText(/Loss on disposal: .*4,000\.00/);
  await expect(dialog.getByLabel('Loss account')).toHaveValue(/.+/);
  await noA11yViolations(page);
  await dialog.getByRole('button', { name: 'Post disposal' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByText('disposed', { exact: true })).toBeVisible();
  await expect(page.getByTestId('fa-gain')).toHaveText(/4,000\.00/);

  await nav(page, 'Reports');
  await page.getByRole('tab', { name: 'Balance sheet' }).click();
  await expect(page.getByText('Balanced')).toBeVisible();
  await page.getByRole('tab', { name: 'Profit and loss' }).click();
  await expect(page.getByTestId('pl-net')).toHaveText(/10,000\.00/);
});

test('F2 ageing and stock reports agree with their ledger accounts', async ({ page }) => {
  await signUp(page, 'Ada Owner', 'owner@example.test');
  const companyId = await createCompany(page);
  await stockedRice(page, companyId);
  await newCustomer(page, companyId, 'SHOP', '5000');
  await page.goto(`/c/${companyId}/sales/new`);
  await page.getByLabel('Customer').selectOption({ label: 'SHOP · SHOP Stores' });
  await page.getByLabel('Line 1 product').selectOption({ label: 'RICE-50 · Rice 50kg bag' });
  await page.getByLabel('Line 1 quantity').fill('2');
  await page.getByRole('button', { name: 'Complete sale' }).click();
  await expect(page.getByRole('heading', { name: 'Sale SI-000001' })).toBeVisible();

  await nav(page, 'Reports');
  // Sold 2 bags for 2,000 that cost 1,200.
  await expect(page.getByTestId('pl-net')).toHaveText(/800\.00/);
  await page.getByRole('tab', { name: 'Receivables ageing' }).click();
  await expect(page.getByRole('table', { name: 'Customer ageing' })).toContainText('SHOP Stores');
  await expect(page.getByTestId('ageing-current')).toHaveText(/2,000\.00/);
  await expect(page.getByTestId('ageing-total')).toHaveText(/2,000\.00/);
  await expect(page.getByText('It agrees with the open invoices.')).toBeVisible();
  await noA11yViolations(page);

  await page.getByRole('tab', { name: 'Payables ageing' }).click();
  await expect(page.getByText('Nothing outstanding')).toBeVisible();

  await page.getByRole('tab', { name: 'Stock valuation' }).click();
  await expect(page.getByTestId('stock-total')).toHaveText(/4,800\.00/);
  await expect(page.getByText('It agrees with the stock records.')).toBeVisible();
  await noA11yViolations(page);

  // One location at a time: all the rice is in the store, none in quarantine.
  const location = page.getByLabel('Location');
  const names = await location.locator('option').allTextContents();
  await location.selectOption({ label: names.find((n) => n.endsWith('Store'))! });
  await expect(page.getByTestId('stock-total')).toHaveText(/4,800\.00/);
  await expect(page.getByText(/compared with the total for all locations only/)).toBeVisible();
  await location.selectOption({ label: names.find((n) => n.endsWith('Quarantine'))! });
  await expect(page.getByText('No stock on hand')).toBeVisible();
  await location.selectOption('');
  await expect(page.getByText('It agrees with the stock records.')).toBeVisible();

  // Everything was posted today, so yesterday there was nothing.
  const yesterday = addDays(TODAY, -1);
  await page.getByLabel('As at').fill(yesterday);
  await page.getByRole('button', { name: 'Show report' }).click();
  await expect(page.getByText('No stock on hand')).toBeVisible();
  await expect(page.getByText('It agrees with the stock records.')).toBeVisible();
  await page.getByRole('tab', { name: 'Receivables ageing' }).click();
  // Wait for the ageing tab to replace the stock tab before using its date picker.
  await expect(page.getByRole('table', { name: 'Customer ageing' })).toContainText('SHOP Stores');
  await page.getByLabel('As at').fill(yesterday);
  await page.getByRole('button', { name: 'Show report' }).click();
  await expect(page.getByText('Nothing outstanding')).toBeVisible();
  await expect(page.getByText('It agrees with the open invoices.')).toBeVisible();

  await nav(page, 'Financial periods');
  await expect(page.getByRole('heading', { name: 'Year-end close' })).toBeVisible();
  await expect(page.getByText('The year can be closed after it ends.')).toBeVisible();
});

test('@mobile the reports fit a phone screen', async ({ page }) => {
  await signUp(page, 'Ada Owner', 'owner@example.test');
  const companyId = await createCompany(page);
  await page.goto(`/c/${companyId}/reports?tab=balance-sheet`);
  await expect(page.getByText('Balanced')).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
