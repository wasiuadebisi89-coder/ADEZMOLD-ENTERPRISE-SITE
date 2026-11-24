import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createCompany, resetEmulators, signUp } from './helpers';
import { stockedRice } from './sales-helpers';

test.beforeEach(async () => {
  await resetEmulators();
});

test('L1 privacy and terms pages open without signing in', async ({ page }) => {
  await page.goto('/sign-in');
  await page.getByRole('link', { name: 'Privacy' }).click();
  await expect(page.getByRole('heading', { name: 'Privacy policy' })).toBeVisible();
  await expect(page.getByRole('link', { name: /adezmoldent@gmail\.com/ })).toBeVisible();
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([]);
  await page.screenshot({ path: 'test-results/privacy.png', fullPage: true });
  await page.getByRole('link', { name: 'Terms' }).first().click();
  await expect(page.getByRole('heading', { name: 'Terms of use' })).toBeVisible();
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([]);
});

test('L2 company details from Settings print on receipts', async ({ page }) => {
  await signUp(page, 'Ada Owner', 'owner@example.test');
  const companyId = await createCompany(page);

  await page.goto(`/c/${companyId}/settings`);
  await page.getByLabel('Address', { exact: true }).fill('5 Broad Street, Lagos Island');
  await page.getByLabel('Phone', { exact: true }).fill('08012345678');
  await page.getByLabel('Email', { exact: true }).fill('sales@example.test');
  await page.getByLabel('RC number', { exact: true }).fill('1445936');
  await page.getByLabel('TIN', { exact: true }).fill('1234-5678');
  await page.getByRole('button', { name: 'Save details' }).click();
  await expect(page.getByText('Details saved.')).toBeVisible();
  await page.screenshot({ path: 'test-results/settings-document-details.png', fullPage: true });

  await stockedRice(page, companyId);
  await page.getByRole('button', { name: 'Receipt' }).click();
  const paper = page.getByRole('dialog').getByTestId('receipt-paper');
  await expect(paper).toContainText('08012345678 - sales@example.test');
  await expect(paper).toContainText('RC 1445936 - TIN 1234-5678');
  await page.screenshot({ path: 'test-results/receipt-company-details.png' });
});
