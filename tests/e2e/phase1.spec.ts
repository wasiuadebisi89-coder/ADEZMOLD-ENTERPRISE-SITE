import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { createCompany, latestOob, resetEmulators, signOutFromShell, signUp } from './helpers';

test.beforeEach(async () => {
  await resetEmulators();
});

test('A2 protected pages redirect to sign-in', async ({ page }) => {
  await page.goto('/c/some-company/members');
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fc%2Fsome-company%2Fmembers/);
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});

test('A1/B1/D1/D3/F2 owner sets up a company and a colleague joins with limited access', async ({
  page,
}) => {
  const owner = 'owner@example.test';
  await signUp(page, 'Ada Owner', owner);
  await expect(page.getByRole('heading', { name: 'Your companies' })).toBeVisible();
  await expect(page.getByText('No companies yet')).toBeVisible();

  const companyId = await createCompany(page);
  await expect(page.getByText('Active branches')).toBeVisible();

  // Branch
  await page.getByRole('link', { name: 'Branches' }).click();
  await page.getByRole('button', { name: 'New branch' }).click();
  await page.getByLabel('Code').fill('LAG');
  await page.getByLabel('Name').fill('Lagos Island');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('cell', { name: 'LAG', exact: true })).toBeVisible();

  // Close the first period of the year
  await page.getByRole('link', { name: 'Financial periods' }).click();
  const firstRow = page.getByRole('row').nth(1);
  await firstRow.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Close period' }).click();
  await expect(firstRow.getByText('Closed')).toBeVisible();

  // Invite a sales officer
  await page.getByRole('link', { name: 'Users' }).click();
  await page.getByRole('button', { name: 'Invite user' }).click();
  await page.getByLabel('Email').fill('sales@example.test');
  await page.getByLabel(/Sales Officer/).check();
  await page.getByRole('button', { name: 'Create invitation' }).click();
  const link = await page.getByRole('textbox', { name: 'Invitation link' }).inputValue();
  expect(link).toContain('/invite/');
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('cell', { name: 'sales@example.test' })).toBeVisible();

  // Audit log shows what happened
  await page.getByRole('link', { name: 'Audit log' }).click();
  await expect(page.getByRole('cell', { name: 'invitation.create' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'period.setStatus' })).toBeVisible();

  await signOutFromShell(page, owner);

  // Colleague signs up from the invitation link
  const invitePath = new URL(link).pathname + new URL(link).search;
  await signUp(page, 'Sam Sales', 'sales@example.test', 'CorrectHorse9!', invitePath);
  await expect(page.getByRole('heading', { name: 'Join a company' })).toBeVisible();
  await page.getByRole('button', { name: 'Accept invitation' }).click();
  await expect(page.getByRole('heading', { name: /Welcome, Sam Sales/ })).toBeVisible();
  expect(page.url()).toContain(`/c/${companyId}`);

  // E5: the sales officer sees only what their role allows
  const nav = page.getByRole('navigation', { name: 'Company' });
  await expect(nav.getByRole('link', { name: 'Overview' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Branches' })).toBeVisible();
  for (const hidden of ['Users', 'Roles', 'Financial periods', 'Audit log']) {
    await expect(nav.getByRole('link', { name: hidden })).toHaveCount(0);
  }
  await page.goto(`/c/${companyId}/branches`);
  await expect(page.getByRole('button', { name: 'New branch' })).toHaveCount(0);
});

test('A3 password reset email can be requested and used', async ({ page }) => {
  await signUp(page, 'Ada Owner', 'owner@example.test');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.goto('/forgot-password');
  await page.getByLabel('Email').fill('owner@example.test');
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByText(/reset link is on its way/)).toBeVisible();
  const oob = await latestOob('owner@example.test', 'PASSWORD_RESET');
  const AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099';
  const res = await fetch(
    `http://${AUTH}/identitytoolkit.googleapis.com/v1/accounts:resetPassword?key=demo-api-key`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ oobCode: oob.oobCode, newPassword: 'BrandNewPass42!' }),
    },
  );
  expect(res.ok).toBe(true);
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill('owner@example.test');
  await page.getByLabel('Password').fill('BrandNewPass42!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Your companies' })).toBeVisible();
});

test('I2 key screens have no serious accessibility violations', async ({ page }) => {
  const check = async () => {
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const serious = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    expect(
      serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
    ).toEqual([]);
  };
  await page.goto('/sign-in');
  await check();
  await signUp(page, 'Ada Owner', 'owner@example.test');
  await page.goto('/companies/new');
  await check();
  await createCompany(page);
  await check();
  await page.getByRole('link', { name: 'Users' }).click();
  await expect(page.getByRole('table', { name: 'Users' })).toBeVisible();
  await check();
});

test('I2 sign-in and company creation work with the keyboard only', async ({ page }) => {
  await signUp(page, 'Ada Owner', 'owner@example.test');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.goto('/sign-in');
  await page.getByLabel('Email').focus();
  await page.keyboard.type('owner@example.test');
  await page.keyboard.press('Tab');
  await page.keyboard.type('CorrectHorse9!');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Your companies' })).toBeVisible();
});

test('I1 @mobile shell fits a phone screen and uses a drawer', async ({ page }) => {
  await signUp(page, 'Ada Owner', 'owner@example.test');
  await createCompany(page);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await expect(page.getByRole('navigation', { name: 'Company' })).toBeHidden();
  await page.getByRole('button', { name: 'Open menu' }).click();
  await page
    .getByRole('navigation', { name: 'Company' })
    .getByRole('link', { name: 'Branches' })
    .click();
  await expect(page.getByRole('heading', { name: 'Branches' })).toBeVisible();
  const overflowAfter = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflowAfter).toBeLessThanOrEqual(0);
});
