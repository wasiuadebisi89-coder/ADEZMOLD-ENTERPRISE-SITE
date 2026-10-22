// Browser tests for the two lead forms. The API is mocked here so these tests
// cover the front end only; the real endpoints are tested in the backend stage.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:4173';
let browser;
before(async () => {
  browser = await chromium.launch();
});
after(async () => {
  await browser?.close();
});

async function open(path, { api } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const requests = [];
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  if (api) {
    await page.route('**/api/**', async (route) => {
      requests.push({ url: route.request().url(), body: route.request().postDataJSON() });
      await api(route);
    });
  }
  await page.goto(BASE_URL + path);
  await page.locator('h1').first().waitFor();
  return { page, requests, errors, close: () => context.close() };
}

const ok = (reference = 'ADZ-TEST-0001') => (route) =>
  new Promise((r) => setTimeout(r, 300)).then(() =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, reference }) }),
  );

async function fillConsultation(page) {
  await page.getByLabel('Full name').fill('Ade Bello');
  await page.getByLabel('Business name').fill('Bello Produce Ventures');
  await page.getByLabel('Type of business').selectOption('wholesaler');
  await page.getByLabel('Size of business').selectOption('6-20');
  await page.getByLabel('Phone / WhatsApp number').fill('0803 123 4567');
  await page.getByText('WhatsApp', { exact: true }).click();
  await page.getByLabel('Main business challenge right now').selectOption('stock-losses');
  await page.getByLabel('How do you keep business records today?').selectOption('paper');
  await page.getByLabel('When would you like help?').selectOption('1-month');
  await page.getByLabel(/I have read the/).check();
}

test('consultation: empty submit shows errors and sends nothing', async () => {
  const { page, requests, close } = await open('/consultation', { api: ok() });
  await page.getByRole('button', { name: 'Send consultation request' }).click();
  const summary = page.getByTestId('error-summary').getByRole('alert');
  await summary.waitFor();
  assert.match(await summary.innerText(), /Please fix these/);
  assert.equal(await page.locator('[aria-invalid="true"]').count() >= 8, true);
  assert.equal(requests.length, 0);
  await close();
});

test('consultation: service from the Services page is preselected', async () => {
  const { page, close } = await open('/services');
  await page.getByRole('link', { name: 'Ask about the Business Systems Implementation' }).click();
  await page.waitForURL('**/consultation?service=systems-implementation');
  assert.equal(await page.getByLabel('Service you are interested in').inputValue(), 'systems-implementation');
  await close();
});

test('consultation: valid submit sends one request with attribution and shows the reference', async () => {
  // Arrive from a LinkedIn post link, browse, then submit.
  const { page, requests, errors, close } = await open('/?utm_source=linkedin&utm_medium=social&utm_campaign=oct-post', { api: ok('ADZ-2026-ABCD') });
  await page.getByRole('link', { name: /Book an Executive Consultation/ }).click();
  await page.waitForURL('**/consultation');
  await page.getByLabel('Service you are interested in').selectOption('health-check');
  await fillConsultation(page);
  const button = page.getByRole('button', { name: 'Send consultation request' });
  await button.click();
  await button.click({ force: true }).catch(() => {}); // a second tap while sending must not resend
  await page.getByTestId('consultation-success').waitFor();
  assert.equal(await page.getByTestId('lead-reference').innerText(), 'ADZ-2026-ABCD');

  assert.equal(requests.length, 1, 'exactly one request');
  const body = requests[0].body;
  assert.match(requests[0].url, /\/api\/consultation$/);
  assert.equal(body.service, 'health-check');
  assert.equal(body.privacyAck, true);
  assert.equal(body.marketingConsent, false);
  assert.equal(body.website, '');
  assert.ok(body.submissionId);
  assert.equal(body.attribution.source, 'linkedin-organic');
  assert.equal(body.attribution.utm_campaign, 'oct-post');
  assert.equal(body.attribution.landingPath, '/');
  assert.equal(body.attribution.formPath, '/consultation');
  assert.ok(!page.url().includes('Bello'), 'personal data must not appear in the URL');
  assert.deepEqual(errors, []);
  await close();
});

