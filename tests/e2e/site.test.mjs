// Browser tests against a running build.
// 1. npm run build && npm run preview   (serves on http://localhost:4173)
// 2. npm run test:e2e                    (or set BASE_URL to test a deployment)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:4173';
const MOBILE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 900 };

let browser;
before(async () => {
  browser = await chromium.launch();
});
after(async () => {
  await browser?.close();
});

// Opens a page and records JavaScript errors. Failed network requests for
// third-party assets (fonts, images) are not counted as app errors.
async function open(path, viewport = MOBILE) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await page.addInitScript(() => localStorage.setItem('adz_attribution_choice_v1', 'denied'));
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errors.push(m.text());
  });
  await page.goto(BASE_URL + path, { waitUntil: 'domcontentloaded' });
  await page.locator('h1').first().waitFor();
  return { page, errors, close: () => context.close() };
}

test('homepage renders without JavaScript errors', async () => {
  const { page, errors, close } = await open('/');
  assert.match(await page.locator('h1').innerText(), /Build a Produce Business You Can\s+Actually Control/);
  assert.equal(await page.locator('h1').count(), 1, 'exactly one h1');
  assert.deepEqual(errors, []);
  await close();
});

test('no dead "#" links and every internal link opens a real page', async () => {
  const { page, close } = await open('/');
  const hrefs = await page.$$eval('a[href]', (as) => as.map((a) => a.getAttribute('href')));
  assert.ok(!hrefs.includes('#'), 'found href="#"');
  const internal = [...new Set(hrefs.filter((h) => h.startsWith('/')).map((h) => h.split('#')[0]))];
  for (const href of internal) {
    await page.goto(BASE_URL + href);
    await page.locator('h1').first().waitFor();
    assert.equal(await page.getByTestId('not-found').count(), 0, `${href} rendered "Page not found"`);
  }
  await close();
});

test('calls to action navigate client-side to the right pages', async () => {
  const { page, close } = await open('/');
  await page.getByRole('link', { name: /Get Free Checklist/ }).click();
  await page.waitForURL('**/checklist');
  await page.goBack();
  await page.waitForURL(BASE_URL + '/');
  await page.getByRole('link', { name: /Book an Executive Consultation/ }).click();
  await page.waitForURL('**/consultation');
  assert.match(await page.title(), /Book a Confidential Discovery Session/);
  await close();
});

test('mobile shows bottom navigation, desktop shows header navigation', async () => {
  const m = await open('/', MOBILE);
  assert.ok(await m.page.getByTestId('bottom-nav').isVisible());
  assert.ok(!(await m.page.getByTestId('desktop-nav').isVisible()));
  await m.close();

  const d = await open('/', DESKTOP);
  assert.ok(!(await d.page.getByTestId('bottom-nav').isVisible()));
  assert.ok(await d.page.getByTestId('desktop-nav').isVisible());
  await d.close();
});

test('bottom nav marks the current page', async () => {
  const { page, close } = await open('/about');
  const current = page.getByTestId('bottom-nav').locator('[aria-current="page"]');
  assert.equal(await current.count(), 1);
  assert.match(await current.innerText(), /About/);
  await close();
});

test('no horizontal scrolling on a 390px phone', async () => {
  const { page, close } = await open('/');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 0, `page is ${overflow}px wider than the screen`);
  await close();
});

test('leakage estimator responds to both sliders', async () => {
  const { page, close } = await open('/');
  const annual = page.getByTestId('annual-value');
  assert.equal(await annual.innerText(), '₦9,000,000');
  await page.getByLabel('Monthly turnover:').fill('20');
  await page.getByLabel('Assumed loss rate:').fill('10');
  assert.equal(await page.getByTestId('turnover-value').innerText(), '₦20M');
  assert.equal(await annual.innerText(), '₦24,000,000');
  await close();
});

test('case studies stay hidden until verified', async () => {
  const { page, close } = await open('/');
  assert.equal(await page.getByTestId('case-studies').count(), 0);
  await close();
});

test('unknown URLs show a not-found page', async () => {
  const { page, close } = await open('/does-not-exist');
  assert.equal(await page.getByTestId('not-found').count(), 1);
  await close();
});

test('pinch-zoom is not disabled', async () => {
  const { page, close } = await open('/');
  const viewport = await page.getAttribute('meta[name="viewport"]', 'content');
  assert.ok(!/user-scalable=no|maximum-scale=1/.test(viewport), viewport);
  await close();
});
