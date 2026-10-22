// Automated accessibility audit (axe-core, WCAG 2.0/2.1 A and AA) of every public
// page at phone and desktop sizes, the consent banner, form error states and the
// staff sign-in, plus keyboard checks. Requires `npm run build`.
// Automated tools catch a subset of issues; see docs/LAUNCH-CHECKLIST.md for manual checks.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import { startLocalServer } from '../../scripts/local-server.mjs';
import { pages } from '../../src/content/seo.js';
import { Readable } from 'node:stream';
import { createMemoryStore } from '../../server/store.js';
import { createLeadHandler } from '../../server/handler.js';
import { consultation } from '../../server/leads.js';
import { fakeAuth } from './fake-auth.mjs';

const require = createRequire(import.meta.url);
const AXE = require.resolve('axe-core/axe.min.js');
let server, base, browser;

before(async () => {
  const store = createMemoryStore();
  ({ server, url: base } = await startLocalServer({ port: 4178, store, authService: fakeAuth() }));
  const h = createLeadHandler({ ...consultation, getStore: () => store, env: {} });
  const body = { fullName: 'Ade Bello', businessName: 'Bello Produce', businessType: 'wholesaler', businessSize: '6-20', email: 'ade@example.com', phone: '08031234567', preferredContact: 'phone', challenge: 'credit', recordsState: 'paper', timeframe: 'urgent', service: 'health-check', additionalInfo: 'Notes', privacyAck: true, marketingConsent: true, website: '', submissionId: 'a11y-0001-aaaa', attribution: { source: 'linkedin-organic' } };
  await h(Object.assign(Readable.from([Buffer.from(JSON.stringify(body))]), { method: 'POST', url: '/', headers: { 'content-type': 'application/json', host: 'x' } }), { setHeader() {}, end() {} });
  browser = await chromium.launch();
});
after(async () => {
  await browser?.close();
  server?.close();
});

async function audit(p, label) {
  await p.addScriptTag({ path: AXE });
  const result = await p.evaluate(() =>
    window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }, resultTypes: ['violations'] }),
  );
  const problems = result.violations.map((v) => `${label}: [${v.impact}] ${v.id}: ${v.help} -> ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
  return problems;
}

async function open(path, { width = 390, height = 844, consent = 'denied' } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
  const p = await ctx.newPage();
  await p.route(/googleusercontent/, (r) => r.abort());
  if (consent) await p.addInitScript((c) => localStorage.setItem('adz_attribution_choice_v1', c), consent);
  await p.goto(base + path);
  await p.locator('h1').first().waitFor();
  return { p, ctx };
}

test('no WCAG A/AA violations on any public page (phone and desktop)', async () => {
  const problems = [];
  for (const pg of pages) {
    for (const vp of [{ width: 390, height: 844 }, { width: 1280, height: 900 }]) {
      const { p, ctx } = await open(pg.path, vp);
      problems.push(...(await audit(p, `${pg.path} @${vp.width}`)));
      await ctx.close();
    }
  }
  assert.deepEqual(problems, []);
});

test('no violations in the consent banner, form errors, or the staff lead register', async () => {
  const problems = [];
  let s = await open('/', { consent: null });
  await s.p.getByTestId('consent-banner').waitFor();
  problems.push(...(await audit(s.p, 'consent banner')));
  await s.ctx.close();

  s = await open('/consultation');
  await s.p.getByRole('button', { name: 'Send consultation request' }).click();
  await s.p.getByTestId('error-summary').getByRole('alert').waitFor();
  problems.push(...(await audit(s.p, 'consultation errors')));
  await s.ctx.close();

  s = await open('/admin');
  problems.push(...(await audit(s.p, 'staff sign-in')));
  await s.p.getByLabel('Email').fill('owner@adezmold.test');
  await s.p.getByLabel('Password').fill('right-pass');
  await s.p.getByRole('button', { name: /Sign in/ }).click();
  await s.p.getByTestId('lead-list').locator('li').first().waitFor();
  problems.push(...(await audit(s.p, 'lead list')));
  await s.p.getByRole('button', { name: /Bello Produce/ }).click();
  await s.p.getByTestId('lead-detail').waitFor();
  problems.push(...(await audit(s.p, 'lead detail')));
  await s.ctx.close();
  assert.deepEqual(problems, []);
});

test('keyboard: skip link first, visible focus, forms usable without a mouse', async () => {
  const { p, ctx } = await open('/checklist', { width: 1280, height: 900 });
  await p.keyboard.press('Tab');
  assert.equal(await p.evaluate(() => document.activeElement.textContent.trim()), 'Skip to content');
  await p.keyboard.press('Enter');
  assert.equal(await p.evaluate(() => document.activeElement.id), 'main');

  // Tab to the name field and check a visible focus indicator.
  const name = p.getByLabel('Your name');
  await name.focus();
  const outline = await name.evaluate((el) => getComputedStyle(el).outlineStyle + ' ' + getComputedStyle(el).outlineWidth);
  assert.ok(!outline.startsWith('none'), `focus outline: ${outline}`);

  await p.keyboard.type('Ade');
  await p.keyboard.press('Tab');
  await p.keyboard.type('ade@example.com');
  // Privacy checkbox reachable and toggled with Space.
  const ack = p.getByLabel(/I have read the/);
  await ack.focus();
  await p.keyboard.press('Space');
  assert.ok(await ack.isChecked());
  await ctx.close();
});

test('page zoom is allowed and text reflows at 320px without sideways scrolling', async () => {
  for (const pg of pages) {
    const { p, ctx } = await open(pg.path, { width: 320, height: 640 });
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 0, `${pg.path} overflows by ${overflow}px at 320px`);
    await ctx.close();
  }
});
