import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { createCompany, resetEmulators, signUp } from './helpers';

test.beforeEach(async () => {
  await resetEmulators();
});

/** Set HELP_SHOTS to a folder to save screenshots for review. */
async function shot(page: Page, name: string) {
  if (process.env.HELP_SHOTS)
    await page.screenshot({ path: `${process.env.HELP_SHOTS}/${name}.png` });
}

test('H1 the Help panel answers questions and follows the page', async ({ page }) => {
  await signUp(page, 'Ada Admin', 'ada@example.com');
  const companyId = await createCompany(page);

  await page.getByRole('button', { name: 'Help' }).click();
  const help = page.getByRole('dialog', { name: 'Help' });
  await expect(help.getByRole('region', { name: 'Getting started' })).toBeVisible();
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([]);
  await shot(page, 'help-overview');

  await help.getByRole('searchbox', { name: 'Search help' }).fill('how do I refund a customer');
  await shot(page, 'help-search');
  await help.getByRole('button', { name: 'Refund a customer' }).click();
  await expect(help.getByRole('heading', { name: 'Refund a customer' })).toBeVisible();
  await shot(page, 'help-topic');
  await page.keyboard.press('Escape');

  await page.goto(`/c/${companyId}/sales/new`);
  await page.getByRole('button', { name: 'Help' }).click();
  await expect(help.getByRole('region', { name: 'Help for this page' })).toBeVisible();
  await help.getByRole('button', { name: 'Make a sale' }).click();
  await shot(page, 'help-new-sale');
  await help.getByRole('link', { name: 'New sale' }).click();
  await expect(help).toBeHidden();
  await expect(page).toHaveURL(new RegExp(`/c/${companyId}/sales/new$`));
});
