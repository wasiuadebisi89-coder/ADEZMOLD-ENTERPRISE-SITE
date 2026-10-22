// Stage 5: download links, PDF, Resend mailer and post-save delivery.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { readFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import { createDownloadToken, verifyDownloadToken } from '../../server/tokens.js';
import { createMailer } from '../../server/email/mailer.js';
import { consultationAckEmail, internalAlertEmail } from '../../server/email/templates.js';
import { createLeadHandler } from '../../server/handler.js';
import { createDownloadHandler } from '../../server/download.js';
import { createMemoryStore } from '../../server/store.js';
import { checklist, consultation } from '../../server/leads.js';
import { buildChecklistPdf, PDF_PATH } from '../../scripts/build-checklist-pdf.mjs';

const SECRET = 'test-secret-0123456789';
const REF = 'ADZ-2610-7KQ3M';

// ---------- helpers ----------
function request({ method = 'POST', body, url = '/', headers = {} } = {}) {
  const payload = body === undefined ? '' : JSON.stringify(body);
  const req = Readable.from(payload ? [Buffer.from(payload)] : []);
  Object.assign(req, { method, url, headers: { 'content-type': 'application/json', host: 'adezmold.test', 'x-forwarded-for': '203.0.113.7', ...headers } });
  return req;
}
function response() {
  const res = { statusCode: 0, headers: {}, body: Buffer.alloc(0) };
  res.setHeader = (k, v) => (res.headers[k.toLowerCase()] = v);
  res.end = (b = '') => (res.body = Buffer.isBuffer(b) ? b : Buffer.from(String(b)));
  res.json = () => JSON.parse(res.body.toString());
  return res;
}
async function call(h, opts) {
  const res = response();
  await h(request(opts), res);
  return res;
}
/** Fake Resend: records calls, answers with the given status. */
function fakeResend(status = 200) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, headers: init.headers, body: JSON.parse(init.body) });
    if (status === 'throw') throw new Error('socket hang up');
    return { ok: status === 200, status, json: async () => (status === 200 ? { id: `re_${calls.length}` } : { name: 'validation_error' }) };
  };
  return { calls, fetchImpl };
}

let logs;
let saved;
beforeEach(() => {
  logs = [];
  saved = { info: console.info, warn: console.warn, error: console.error };
  for (const l of ['info', 'warn', 'error']) console[l] = (line) => logs.push(line);
});
afterEach(() => Object.assign(console, saved));

const emailEnv = { RESEND_API_KEY: 're_test', EMAIL_FROM: 'Adezmold <hello@adezmold.test>', LEAD_ALERT_TO: 'owner@adezmold.test', SITE_URL: 'https://adezmold.test', DOWNLOAD_TOKEN_SECRET: SECRET };
const checklistBody = (n = 1) => ({ fullName: 'Ade <b>Bello</b>', email: 'ade@example.com', businessName: '', businessType: '', privacyAck: true, marketingConsent: false, website: '', submissionId: `chk-000${n}-aaaa`, attribution: {} });
const consultationBody = (extra = {}) => ({
  fullName: 'Ade Bello', businessName: 'Bello Produce', businessType: 'wholesaler', businessSize: '6-20', email: 'ade@example.com', phone: '08031234567',
  preferredContact: 'phone', challenge: 'credit', recordsState: 'paper', timeframe: 'urgent', service: 'health-check', additionalInfo: '', privacyAck: true,
  marketingConsent: false, website: '', submissionId: 'con-0001-aaaa', attribution: { source: 'linkedin-organic' }, ...extra,
});

// ---------- tokens ----------
test('download tokens: valid, tampered, expired, wrong secret', () => {
  const t = createDownloadToken(REF, SECRET, 1_000_000);
  assert.deepEqual(verifyDownloadToken(t, SECRET, 1_000_001), { ok: true, reference: REF });
  assert.equal(verifyDownloadToken(t, SECRET, 1_000_000 + 8 * 86400000).reason, 'expired');
  assert.equal(verifyDownloadToken(t, 'other-secret', 1_000_001).reason, 'invalid');
  const [p, s] = t.split('.');
  const forged = Buffer.from(`ADZ-2610-AAAAA.${1_000_000 + 7 * 86400000}`).toString('base64url');
  assert.equal(verifyDownloadToken(`${forged}.${s}`, SECRET, 1_000_001).reason, 'invalid', 'cannot swap the reference');
  assert.equal(verifyDownloadToken(`${p}.${s.slice(0, -2)}xx`, SECRET, 1_000_001).reason, 'invalid');
  for (const junk of [null, '', 'abc', 'a.b.c', 'x'.repeat(400)]) assert.equal(verifyDownloadToken(junk, SECRET).ok, false);
  assert.throws(() => createDownloadToken(REF, ''), /DOWNLOAD_TOKEN_SECRET/);
});

