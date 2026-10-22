// API handler tests with the in-memory store (no network, no Firestore).
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createLeadHandler, sanitiseAttribution } from '../../server/handler.js';
import { createMemoryStore } from '../../server/store.js';
import { checklist, consultation } from '../../server/leads.js';
import { consultationHandler } from '../../server/endpoints.js';

const validConsultation = () => ({
  fullName: 'Ade Bello',
  businessName: 'Bello Produce Ventures',
  businessType: 'wholesaler',
  businessSize: '6-20',
  email: 'ade@example.com',
  phone: '0803 123 4567',
  preferredContact: 'whatsapp',
  challenge: 'stock-losses',
  recordsState: 'paper',
  timeframe: '1-month',
  service: 'health-check',
  additionalInfo: '',
  privacyAck: true,
  marketingConsent: true,
  website: '',
  submissionId: 'sub-0001-aaaa',
  attribution: { source: 'linkedin-organic', utm_source: 'linkedin', utm_campaign: 'oct-post', landingPath: '/', formPath: '/consultation' },
});

function request({ method = 'POST', body, headers = {}, raw } = {}) {
  const payload = raw ?? (body === undefined ? '' : JSON.stringify(body));
  const req = Readable.from(payload ? [Buffer.from(payload)] : []);
  req.method = method;
  req.headers = { 'content-type': 'application/json', host: 'adezmold.test', 'x-forwarded-for': '203.0.113.7', ...headers };
  return req;
}

function response() {
  const res = { statusCode: 0, headers: {}, body: '' };
  res.setHeader = (k, v) => (res.headers[k.toLowerCase()] = v);
  res.end = (b = '') => (res.body = String(b));
  res.json = () => JSON.parse(res.body);
  return res;
}

let store;
let logs;
let original;
beforeEach(() => {
  store = createMemoryStore();
  logs = [];
  original = { info: console.info, warn: console.warn, error: console.error };
  for (const level of ['info', 'warn', 'error']) console[level] = (line) => logs.push(line);
});
afterEach(() => Object.assign(console, original));

const handler = (kind = consultation, env = {}) => createLeadHandler({ ...kind, getStore: () => store, env });
async function call(h, opts) {
  const res = response();
  await h(request(opts), res);
  return res;
}

test('valid consultation is stored and gets a reference', async () => {
  const res = await call(handler(), { body: validConsultation() });
  assert.equal(res.statusCode, 200);
  const { ok, reference } = res.json();
  assert.ok(ok);
  assert.match(reference, /^ADZ-\d{4}-[0-9A-HJKMNP-TV-Z]{5}$/);
  assert.equal(res.headers['cache-control'], 'no-store');

  const lead = store.data.leads.get(reference);
  assert.equal(lead.status, 'new');
  assert.equal(lead.kind, 'consultation');
  assert.equal(lead.contact.phone, '+2348031234567');
  assert.equal(lead.inquiry.service, 'health-check');
  assert.equal(lead.attribution.source, 'linkedin-organic');
  assert.equal(lead.attribution.utm_campaign, 'oct-post');
  assert.deepEqual(lead.email, { acknowledgement: 'not-sent', internalAlert: 'not-sent' });
  assert.ok(lead.retainUntil > lead.createdAt);
  assert.equal(store.data.activity.filter((a) => a.leadId === reference).length, 1);
});

test('consent is recorded separately, with the privacy notice version', async () => {
  const res = await call(handler(consultation, { PRIVACY_NOTICE_VERSION: 'v1-test' }), { body: validConsultation() });
  const { reference } = res.json();
  assert.equal(store.data.consents.length, 1);
  const c = store.data.consents[0];
  assert.equal(c.leadId, reference);
  assert.equal(c.privacyAck, true);
  assert.equal(c.marketing, true);
  assert.equal(c.privacyNoticeVersion, 'v1-test');
  assert.equal(store.data.leads.get(reference).consent, undefined, 'lead does not embed the consent record');
});

test('retrying the same submission returns the same reference and stores one lead', async () => {
  const h = handler();
  const [a, b] = await Promise.all([call(h, { body: validConsultation() }), call(h, { body: validConsultation() })]);
  assert.equal(a.json().reference, b.json().reference);
  assert.equal(store.data.leads.size, 1);
  assert.ok(logs.some((l) => l.includes('lead_duplicate')));
});

test('same person, same service, same day with a new submission id is treated as a duplicate', async () => {
  const h = handler();
  const first = await call(h, { body: validConsultation() });
  const second = await call(h, { body: { ...validConsultation(), submissionId: 'sub-0002-bbbb' } });
  assert.equal(first.json().reference, second.json().reference);
  assert.equal(store.data.leads.size, 1);
  const other = await call(h, { body: { ...validConsultation(), submissionId: 'sub-0003-cccc', service: 'ongoing-advisory' } });
  assert.notEqual(other.json().reference, first.json().reference);
});

test('invalid data is rejected with field errors and nothing is stored', async () => {
  const res = await call(handler(), { body: { ...validConsultation(), email: 'nope', phone: '', privacyAck: false } });
  assert.equal(res.statusCode, 422);
  const { errors } = res.json();
  assert.ok(errors.email && errors.privacyAck);
  assert.equal(store.data.leads.size, 0);
});

