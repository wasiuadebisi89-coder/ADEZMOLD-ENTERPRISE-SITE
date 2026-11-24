import { expect, test } from '@playwright/test';
import { createCompany, resetEmulators, signUp } from './helpers';

test.beforeEach(async () => {
  await resetEmulators();
});

test('LC1 add, rename and deactivate stock locations and categories', async ({ page }) => {
  await signUp(page, 'Ada Owner', 'owner@example.test');
  const companyId = await createCompany(page);

  // Locations live under Branches
  await page.goto(`/c/${companyId}/branches`);
  const table = page.getByRole('table', { name: 'Stock locations' });
  await expect(table.getByRole('row')).toHaveCount(3); // header + store + quarantine
  await page.getByRole('button', { name: 'New location' }).click();
  const dialog = page.getByRole('dialog', { name: 'New stock location' });
  await dialog.getByLabel('Name').fill('Warehouse');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(table.getByRole('cell', { name: 'Warehouse', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Rename Warehouse' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('Back warehouse');
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expect(table.getByRole('cell', { name: 'Back warehouse', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Deactivate Back warehouse' }).click();
  await expect(page.getByRole('button', { name: 'Activate Back warehouse' })).toBeVisible();
  await expect(
    table.getByRole('row').filter({ hasText: 'Back warehouse' }).getByText('inactive'),
  ).toBeVisible();
  await page.screenshot({ path: 'test-results/locations.png', fullPage: true });

  // Categories open from Products
  await page.goto(`/c/${companyId}/products`);
  await page.getByRole('button', { name: 'Categories' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'New category' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('Grains');
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  // Saving goes back to the list
  await page.getByRole('button', { name: 'Rename Grains' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('Grains and cereals');
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('dialog', { name: 'Categories' })).toContainText(
    'Grains and cereals',
  );
  await page.getByRole('button', { name: 'Deactivate Grains and cereals' }).click();
  await expect(page.getByRole('button', { name: 'Activate Grains and cereals' })).toBeVisible();
  await page.screenshot({ path: 'test-results/categories.png' });
});