// ---------- PDF ----------
test('committed PDF is up to date with the checklist content', async () => {
  const fresh = Buffer.from(await buildChecklistPdf());
  const committed = await readFile(PDF_PATH);
  assert.ok(committed.equals(fresh), 'run `npm run build:pdf` and commit the result');
  const doc = await PDFDocument.load(committed);
  assert.equal(doc.getTitle(), 'The 25-Point Produce Business Health Checklist');
  assert.ok(doc.getPageCount() >= 2);
});

// ---------- mailer ----------
test('mailer is a no-op until configured', async () => {
  const { calls, fetchImpl } = fakeResend();
  const m = createMailer({ apiKey: '', from: '' }, { fetchImpl });
  assert.equal(m.configured, false);
  assert.deepEqual(await m.send({ to: 'a@b.co', subject: 's', html: 'h', text: 't' }), { status: 'not-configured' });
  assert.equal(calls.length, 0);
});

test('mailer sends through Resend with auth, idempotency key and reply-to', async () => {
  const { calls, fetchImpl } = fakeResend();
  const m = createMailer({ apiKey: 're_key', from: 'A <a@x.co>', replyTo: 'r@x.co' }, { fetchImpl });
  const r = await m.send({ to: 'v@y.co', subject: 'Hi', html: '<p>h</p>', text: 'h', idempotencyKey: 'K1' });
  assert.deepEqual(r, { status: 'sent', id: 're_1' });
  assert.equal(calls[0].url, 'https://api.resend.com/emails');
  assert.equal(calls[0].headers.Authorization, 'Bearer re_key');
  assert.equal(calls[0].headers['Idempotency-Key'], 'K1');
  assert.deepEqual(calls[0].body.to, ['v@y.co']);
  assert.equal(calls[0].body.reply_to, 'r@x.co');
});

test('mailer reports provider errors and network failures as "failed"', async () => {
  assert.equal((await createMailer({ apiKey: 'k', from: 'f' }, fakeResend(422)).send({ to: 'a@b.co' })).status, 'failed');
  const r = await createMailer({ apiKey: 'k', from: 'f' }, fakeResend('throw')).send({ to: 'a@b.co' });
  assert.deepEqual(r, { status: 'failed', error: 'network' });
});

// ---------- templates ----------
test('email templates escape submitted text', () => {
  const lead = {
    reference: REF, kind: 'consultation', marketingConsent: false, attribution: { source: 'direct' },
    contact: { fullName: '<script>x</script> Ade', email: 'a@b.co', phone: '+2348031234567', preferredContact: 'whatsapp' },
    business: { name: 'Bello & Sons "Ltd"', type: 'wholesaler', size: '6-20' },
    inquiry: { service: 'health-check', challenge: 'credit', recordsState: 'paper', timeframe: 'urgent', additionalInfo: '<img src=x onerror=alert(1)>' },
  };
  const alert = internalAlertEmail({ lead });
  assert.ok(!alert.html.includes('<script>') && !alert.html.includes('<img src=x'));
  assert.ok(alert.html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.match(alert.html, /Produce Business Health Check/);
  assert.match(alert.subject, /Bello & Sons "Ltd"/);
  const ack = consultationAckEmail({ lead });
  assert.ok(ack.html.includes('Bello &amp; Sons &quot;Ltd&quot;'));
  assert.match(ack.text, /whatsapp/);
});

// ---------- delivery through the API ----------
test('checklist: lead saved, download link returned, email + alert accepted and recorded', async () => {
  const store = createMemoryStore();
  const { calls, fetchImpl } = fakeResend();
  const mailer = createMailer({ apiKey: 'k', from: 'f', alertTo: ['owner@adezmold.test'] }, { fetchImpl });
  const h = createLeadHandler({ ...checklist, getStore: () => store, env: emailEnv, mailer });
  const res = await call(h, { body: checklistBody() });
  const body = res.json();
  assert.equal(res.statusCode, 200);
  assert.match(body.downloadUrl, /^\/api\/checklist-download\?t=/);
  assert.equal(body.emailed, true);

  assert.equal(calls.length, 2);
  const delivery = calls.find((c) => c.body.to.includes('ade@example.com'));
  assert.ok(delivery.body.html.includes('https://adezmold.test/api/checklist-download?t='), 'absolute link in email');
  assert.ok(!delivery.body.html.includes('<b>Bello</b>'), 'name escaped');
  assert.equal(delivery.headers['Idempotency-Key'], `${body.reference}-checklist`);
  assert.ok(calls.some((c) => c.body.to.includes('owner@adezmold.test')));

  const lead = store.data.leads.get(body.reference);
  assert.equal(lead.email.checklistDelivery.state, 'sent');
  assert.equal(lead.email.checklistDelivery.providerId.startsWith('re_'), true);
  assert.equal(lead.email.internalAlert.state, 'sent');
});

test('a repeated submission gets the link again but sends no new emails', async () => {
  const store = createMemoryStore();
  const { calls, fetchImpl } = fakeResend();
  const mailer = createMailer({ apiKey: 'k', from: 'f', alertTo: ['o@x.co'] }, { fetchImpl });
  const h = createLeadHandler({ ...checklist, getStore: () => store, env: emailEnv, mailer });
  await call(h, { body: checklistBody(1) });
  const again = (await call(h, { body: checklistBody(2) })).json(); // same email, same day
  assert.ok(again.downloadUrl);
  assert.equal(again.emailed, undefined, 'does not claim a new email');
  assert.equal(calls.length, 2, 'only the first submission sent emails');
});

test('email failure never loses the lead and is recorded as failed', async () => {
  const store = createMemoryStore();
  const mailer = createMailer({ apiKey: 'k', from: 'f', alertTo: ['o@x.co'] }, fakeResend(500));
  const h = createLeadHandler({ ...consultation, getStore: () => store, env: emailEnv, mailer });
  const res = await call(h, { body: consultationBody() });
  assert.equal(res.statusCode, 200);
  const { reference, emailed } = res.json();
  assert.equal(emailed, false);
  const lead = store.data.leads.get(reference);
  assert.equal(lead.status, 'new');
  assert.equal(lead.email.acknowledgement.state, 'failed');
  assert.equal(lead.email.internalAlert.state, 'failed');
  assert.ok(logs.some((l) => l.includes('email_outcome') && l.includes('failed')));
  assert.ok(!logs.join('\n').includes('ade@example.com'), 'no email addresses in logs');
});

test('a crashing mailer still returns the saved lead', async () => {
  const store = createMemoryStore();
  const mailer = { configured: true, send: async () => { throw new Error('boom'); } };
  const h = createLeadHandler({ ...consultation, getStore: () => store, env: emailEnv, mailer });
  const res = await call(h, { body: consultationBody() });
  assert.equal(res.statusCode, 200);
  assert.equal(store.data.leads.size, 1);
  assert.equal(store.data.leads.get(res.json().reference).email.acknowledgement.state, 'failed');
});

test('consultation without an email skips the acknowledgement but still alerts Adezmold', async () => {
  const store = createMemoryStore();
  const { calls, fetchImpl } = fakeResend();
  const mailer = createMailer({ apiKey: 'k', from: 'f', alertTo: ['o@x.co'] }, { fetchImpl });
  const h = createLeadHandler({ ...consultation, getStore: () => store, env: emailEnv, mailer });
  const { reference } = (await call(h, { body: consultationBody({ email: '' }) })).json();
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].body.to, ['owner@adezmold.test'], 'alert goes to LEAD_ALERT_TO');
  assert.equal(store.data.leads.get(reference).email.acknowledgement.state, 'skipped-no-email');
});

