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

/**
 * Signs out from the companies screen and waits until the session is gone.
 * Navigating away before Firebase finishes clearing its stored session
 * cancels the sign-out, and the next page then treats the user as signed in.
 */
export async function signOut(page: Page) {
  await expect(page.getByRole('heading', { name: 'Your companies' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page.getByLabel('Email')).toBeVisible();
}

/**
 * Registers a company and approves it behind the scenes, as the platform owner would, so tests
 * of other features start from a working company. platform.spec.ts covers the real approval.
 */
export async function createCompany(page: Page, legalName = 'Adezmold Trading Ltd') {
  const companyId = await registerCompany(page, legalName);
  await approveCompany(companyId);
  await expect(page.getByRole('heading', { name: /Welcome/ })).toBeVisible();
  return companyId;
}

/** Fills in the registration form and waits on the approval screen. */
export async function registerCompany(page: Page, legalName = 'Adezmold Trading Ltd') {
  await page.goto('/companies/new');
  await page.getByLabel('Legal name').fill(legalName);
  await page.getByRole('button', { name: 'Create company' }).click();
  await expect(page.getByRole('heading', { name: 'Waiting for approval' })).toBeVisible();
  return page.url().split('/c/')[1]!.split('/')[0]!;
}

/** Sets a company active through the emulator's admin access (bypasses security rules). */
export async function approveCompany(companyId: string): Promise<void> {
  const res = await fetch(
    `http://${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/companies/${companyId}?updateMask.fieldPaths=status`,
    {
      method: 'PATCH',
      headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { status: { stringValue: 'active' } } }),
    },
  );
  expect(res.ok).toBe(true);
}

export async function signOutFromShell(page: Page, email: string) {
  await page.getByRole('button', { name: email }).click();
  await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
}

/**
 * Gives the template's cash and bank accounts 10 million each through the emulator's admin
 * access, so flows that pay money out are not stopped by the no-overdraft rule (DECISION 23).
 * Writes balanced ledger entries against opening balance equity, dated 2000-01-01, so the trial
 * balance still balances; screens that show these balances include the funding.
 */
export async function fundMoneyAccounts(companyId: string): Promise<void> {
  const base = `projects/${PROJECT}/databases/(default)/documents`;
  const api = `http://${FIRESTORE}/v1/${base}`;
  const headers = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
  const res = await fetch(`${api}/companies/${companyId}/accounts?pageSize=300`, { headers });
  expect(res.ok).toBe(true);
  const { documents = [] } = (await res.json()) as {
    documents?: { name: string; fields: Record<string, { stringValue?: string }> }[];
  };
  const id = (d: { name: string }) => d.name.split('/').pop()!;
  const subtype = (d: (typeof documents)[number]) => d.fields.subtype?.stringValue;
  const equity = documents.find((d) => subtype(d) === 'openingBalanceEquity')!;
  const money = documents.filter((d) => ['cash', 'bank'].includes(subtype(d) ?? ''));
  const amount = 1_000_000_000;
  const entry = (n: number, accountId: string, debit: number, credit: number) => ({
    update: {
      name: `${base}/companies/${companyId}/ledgerEntries/test-funding_${n}`,
      fields: {
        journalId: { stringValue: 'test-funding' },
        journalNumber: { stringValue: 'TEST' },
        lineNo: { integerValue: String(n) },
        accountId: { stringValue: accountId },
        postingDate: { stringValue: '2000-01-01' },
        periodId: { stringValue: '2000-01' },
        branchId: { stringValue: 'HQ' },
        projectId: { nullValue: null },
        origin: { stringValue: 'opening_balance' },
        debit: { integerValue: String(debit) },
        credit: { integerValue: String(credit) },
        memo: { stringValue: 'Test funding' },
        postedAt: { timestampValue: '2000-01-01T00:00:00Z' },
      },
    },
  });
  const writes: object[] = money.flatMap((d, i) => [
    entry(2 * i + 1, id(d), amount, 0),
    entry(2 * i + 2, id(equity), 0, amount),
  ]);
  // Reports only read accounts that have postings.
  for (const d of [...money, equity]) {
    writes.push({
      update: { name: d.name, fields: { hasPostings: { booleanValue: true } } },
      updateMask: { fieldPaths: ['hasPostings'] },
    });
  }
  const commit = await fetch(`${api}:commit`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ writes }),
  });
  expect(commit.ok).toBe(true);
}
