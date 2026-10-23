import { expect, type Page } from '@playwright/test';

const AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099';
const FIRESTORE = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
const PROJECT = 'demo-bms';

export async function resetEmulators(): Promise<void> {
  await fetch(`http://${FIRESTORE}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, {
    method: 'DELETE',
  });
  await fetch(`http://${AUTH}/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
}

interface OobCode {
  email: string;
  requestType: 'VERIFY_EMAIL' | 'PASSWORD_RESET';
  oobLink: string;
  oobCode: string;
}

/** Reads the out-of-band email codes the Auth emulator "sent". */
export async function latestOob(email: string, type: OobCode['requestType']): Promise<OobCode> {
  for (let i = 0; i < 20; i++) {
    const res = await fetch(`http://${AUTH}/emulator/v1/projects/${PROJECT}/oobCodes`);
    const { oobCodes } = (await res.json()) as { oobCodes: OobCode[] };
    const match = oobCodes.filter((c) => c.email === email && c.requestType === type).at(-1);
    if (match) return match;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`No ${type} email for ${email}`);
}

/** Confirms the email through the emulator's action link, as the user would by clicking it. */
export async function verifyEmail(email: string): Promise<void> {
  const oob = await latestOob(email, 'VERIFY_EMAIL');
  const res = await fetch(oob.oobLink.replace('localhost', '127.0.0.1'));
  expect(res.ok).toBe(true);
}

export async function signUp(
  page: Page,
  name: string,
  email: string,
  password = 'CorrectHorse9!',
  next?: string,
) {
  await page.goto(next ? `/sign-up?next=${encodeURIComponent(next)}` : '/sign-up');
  await page.getByLabel('Your name').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Verify your email' })).toBeVisible();
  await verifyEmail(email);
  await page.getByRole('button', { name: "I've verified my email" }).click();
}

export async function createCompany(page: Page, legalName = 'Adezmold Trading Ltd') {
  await page.goto('/companies/new');
  await page.getByLabel('Legal name').fill(legalName);
  await page.getByRole('button', { name: 'Create company' }).click();
  await expect(page.getByRole('heading', { name: /Welcome/ })).toBeVisible();
  return page.url().split('/c/')[1]!.split('/')[0]!;
}

export async function signOutFromShell(page: Page, email: string) {
  await page.getByRole('button', { name: email }).click();
  await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
}