test('without email settings everything is recorded as not-configured', async () => {
  const store = createMemoryStore();
  const h = createLeadHandler({ ...checklist, getStore: () => store, env: { DOWNLOAD_TOKEN_SECRET: SECRET } });
  const body = (await call(h, { body: checklistBody() })).json();
  assert.ok(body.downloadUrl, 'download still works without email');
  assert.equal(body.emailed, false);
  const lead = store.data.leads.get(body.reference);
  assert.equal(lead.email.checklistDelivery.state, 'not-configured');
  assert.equal(lead.email.internalAlert.state, 'not-configured');
});

// ---------- download endpoint ----------
test('download endpoint serves the PDF for a valid link and records it', async () => {
  const store = createMemoryStore();
  const h = createLeadHandler({ ...checklist, getStore: () => store, env: { DOWNLOAD_TOKEN_SECRET: SECRET } });
  const { downloadUrl, reference } = (await call(h, { body: checklistBody() })).json();
  const dl = createDownloadHandler({ getStore: () => store, env: { DOWNLOAD_TOKEN_SECRET: SECRET } });

  const res = await call(dl, { method: 'GET', url: downloadUrl });
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['content-type'], 'application/pdf');
  assert.match(res.headers['content-disposition'], /attachment/);
  assert.equal(res.body.subarray(0, 5).toString(), '%PDF-');
  assert.equal(store.data.leads.get(reference).downloads, 1);
});

test('download endpoint refuses bad, expired and unsigned links', async () => {
  const dl = createDownloadHandler({ getStore: () => createMemoryStore(), env: { DOWNLOAD_TOKEN_SECRET: SECRET } });
  assert.equal((await call(dl, { method: 'GET', url: '/api/checklist-download?t=nonsense' })).statusCode, 403);
  assert.equal((await call(dl, { method: 'GET', url: '/api/checklist-download' })).statusCode, 403);
  const old = createDownloadToken(REF, SECRET, Date.now() - 8 * 86400000);
  assert.equal((await call(dl, { method: 'GET', url: `/api/checklist-download?t=${old}` })).statusCode, 410);
  assert.equal((await call(dl, { method: 'POST', url: '/api/checklist-download' })).statusCode, 405);
  const noSecret = createDownloadHandler({ getStore: () => createMemoryStore(), env: {} });
  const t = createDownloadToken(REF, SECRET);
  assert.equal((await call(noSecret, { method: 'GET', url: `/api/checklist-download?t=${t}` })).statusCode, 403);
});
