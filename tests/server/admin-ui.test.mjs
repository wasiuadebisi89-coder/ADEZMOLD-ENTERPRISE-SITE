// Lead register in a real browser: built site + real admin API + in-memory store.
// Auth is the fake service (real Firebase Auth is covered by the emulator test).
// Requires a fresh `npm run build`.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { chromium } from 'playwright';
import { startLocalServer } from '../../scripts/local-server.mjs';
import { createMemoryStore } from '../../server/store.js';
import { createLeadHandler } from '../../server/handler.js';
import { consultation, checklist } from '../../server/leads.js';
import { fakeAuth } from './fake-auth.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let server, store, base, browser, auth;

async function seed(h, body) {
  const req = Object.assign(Readable.from([Buffer.from(JSON.stringify(body))]), { method: 'POST', url: '/', headers: { 'content-type': 'application/json', host: 'x', 'x-forwarded-for': `10.0.0.${Math.floor(Math.random() * 200)}` } });
  await h(req, { setHeader() {}, end() {} });
}

before(async () => {
  store = createMemoryStore();
  auth = fakeAuth();
  ({ server, url: base } = await startLocalServer({ port: 4175, store, authService: auth, adminOptions: { loginLimits: [{ scope: 'ip', limit: 100, windowMs: 60000 }] } }));
  const c = createLeadHandler({ ...consultation, getStore: () => store, env: {} });
  const k = createLeadHandler({ ...checklist, getStore: () => store, env: {} });
  await seed(c, { fullName: 'Ade Bello', businessName: 'Bello Produce', businessType: 'wholesaler', businessSize: '6-20', email: 'ade@example.com', phone: '08031234567', preferredContact: 'whatsapp', challenge: 'credit', recordsState: 'paper', timeframe: 'urgent', service: 'health-check', additionalInfo: 'Two depots, Iwo and Ibadan.', privacyAck: true, marketingConsent: true, website: '', submissionId: 'ui-seed-0001', attribution: { source: 'linkedin-organic', utm_campaign: 'oct' } });
  await seed(k, { fullName: 'Kemi Ola', email: 'kemi@example.com', businessName: 'Ola Grains', businessType: '', privacyAck: true, marketingConsent: false, website: '', submissionId: 'ui-seed-0002', attribution: {} });
  browser = await chromium.launch();
});
after(async () => {
  await browser?.close();
  server?.close();
});

async function page(viewport = { width: 390, height: 844 }) {
  const ctx = await browser.newContext({ viewport });
  const p = await ctx.newPage();
  await p.route(/googleusercontent|fonts\.g/, (r) => r.abort());
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  return { p, ctx, errors };
}
async function signIn(p, email = 'owner@adezmold.test', password = 'right-pass') {
  await p.goto(`${base}/admin`);
  await p.getByLabel('Email').fill(email);
  await p.getByLabel('Password').fill(password);
  await p.getByRole('button', { name: /Sign in/ }).click();
  await p.getByTestId('lead-list').locator('li').first().waitFor();
}