test('consultation: server failure keeps the form filled and offers the phone number', async () => {
  const { page, close } = await open('/consultation', { api: (route) => route.fulfill({ status: 500, body: 'oops' }) });
  await page.getByLabel('Service you are interested in').selectOption('not-sure');
  await fillConsultation(page);
  await page.getByRole('button', { name: 'Send consultation request' }).click();
  const failure = page.getByTestId('submit-failure');
  await failure.waitFor();
  assert.match(await failure.innerText(), /was not sent[\s\S]*0703 524 6809/);
  assert.equal(await page.getByLabel('Full name').inputValue(), 'Ade Bello');
  await close();
});

test('consultation: server-side field errors are shown on the form', async () => {
  const { page, close } = await open('/consultation', {
    api: (route) =>
      route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ ok: false, errors: { phone: 'Enter a valid phone number, like 0803 123 4567.' } }) }),
  });
  await page.getByLabel('Service you are interested in').selectOption('not-sure');
  await fillConsultation(page);
  await page.getByRole('button', { name: 'Send consultation request' }).click();
  await page.getByTestId('error-summary').getByRole('alert').waitFor();
  assert.equal(await page.getByLabel('Phone / WhatsApp number').getAttribute('aria-invalid'), 'true');
  await close();
});

test('checklist: request flow with optional marketing consent recorded separately', async () => {
  const { page, requests, close } = await open('/checklist', { api: ok() });
  await page.getByRole('button', { name: 'Send me the checklist' }).click();
  await page.getByTestId('error-summary').getByRole('alert').waitFor();
  assert.equal(requests.length, 0);

  await page.getByLabel('Your name').fill('Ade');
  await page.getByLabel('Email address').fill('ade@example.com');
  await page.getByLabel(/I have read the/).check();
  await page.getByLabel(/Optional: send me occasional/).check();
  await page.getByRole('button', { name: 'Send me the checklist' }).click();
  await page.getByTestId('checklist-success').waitFor();
  assert.match(await page.getByTestId('checklist-success').innerText(), /ade@example\.com/);
  assert.equal(requests.length, 1);
  assert.match(requests[0].url, /\/api\/checklist$/);
  assert.equal(requests[0].body.marketingConsent, true);
  assert.equal(requests[0].body.privacyAck, true);
  assert.equal(requests[0].body.attribution.source, 'direct');
  await close();
});

test('checklist page lists all 8 areas without needing financial records', async () => {
  const { page, close } = await open('/checklist');
  assert.equal(await page.getByTestId('checklist-areas').locator('li').count(), 8);
  assert.match(await page.locator('main').innerText(), /No financial records needed/);
  await close();
});

test('services page: every service has scope, process, limitations and a working CTA', async () => {
  const { page, close } = await open('/services');
  for (const id of ['health-check', 'systems-implementation', 'ongoing-advisory']) {
    const card = page.getByTestId(`service-${id}`);
    const text = await card.innerText();
    for (const heading of [/problem it solves/i, /who it is for/i, /scope/i, /how the engagement runs/i, /good to know/i]) {
      assert.match(text, heading, `${id} missing ${heading}`);
    }
    assert.equal(await card.locator(`a[href="/consultation?service=${id}"]`).count(), 1);
  }
  assert.doesNotMatch(await page.locator('main').innerText(), /₦\s?\d/, 'no prices on the services page');
  await close();
});

test('homepage service links jump to the matching section', async () => {
  const { page, close } = await open('/');
  await page.getByRole('link', { name: 'Learn About Retainer Advisory' }).click();
  await page.waitForURL('**/services#ongoing-advisory');
  await page.waitForTimeout(200);
  const top = await page.getByTestId('service-ongoing-advisory').evaluate((el) => el.getBoundingClientRect().top);
  assert.ok(top >= 0 && top < 200, `section top at ${top}px`);
  await close();
});

test('about page shows founder and contact details', async () => {
  const { page, close } = await open('/about');
  const text = await page.locator('main').innerText();
  assert.match(text, /Adebisi Wasiu Shina/);
  assert.match(text, /Iwo, Osun State/);
  await close();
});
