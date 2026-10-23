import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { createCompany, resetEmulators, signUp } from './helpers';

test.beforeEach(async () => {
  await resetEmulators();
});

async function fillLine(
  page: Page,
  n: number,
  account: string,
  side: 'debit' | 'credit',
  amount: string,
) {
  await page.getByLabel(`Line ${n} account`).selectOption({ label: account });
  await page.getByLabel(`Line ${n} ${side}`).fill(amount);
}

test('L1–L5 accountant workflow: chart, journal, reversal, opening balances, trial balance', async ({
  page,
}) => {
  await signUp(page, 'Ada Owner', 'owner@example.test');
  const companyId = await createCompany(page);
  const nav = page.getByRole('navigation', { name: 'Company' });

  // Chart of accounts seeded from the trading template
  await nav.getByRole('link', { name: 'Chart of accounts' }).click();
  const chart = page.getByRole('table', { name: 'Chart of accounts' });
  await expect(chart.getByRole('row', { name: /1110 Cash on hand/ })).toBeVisible();
  await expect(chart.getByRole('row', { name: /1200 Trade receivables/ })).toContainText('Control');

  // Manual journal; control accounts are not offered
  await nav.getByRole('link', { name: 'Journals' }).click();
  await page.getByRole('link', { name: 'New journal' }).click();
  await expect(
    page.getByLabel('Line 1 account').locator('option', { hasText: 'Trade receivables' }),
  ).toHaveCount(0);
  await page.getByLabel('Description').fill('Office rent for October');
  await fillLine(page, 1, '6200 · Rent', 'debit', '1250.50');
  await fillLine(page, 2, '1110 · Cash on hand', 'credit', '1250');
  await expect(page.getByText('Out of balance by')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Post journal' })).toBeDisabled();
  await page.getByLabel('Line 2 credit').fill('1,250.50');
  await expect(page.getByTestId('total-debit')).toHaveText(/1,250\.50/);
  await expect(page.getByTestId('total-credit')).toHaveText(/1,250\.50/);
  await page.getByRole('button', { name: 'Post journal' }).click();

  await expect(page.getByRole('heading', { name: 'Journal JV-000001' })).toBeVisible();
  const lines = page.getByRole('table', { name: 'Journal lines' });
  await expect(lines.getByRole('row', { name: /6200 Rent/ })).toContainText('1,250.50');

  // Reverse it
  await page.getByRole('button', { name: 'Reverse' }).click();
  await page.getByLabel('Reason').fill('Paid from the bank, not cash');
  await page.getByRole('button', { name: 'Reverse journal' }).click();
  await expect(page.getByRole('heading', { name: 'Journal RV-000001' })).toBeVisible();
  await expect(page.getByText('This journal reverses')).toBeVisible();
  await page.getByRole('link', { name: 'JV-000001' }).click();
  await expect(page.getByText('Reversed by')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reverse' })).toHaveCount(0);

  // Opening balances: the difference goes to opening balance equity
  await page.goto(`/c/${companyId}/opening-balances`);
  await fillLine(page, 1, '1120 · Bank current account', 'debit', '500000');
  await expect(page.getByText(/will be credited to 3300 Opening balance equity/)).toBeVisible();
  await page.getByRole('button', { name: 'Post opening balances' }).click();
  await expect(page.getByRole('heading', { name: 'Journal OB-000001' })).toBeVisible();
  await expect(lines.getByRole('row', { name: /3300 Opening balance equity/ })).toContainText(
    '500,000.00',
  );

  // Trial balance agrees and balances
  await nav.getByRole('link', { name: 'Trial balance' }).click();
  await expect(page.getByText('Balanced')).toBeVisible();
  const tb = page.getByRole('table', { name: 'Trial balance' });
  await expect(tb.getByRole('row', { name: /1120 Bank current account/ })).toContainText(
    '500,000.00',
  );
  await expect(tb.getByRole('row', { name: /6200 Rent/ })).toHaveCount(0);
  await expect(page.getByTestId('tb-debit')).toHaveText(/500,000\.00/);
  await expect(page.getByTestId('tb-credit')).toHaveText(/500,000\.00/);

  const a11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(a11y.violations).toEqual([]);
});

test('@mobile journal entry fits a phone screen', async ({ page }) => {
  await signUp(page, 'Ada Owner', 'owner@example.test');
  const companyId = await createCompany(page);
  await page.goto(`/c/${companyId}/journals/new`);
  await expect(page.getByLabel('Line 1 account')).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