test('sign-in screen, wrong password, then the lead list', async () => {
  const { p, ctx, errors } = await page();
  await p.goto(`${base}/admin`);
  assert.equal(await p.getAttribute('meta[name="robots"]', 'content'), 'noindex, nofollow');
  assert.equal(await p.getByTestId('bottom-nav').count(), 0, 'public navigation is not shown');
  await p.getByLabel('Email').fill('owner@adezmold.test');
  await p.getByLabel('Password').fill('wrong');
  await p.getByRole('button', { name: /Sign in/ }).click();
  await p.getByRole('alert').waitFor();
  assert.match(await p.getByRole('alert').innerText(), /incorrect/);
  await p.getByLabel('Password').fill('right-pass');
  await p.getByRole('button', { name: /Sign in/ }).click();
  const items = p.getByTestId('lead-list').locator('li');
  await items.first().waitFor();
  assert.equal(await items.count(), 2);
  const cookies = await ctx.cookies();
  const c = cookies.find((x) => x.name === '__Host-adz_admin');
  assert.ok(c && c.httpOnly && c.secure && c.sameSite === 'Strict');
  assert.equal(await p.evaluate(() => document.cookie.includes('adz_admin')), false, 'session not readable by page scripts');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('search and filter the list', async () => {
  const { p, ctx } = await page();
  await signIn(p);
  await p.getByLabel('Search', { exact: true }).fill('ola');
  await p.waitForFunction(() => document.querySelectorAll('[data-testid="lead-list"] li').length === 1);
  assert.match(await p.getByTestId('lead-list').innerText(), /Ola Grains/);
  await p.getByRole('button', { name: 'Clear filters' }).click();
  await p.getByRole('button', { name: /^Filters/ }).click(); // folded away on phones
  await p.getByLabel('Source').selectOption('linkedin-organic');
  await p.getByTestId('lead-list').getByText('Bello Produce').waitFor();
  await p.waitForFunction(() => document.querySelectorAll('[data-testid="lead-list"] li').length === 1);
  assert.doesNotMatch(await p.getByTestId('lead-list').innerText(), /Ola Grains/);
  await ctx.close();
});

test('open a lead, move it through the pipeline, add a note', async () => {
  const { p, ctx, errors } = await page();
  await signIn(p, 'staff@adezmold.test', 'staff-pass');
  await p.getByRole('button', { name: /Bello Produce/ }).click();
  await p.getByTestId('lead-detail').waitFor();
  assert.match(p.url(), /\/admin\?lead=ADZ-/);
  const text = await p.getByTestId('lead-detail').innerText();
  for (const s of ['Two depots, Iwo and Ibadan.', 'LinkedIn (organic)', 'Marketing emails: agreed', 'Produce Business Health Check']) assert.ok(text.includes(s), `missing ${s}`);
  assert.match(await p.getByRole('link', { name: /WhatsApp/ }).getAttribute('href'), /^https:\/\/wa\.me\/2348031234567$/);
  assert.equal(await p.getByText('Delete lead').count(), 0, 'staff do not see delete');

  await p.getByLabel('Stage').selectOption('consultation-scheduled');
  await p.getByLabel('Follow-up date').fill('2026-11-03');
  await p.getByLabel('Proposal value (₦)').fill('450,000');
  await p.getByRole('button', { name: /Save changes/ }).click();
  await p.getByText('Saved.').waitFor();
  const history = p.getByTestId('activity');
  await history.getByText(/Stage: New → Consultation scheduled/).waitFor();
  assert.match(await history.innerText(), /Proposal value: — → ₦450,000/);

  await p.getByLabel('Add a note').fill('Called. Visit booked for Tuesday.');
  await p.getByRole('button', { name: 'Add note' }).click();
  await history.getByText('Called. Visit booked for Tuesday.').waitFor();

  const ref = new URL(p.url()).searchParams.get('lead');
  assert.equal(store.data.leads.get(ref).status, 'consultation-scheduled');
  assert.equal(store.data.leads.get(ref).pipeline.proposalValue, 450000);
  await p.getByRole('button', { name: /All leads/ }).click();
  await p.getByTestId('lead-list').waitFor();
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('a conflicting edit is caught and explained', async () => {
  const { p, ctx } = await page();
  await signIn(p);
  await p.getByRole('button', { name: /Ola Grains/ }).click();
  await p.getByTestId('lead-detail').waitFor();
  const ref = new URL(p.url()).searchParams.get('lead');
  // Someone else saves first (directly via the store, as another staff member would).
  const { lead } = await store.getLead(ref);
  await store.updateLead(ref, { owner: 'Tunde' }, { by: 'other@adezmold.test', expectedVersion: lead.version });
  await p.getByLabel('Stage').selectOption('contacted');
  await p.getByRole('button', { name: /Save changes/ }).click();
  await p.getByText(/Someone else updated this lead/).waitFor();
  await p.getByRole('button', { name: 'Reload' }).click();
  await p.waitForFunction(() => document.querySelector('input[placeholder="Who is handling this?"]')?.value === 'Tunde');
  await ctx.close();
});

test('admins export CSV and can delete with typed confirmation; staff cannot export', async () => {
  const s = await page();
  await signIn(s.p, 'staff@adezmold.test', 'staff-pass');
  assert.equal(await s.p.getByTestId('export-csv').count(), 0);
  await s.ctx.close();

  const { p, ctx } = await page({ width: 1280, height: 900 });
  await signIn(p);
  const [download] = await Promise.all([p.waitForEvent('download'), p.getByTestId('export-csv').click()]);
  assert.match(download.suggestedFilename(), /^adezmold-leads-\d{4}-\d{2}-\d{2}\.csv$/);
  const csv = await readFile(await download.path(), 'utf8');
  assert.match(csv, /Reference,Created,Type,Stage/);

  await p.getByRole('button', { name: /Ola Grains/ }).click();
  await p.getByTestId('lead-detail').waitFor();
  const ref = new URL(p.url()).searchParams.get('lead');
  const del = p.getByRole('button', { name: 'Delete permanently' });
  assert.ok(await del.isDisabled());
  await p.getByLabel('Type the reference to confirm deletion').fill(ref.toLowerCase());
  await del.click();
  await p.getByText(`Lead ${ref} was permanently deleted.`).waitFor();
  assert.ok(!store.data.leads.has(ref));
  await ctx.close();
});

test('an expired or revoked session returns to sign-in', async () => {
  const { p, ctx } = await page();
  await signIn(p);
  auth.revoked.add('u1'); // e.g. role removed or "sign out everywhere"
  await p.getByLabel('Search', { exact: true }).fill('bello');
  await p.getByRole('heading', { name: 'Lead register' }).waitFor();
  auth.revoked.delete('u1');
  await ctx.close();
});

test('sign out ends the session', async () => {
  const { p, ctx } = await page();
  await signIn(p);
  await p.getByRole('button', { name: 'Sign out' }).click();
  await p.getByRole('heading', { name: 'Lead register' }).waitFor();
  await p.goto(`${base}/admin`);
  await p.getByLabel('Password').waitFor();
  auth.revoked.delete('u1');
  await ctx.close();
});

test('admin code is not in the public bundle', async () => {
  const dir = path.join(root, 'dist/assets');
  const files = await readdir(dir);
  const main = files.find((f) => /^index-.*\.js$/.test(f));
  const adminChunk = files.find((f) => /^AdminApp-.*\.js$/.test(f));
  assert.ok(main && adminChunk, 'run `npm run build` first');
  const mainJs = await readFile(path.join(dir, main), 'utf8');
  for (const s of ['Delete permanently', 'export.csv', 'Lead register']) assert.ok(!mainJs.includes(s), `public bundle contains "${s}"`);
});
