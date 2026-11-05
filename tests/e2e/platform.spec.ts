import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { registerCompany, resetEmulators, signOut, signUp } from './helpers';

// functions/env/.env.demo-bms names platform@example.test as the platform owner.
const OWNER = 'platform@example.test';

test.beforeEach(async () => {
  await resetEmulators();
});

async function signIn(page: Page, email: string) {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('CorrectHorse9!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Your companies' })).toBeVisible();
}

test('P1 new companies wait until the platform owner approves or rejects them', async ({
  page,
}) => {
  // Two businesses register.
  await signUp(page, 'Bola Buyer', 'bola@shop.test');
  const bolaCo = await registerCompany(page, 'Bola Stores Ltd');
  await expect(page.getByText('Bola Stores Ltd')).toBeVisible();
  await page.goto('/companies');
  await expect(page.getByRole('link', { name: /Bola Stores Ltd/ })).toContainText(
    'Awaiting approval',
  );
  await signOut(page);

  await signUp(page, 'Chidi Seller', 'chidi@shop.test');
  await registerCompany(page, 'Chidi Imports Ltd');
  await page.goto('/companies');
  await signOut(page);

  // Someone who is not the platform owner cannot open the dashboard.
  await signIn(page, 'bola@shop.test');
  await expect(page.getByRole('link', { name: 'Registrations' })).toHaveCount(0);
  await page.goto('/platform');
  await expect(page.getByText('This area is only for the platform owner.')).toBeVisible();
  await page.goto('/companies');
  await signOut(page);

  // The platform owner decides.
  await signUp(page, 'Platform Owner', OWNER);
  await page.goto('/platform');
  await expect(page.getByRole('heading', { name: 'Company registrations' })).toBeVisible();
  await expect(page.getByLabel('Awaiting approval count')).toHaveText('2');
  const pending = page.getByRole('list', { name: 'Awaiting approval' });
  await expect(pending.getByRole('listitem')).toHaveCount(2);
  await expect(pending).toContainText('bola@shop.test');

  const a11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(a11y.violations).toEqual([]);

  const bola = pending.getByRole('listitem').filter({ hasText: 'Bola Stores Ltd' });
  await bola.getByRole('button', { name: 'Approve' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Approve' }).click();
  await expect(pending.getByRole('listitem')).toHaveCount(1);

  const chidi = pending.getByRole('listitem').filter({ hasText: 'Chidi Imports Ltd' });
  await chidi.getByRole('button', { name: 'Reject' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Reject' })).toBeDisabled();
  await dialog.getByLabel('Reason').fill('Please register with your CAC number');
  await dialog.getByRole('button', { name: 'Reject' }).click();
  await expect(page.getByText('Nothing waiting')).toBeVisible();
  await expect(page.getByLabel('Awaiting approval count')).toHaveText('0');

  await page.getByRole('tab', { name: 'Not approved' }).click();
  await expect(page.getByText('Reason: Please register with your CAC number')).toBeVisible();
  await page.getByRole('tab', { name: 'Active' }).click();
  await expect(page.getByText('Bola Stores Ltd')).toBeVisible();

  // The owner's link to the dashboard is in the top bar from now on.
  await page.goto('/companies');
  await expect(page.getByRole('link', { name: 'Registrations' })).toBeVisible();
  await signOut(page);

  // The approved company opens; the rejected one shows why.
  await signIn(page, 'bola@shop.test');
  await page.goto(`/c/${bolaCo}`);
  await expect(page.getByRole('heading', { name: /Welcome/ })).toBeVisible();
  await page.goto('/companies');
  await signOut(page);

  await signIn(page, 'chidi@shop.test');
  await page.getByRole('link', { name: /Chidi Imports Ltd/ }).click();
  await expect(page.getByRole('heading', { name: 'Registration not approved' })).toBeVisible();
  await expect(page.getByText('Please register with your CAC number')).toBeVisible();
});

test('P2 the waiting screen opens the company by itself once approved', async ({
  page,
  browser,
}) => {
  await signUp(page, 'Bola Buyer', 'bola@shop.test');
  const companyId = await registerCompany(page, 'Bola Stores Ltd');
  const a11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(a11y.violations).toEqual([]);

  const owner = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const ownerPage = await owner.newPage();
  await signUp(ownerPage, 'Platform Owner', OWNER);
  await ownerPage.goto('/platform');
  await ownerPage.getByRole('button', { name: 'Approve' }).click();
  await ownerPage.getByRole('dialog').getByRole('button', { name: 'Approve' }).click();
  await expect(ownerPage.getByText('Nothing waiting')).toBeVisible();
  await owner.close();

  await expect(page.getByRole('heading', { name: /Welcome/ })).toBeVisible();
  expect(page.url()).toContain(`/c/${companyId}`);
});
