import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { createCompany, resetEmulators, signUp } from './helpers';

test.beforeEach(async () => {
  await resetEmulators();
});

async function noA11yViolations(page: Page) {
  await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; }' });
  const a11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(a11y.violations).toEqual([]);
}

test('B1 an admin adds, edits and deactivates bank accounts, and receipts offer them', async ({
  page,
}) => {
  await signUp(page, 'Ada Owner', 'owner@example.test');
  const companyId = await createCompany(page);

  await page.getByRole('link', { name: 'Bank accounts' }).click();
  await expect(page.getByRole('heading', { name: 'Bank accounts' })).toBeVisible();
  const table = page.getByRole('table', { name: 'Bank accounts' });
  await expect(table.getByText('Details missing')).toBeVisible();
  await noA11yViolations(page);

  // The template's bank account gets its details.
  await table.getByRole('button', { name: 'Add bank details' }).click();
  await page.getByLabel('Bank', { exact: true }).fill('Zenith Bank');
  await page.getByLabel('Account number').fill('1012345678');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(table.getByText('1012345678')).toBeVisible();

  // A second account creates its own ledger account beside it.
  await page.getByRole('button', { name: 'New bank account' }).first().click();
  await page.getByLabel('Bank', { exact: true }).fill('GTBank');
  await page.getByLabel('Account number').fill('0123 456 789');
  await expect(page.getByLabel('Code')).toHaveValue('1121');
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('GTBank 6789');
  if (process.env.SHOTS)
    await page.screenshot({ path: `${process.env.SHOTS}/new-bank-account.png` });
  await noA11yViolations(page);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(table.getByText('0123456789')).toBeVisible();
  await expect(table.getByText('GTBank 6789')).toBeVisible();
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/bank-accounts.png` });

  await page.goto(`/c/${companyId}/sales/receipts/new`);
  const into = page.getByLabel('Received into');
  await expect(
    into.locator('option', { hasText: '1121 · GTBank 6789 (GTBank ••6789)' }),
  ).toHaveCount(1);
  await expect(into.locator('option', { hasText: 'Zenith Bank ••5678' })).toHaveCount(1);

  // Deactivated accounts are no longer offered.
  await page.goto(`/c/${companyId}/bank-accounts`);
  await table
    .getByRole('row', { name: /GTBank 6789/ })
    .getByRole('button', { name: 'Deactivate' })
    .click();
  await expect(table.getByRole('row', { name: /GTBank 6789/ }).getByText('inactive')).toBeVisible();
  await page.goto(`/c/${companyId}/sales/receipts/new`);
  await expect(
    page.getByLabel('Received into').locator('option', { hasText: 'GTBank' }),
  ).toHaveCount(0);
});