test('tampered values (unknown service, consent as string) are rejected server-side', async () => {
  const res = await call(handler(), { body: { ...validConsultation(), service: 'admin', privacyAck: 'true' } });
  assert.equal(res.statusCode, 422);
  assert.ok(res.json().errors.service);
});

test('honeypot submissions look successful to bots but store nothing', async () => {
  const res = await call(handler(), { body: { ...validConsultation(), website: 'http://spam.example' } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().reference, undefined);
  assert.equal(store.data.leads.size, 0);
});

test('request guards: method, content type, origin, size, JSON, submission id', async () => {
  const h = handler();
  assert.equal((await call(h, { method: 'GET' })).statusCode, 405);
  assert.equal((await call(h, { body: validConsultation(), headers: { 'content-type': 'text/plain' } })).statusCode, 415);
  assert.equal((await call(h, { body: validConsultation(), headers: { origin: 'https://evil.example' } })).statusCode, 403);
  assert.equal((await call(h, { body: validConsultation(), headers: { origin: 'https://adezmold.test' } })).statusCode, 200);
  assert.equal((await call(h, { raw: '{"a":"' + 'x'.repeat(20000) + '"}' })).statusCode, 413);
  assert.equal((await call(h, { raw: '{not json' })).statusCode, 400);
  assert.equal((await call(h, { body: { ...validConsultation(), submissionId: '../../x' } })).statusCode, 400);
});

test('ALLOWED_ORIGINS restricts posts to the listed sites', async () => {
  const h = handler(consultation, { ALLOWED_ORIGINS: 'https://adezmold.com, https://www.adezmold.com/' });
  assert.equal((await call(h, { body: validConsultation(), headers: { origin: 'https://www.adezmold.com' } })).statusCode, 200);
  assert.equal((await call(h, { body: { ...validConsultation(), submissionId: 'sub-9' + 'x'.repeat(8) }, headers: { origin: 'https://adezmold.test' } })).statusCode, 403);
});

test('rate limit: the 6th request in 10 minutes from one IP is refused', async () => {
  const h = handler();
  const statuses = [];
  for (let i = 0; i < 6; i++) {
    statuses.push((await call(h, { body: { ...validConsultation(), submissionId: `sub-rate-${i}-xxxx`, email: `p${i}@example.com` } })).statusCode);
  }
  assert.deepEqual(statuses, [200, 200, 200, 200, 200, 429]);
  const other = await call(h, { body: { ...validConsultation(), submissionId: 'sub-other-ip-1' }, headers: { 'x-forwarded-for': '198.51.100.9' } });
  assert.equal(other.statusCode, 200, 'another IP is unaffected');
});

test('a storage failure returns a safe 500 and logs no personal data', async () => {
  store.createLead = async () => {
    throw Object.assign(new Error('ade@example.com boom'), { code: 'unavailable' });
  };
  const res = await call(handler(), { body: validConsultation() });
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.json(), { ok: false, error: 'server' });
  const all = logs.join('\n');
  assert.ok(all.includes('lead_save_failed'));
  for (const pii of ['ade@example.com', 'Ade Bello', '0803', '+234', '203.0.113.7']) assert.ok(!all.includes(pii), `log contains ${pii}`);
});

test('logs for successful leads contain no personal data or raw IP', async () => {
  await call(handler(), { body: validConsultation() });
  const all = logs.join('\n');
  for (const pii of ['ade@example.com', 'Ade Bello', 'Bello Produce', '+2348031234567', '203.0.113.7']) assert.ok(!all.includes(pii), `log contains ${pii}`);
});

test('production endpoint without Firebase credentials answers 503, not a crash', async () => {
  const saved = { ...process.env };
  for (const k of ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY', 'FIRESTORE_EMULATOR_HOST']) delete process.env[k];
  try {
    const res = response();
    await consultationHandler(request({ body: validConsultation() }), res);
    assert.equal(res.statusCode, 503);
  } finally {
    Object.assign(process.env, saved);
  }
});

test('checklist request is stored as a checklist lead and de-duplicated per email per day', async () => {
  const h = handler(checklist);
  const body = { fullName: 'Ade', email: 'Ade@Example.com', businessName: '', businessType: '', privacyAck: true, marketingConsent: false, website: '', submissionId: 'chk-0001-aaaa', attribution: {} };
  const a = await call(h, { body });
  const b = await call(h, { body: { ...body, submissionId: 'chk-0002-bbbb', email: 'ade@example.com' } });
  assert.equal(a.statusCode, 200);
  assert.equal(a.json().reference, b.json().reference);
  const lead = store.data.leads.get(a.json().reference);
  assert.equal(lead.kind, 'checklist');
  assert.equal(lead.contact.email, 'ade@example.com');
  assert.equal(lead.attribution.source, 'direct');
  assert.deepEqual(lead.email, { checklistDelivery: 'not-sent', internalAlert: 'not-sent' });
});

test('attribution is reduced to known fields with safe lengths', () => {
  const a = sanitiseAttribution({ source: 'hacker', utm_source: 'x'.repeat(500), evil: '<script>', referrerHost: 'www.linkedin.com' });
  assert.equal(a.source, 'direct');
  assert.equal(a.utm_source.length, 100);
  assert.equal(a.evil, undefined);
  assert.equal(a.referrerHost, 'www.linkedin.com');
});
