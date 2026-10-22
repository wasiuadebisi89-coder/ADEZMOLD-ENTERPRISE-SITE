// End-to-end acquisition journey with NO mocks: the real built site in a real
// browser, posting to the real API handlers (in-memory store in place of Firestore).
// Requires a fresh `npm run build` first.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { startLocalServer } from '../../scripts/local-server.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let server;
let store;
let base;
let browser;

before(async () => {
  ({ server, store, url: base } = await startLocalServer({ port: 4174 }));
  browser = await chromium.launch();
});
after(async () => {
  await browser?.close();
  server?.close();
});

async function page() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  await p.route(/googleusercontent|fonts\.g/, (r) => r.abort()); // third-party assets not needed
  return { p, close: () => ctx.close() };
}

test('LinkedIn visitor requests the checklist, then books a consultation', async () => {
  const { p, close } = await page();
  await p.goto(`${base}/checklist?utm_source=linkedin&utm_medium=social&utm_campaign=launch`);
  await p.getByTestId('consent-banner').getByRole('button', { name: 'Allow' }).click();
  await p.getByLabel('Your name').fill('Ade Bello');
  await p.getByLabel('Email address').fill('ade@example.com');
  await p.getByLabel(/I have read the/).check();
  await p.getByRole('button', { name: 'Send me the checklist' }).click();
  await p.getByTestId('checklist-success').waitFor();
  const href = await p.getByTestId('checklist-download').getAttribute('href');
  const pdf = await p.request.get(base + href);
  assert.equal(pdf.status(), 200);
  assert.equal(pdf.headers()['content-type'], 'application/pdf');
  assert.equal((await pdf.body()).subarray(0, 5).toString(), '%PDF-');
  assert.equal((await p.request.get(`${base}/api/checklist-download?t=forged`)).status(), 403);

  await p.getByRole('link', { name: 'Book a consultation' }).click();
  await p.waitForURL('**/consultation?service=health-check');
  await p.getByLabel('Full name').fill('Ade Bello');
  await p.getByLabel('Business name').fill('Bello Produce Ventures');
  await p.getByLabel('Type of business').selectOption('wholesaler');
  await p.getByLabel('Size of business').selectOption('6-20');
  await p.getByLabel('Phone / WhatsApp number').fill('0803 123 4567');
  await p.getByText('Phone call', { exact: true }).click();
  await p.getByLabel('Main business challenge right now').selectOption('credit');
  await p.getByLabel('How do you keep business records today?').selectOption('spreadsheet');
  await p.getByLabel('When would you like help?').selectOption('urgent');
  await p.getByLabel(/I have read the/).check();
  await p.getByRole('button', { name: 'Send consultation request' }).click();
  await p.getByTestId('consultation-success').waitFor();
  const shown = await p.getByTestId('lead-reference').innerText();
  await close();

  const leads = [...store.data.leads.values()];
  assert.equal(leads.length, 2);
  const chk = leads.find((l) => l.kind === 'checklist');
  const con = leads.find((l) => l.kind === 'consultation');
  assert.equal(con.reference, shown, 'reference on screen matches the stored lead');
  for (const l of [chk, con]) {
    assert.equal(l.attribution.source, 'linkedin-organic');
    assert.equal(l.attribution.utm_campaign, 'launch');
    assert.equal(l.attribution.landingPath, '/checklist');
  }
  assert.equal(con.inquiry.service, 'health-check');
  assert.equal(con.contact.phone, '+2348031234567');
  assert.equal(con.contact.email, null);
  assert.equal(store.data.consents.length, 2);
  assert.equal(chk.downloads, 1, 'download recorded on the lead');
  assert.ok(store.data.consents.every((c) => c.privacyAck === true && c.marketing === false));
});

test('the browser bundle contains no server code or secrets', async () => {
  const dir = path.join(root, 'dist/assets');
  const files = await readdir(dir);
  assert.ok(files.some((f) => f.endsWith('.js')), 'run `npm run build` first');
  const bundle = (await Promise.all(files.map((f) => readFile(path.join(dir, f), 'utf8')))).join('\n');
  for (const needle of ['PRIVATE KEY', 'FIREBASE_PRIVATE_KEY', 'FIREBASE_CLIENT_EMAIL', 'RATE_LIMIT_SALT', 'firebase-admin', 'serviceAccount', 'createMemoryStore']) {
    assert.ok(!bundle.includes(needle), `bundle contains "${needle}"`);
  }
});
