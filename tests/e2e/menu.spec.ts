import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { createCompany, resetEmulators, signUp } from './helpers';

test.beforeEach(async () => {
  await resetEmulators();
});

// Sharper screenshots when saving them for review.
if (process.env.MENU_SHOTS) test.use({ deviceScaleFactor: 2 });

/** Set MENU_SHOTS to a folder to save screenshots for review. */
async function shot(page: Page, name: string) {
  if (process.env.MENU_SHOTS)
    await page.screenshot({ path: `${process.env.MENU_SHOTS}/${name}.png` });
}

/** Starts as a first-time visitor on this device: every menu heading closed. */
async function closedMenus(page: Page) {
  await page.addInitScript(() => localStorage.setItem('bms.nav.open', '[]'));
}

test('M1 the menu groups related pages and hides areas the business does not use', async ({
  page,
}) => {
  await closedMenus(page);
  await signUp(page, 'Ada Admin', 'ada@example.com');
  const companyId = await createCompany(page);
  const nav = page.getByRole('navigation', { name: 'Company' });

  // Headings start closed; the trading company has no Projects or Production.
  const sales = nav.getByRole('button', { name: 'Sales' });
  await expect(sales).toHaveAttribute('aria-expanded', 'false');
  await expect(nav.getByRole('link', { name: 'New sale' })).toHaveCount(0);
  await expect(nav.getByRole('button', { name: 'Projects & production' })).toHaveCount(0);
  await expect(nav.getByRole('link', { name: 'Production' })).toHaveCount(0);
  await shot(page, 'menu-closed');

  await sales.click();
  await nav.getByRole('button', { name: 'Accounting' }).click();
  await expect(sales).toHaveAttribute('aria-expanded', 'true');
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([]);
  await shot(page, 'menu-open');
  await nav.getByRole('link', { name: 'Journals' }).click();
  await expect(page).toHaveURL(new RegExp(`/c/${companyId}/journals$`));

  // Opening a page by link opens its heading too.
  await page.goto(`/c/${companyId}/products`);
  await expect(nav.getByRole('button', { name: 'Stock' })).toHaveAttribute('aria-expanded', 'true');

  // Turning on Production adds it to the menu and to Help.
  await page.goto(`/c/${companyId}/settings`);
  await page.getByRole('checkbox', { name: /Production/ }).check();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Saved. The menu has been updated.')).toBeVisible();
  await shot(page, 'settings-business-types');
  await nav.getByRole('link', { name: 'Production' }).click();
  await expect(page).toHaveURL(new RegExp(`/c/${companyId}/production$`));
});

test('M2 Help hides topics for areas the business does not use', async ({ page }) => {
  await signUp(page, 'Ada Admin', 'ada@example.com');
  await createCompany(page);
  await page.getByRole('button', { name: 'Help' }).click();
  const help = page.getByRole('dialog', { name: 'Help' });
  await help.getByRole('searchbox', { name: 'Search help' }).fill('manufacture');
  await expect(help.getByText('That area is turned off for this company.')).toBeVisible();
});

test('M3 @mobile the phone menu uses the same headings', async ({ page }) => {
  await closedMenus(page);
  await signUp(page, 'Ada Admin', 'ada@example.com');
  await createCompany(page);
  await page.getByRole('button', { name: 'Open menu' }).click();
  const drawer = page.getByRole('dialog', { name: 'Menu' });
  await drawer.getByRole('button', { name: 'Sales' }).click();
  await shot(page, 'menu-mobile');
  await drawer.getByRole('link', { name: 'New sale' }).click();
  await expect(drawer).toBeHidden();
  await expect(page.getByRole('heading', { name: 'New sale' })).toBeVisible();
});
