// Lead register API tests (in-memory store, fake auth service).
// Real Firebase Auth behaviour is covered in admin-auth.emulator.test.mjs.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createAdminHandler, COOKIE } from '../../server/admin.js';
import { fakeAuth } from './fake-auth.mjs';
import { createLeadHandler } from '../../server/handler.js';
import { createMemoryStore } from '../../server/store.js';
import { checklist, consultation } from '../../server/leads.js';

// ---------- helpers ----------
function request({ method = 'GET', path, body, cookie, headers = {} }) {
  const payload = body === undefined ? '' : JSON.stringify(body);
  const req = Readable.from(payload ? [Buffer.from(payload)] : []);
  Object.assign(req, {
    method,
    url: path,
    headers: {
      host: 'adezmold.test',
      'x-forwarded-for': '203.0.113.7',
      ...(method !== 'GET' ? { origin: 'https://adezmold.test', 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie: `${COOKIE}=${encodeURIComponent(cookie)}` } : {}),
      ...headers,
    },
  });
  return req;
}
function response() {
  const res = { statusCode: 0, headers: {}, body: '' };
  res.setHeader = (k, v) => (res.headers[k.toLowerCase()] = v);
  res.end = (b = '') => (res.body = String(b));
  res.json = () => JSON.parse(res.body);
  return res;
}
const cookieFrom = (res) => decodeURIComponent(/__Host-adz_admin=([^;]*)/.exec(res.headers['set-cookie'])[1]);

let store, auth, admin, logs, saved;
beforeEach(async () => {
  store = createMemoryStore();
  auth = fakeAuth();
  admin = createAdminHandler({ getStore: () => store, getAuthService: () => auth, env: { RATE_LIMIT_SALT: 's' } });
  logs = [];
  saved = { info: console.info, warn: console.warn, error: console.error };
  for (const l of ['info', 'warn', 'error']) console[l] = (line) => logs.push(line);
  // seed two leads through the real public endpoints
  const c = createLeadHandler({ ...consultation, getStore: () => store, env: {} });
  const k = createLeadHandler({ ...checklist, getStore: () => store, env: {} });
  for (const [h, body] of [
    [c, { fullName: 'Ade Bello', businessName: 'Bello Produce', businessType: 'wholesaler', businessSize: '6-20', email: 'ade@example.com', phone: '08031234567', preferredContact: 'phone', challenge: 'credit', recordsState: 'paper', timeframe: 'urgent', service: 'health-check', additionalInfo: '=HYPERLINK("http://evil")', privacyAck: true, marketingConsent: true, website: '', submissionId: 'seed-0001-aaaa', attribution: { source: 'linkedin-organic', utm_campaign: 'oct' } }],
    [k, { fullName: 'Kemi Ola', email: 'kemi@example.com', businessName: 'Ola Grains', businessType: '', privacyAck: true, marketingConsent: false, website: '', submissionId: 'seed-0002-bbbb', attribution: {} }],
  ]) {
    const res = response();
    await h(Object.assign(Readable.from([Buffer.from(JSON.stringify(body))]), { method: 'POST', url: '/', headers: { 'content-type': 'application/json', host: 'adezmold.test', 'x-forwarded-for': '198.51.100.1' } }), res);
  }
});
afterEach(() => Object.assign(console, saved));

async function call(opts) {
  const res = response();
  await admin(request(opts), res);
  return res;
}
async function login(email = 'owner@adezmold.test', password = 'right-pass') {
  const res = await call({ method: 'POST', path: '/api/admin/login', body: { email, password } });
  assert.equal(res.statusCode, 200, res.body);
  return cookieFrom(res);
}
const refs = () => [...store.data.leads.keys()];

// ---------- tests ----------
test('login sets a secure, HttpOnly, SameSite=Strict session cookie', async () => {
  const res = await call({ method: 'POST', path: '/api/admin/login', body: { email: 'Owner@Adezmold.test ', password: 'right-pass' } });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json().user, { email: 'owner@adezmold.test', role: 'admin' });
  const c = res.headers['set-cookie'];
  for (const part of ['__Host-adz_admin=', 'HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/', 'Max-Age=28800']) assert.ok(c.includes(part), `cookie missing ${part}`);
  assert.ok(!res.body.includes('sess-'), 'session value is never in the response body');
  assert.ok(store.data.audit.some((a) => a.action === 'login' && a.by === 'owner@adezmold.test'));
});

test('wrong password and accounts without a role get the same generic answer', async () => {
  const wrong = await call({ method: 'POST', path: '/api/admin/login', body: { email: 'owner@adezmold.test', password: 'nope' } });
  const norole = await call({ method: 'POST', path: '/api/admin/login', body: { email: 'nobody@x.co', password: 'pw' } });
  assert.equal(wrong.statusCode, 401);
  assert.deepEqual(wrong.json(), norole.json());
  assert.equal(wrong.headers['set-cookie'], undefined);
});

test('login is rate-limited per email and per IP', async () => {
  const codes = [];
  for (let i = 0; i < 6; i++) codes.push((await call({ method: 'POST', path: '/api/admin/login', body: { email: 'owner@adezmold.test', password: 'bad' } })).statusCode);
  assert.deepEqual(codes, [401, 401, 401, 401, 401, 429]);
  const ipCodes = [];
  for (let i = 0; i < 6; i++) ipCodes.push((await call({ method: 'POST', path: '/api/admin/login', body: { email: `x${i}@y.co`, password: 'bad' } })).statusCode);
  assert.equal(ipCodes.at(-1), 429, 'IP limit (10 per 15 min) reached across emails');
});

test('every lead route rejects requests without a valid session', async () => {
  const r = refs()[0];
  for (const [method, path, body] of [
    ['GET', '/api/admin/session'],
    ['GET', '/api/admin/leads'],
    ['GET', `/api/admin/leads/${r}`],
    ['PATCH', `/api/admin/leads/${r}`, { version: '1', changes: { status: 'won' } }],
    ['POST', `/api/admin/leads/${r}/notes`, { text: 'x' }],
    ['DELETE', `/api/admin/leads/${r}`, { confirm: r }],
    ['GET', '/api/admin/export.csv'],
  ]) {
    for (const cookie of [undefined, 'forged-cookie']) {
      const res = await call({ method, path, body, cookie });
      assert.equal(res.statusCode, 401, `${method} ${path} with ${cookie ?? 'no cookie'}`);
    }
  }
  assert.equal(store.data.leads.get(r).status, 'new', 'nothing changed');
});

test('list returns summaries, counts and supports filters and search', async () => {
  const cookie = await login();
  const all = (await call({ path: '/api/admin/leads', cookie })).json();
  assert.equal(all.leads.length, 2);
  assert.deepEqual(all.counts, { new: 2 });
  assert.equal(all.leads[0].additionalInfo, undefined, 'list holds summaries only');
  const li = (await call({ path: '/api/admin/leads?source=linkedin-organic', cookie })).json();
  assert.deepEqual(li.leads.map((l) => l.name), ['Ade Bello']);
  const q = (await call({ path: '/api/admin/leads?q=ola%20grains', cookie })).json();
  assert.deepEqual(q.leads.map((l) => l.name), ['Kemi Ola']);
  const kind = (await call({ path: '/api/admin/leads?kind=checklist', cookie })).json();
  assert.equal(kind.leads.length, 1);
});

test('the Vercel rewrite form (?route=) reaches the same routes', async () => {
  const cookie = await login();
  const res = await call({ path: '/api/admin?route=leads&kind=consultation', cookie });
  assert.equal(res.json().leads.length, 1);
});

test('staff update the pipeline; each change lands in the activity history', async () => {
  const cookie = await login('staff@adezmold.test', 'staff-pass');
  const ref = refs()[0];
  const { lead } = (await call({ path: `/api/admin/leads/${ref}`, cookie })).json();
  const res = await call({
    method: 'PATCH',
    path: `/api/admin/leads/${ref}`,
    cookie,
    body: { version: lead.version, changes: { status: 'proposal-sent', owner: 'Adebisi', followUpAt: '2026-11-03', proposalValue: '₦450,000', outcome: '' } },
  });
  assert.equal(res.statusCode, 200, res.body);
  const out = res.json();
  assert.equal(out.changed, 4, 'outcome unchanged (empty -> null) so not counted');
  assert.equal(out.lead.status, 'proposal-sent');
  assert.equal(out.lead.pipeline.proposalValue, 450000);
  assert.notEqual(out.lead.version, lead.version);
  const hist = out.activity.filter((a) => a.by === 'staff@adezmold.test');
  assert.deepEqual(hist.map((a) => a.field ?? a.type).sort(), ['followUpAt', 'owner', 'proposalValue', 'status']);
  assert.equal(hist.find((a) => a.type === 'status').from, 'new');
  assert.ok(store.data.audit.some((a) => a.action === 'lead_update' && a.reference === ref));
});

test('a stale version is refused (two people editing the same lead)', async () => {
  const cookie = await login();
  const ref = refs()[0];
  const { lead } = (await call({ path: `/api/admin/leads/${ref}`, cookie })).json();
  const first = await call({ method: 'PATCH', path: `/api/admin/leads/${ref}`, cookie, body: { version: lead.version, changes: { status: 'contacted' } } });
  assert.equal(first.statusCode, 200);
  const second = await call({ method: 'PATCH', path: `/api/admin/leads/${ref}`, cookie, body: { version: lead.version, changes: { status: 'lost' } } });
  assert.equal(second.statusCode, 409);
  assert.equal(store.data.leads.get(ref).status, 'contacted');
});

test('invalid pipeline values are rejected', async () => {
  const cookie = await login();
  const ref = refs()[0];
  const { lead } = (await call({ path: `/api/admin/leads/${ref}`, cookie })).json();
  const res = await call({ method: 'PATCH', path: `/api/admin/leads/${ref}`, cookie, body: { version: lead.version, changes: { status: 'paid', proposalValue: '-5', followUpAt: 'tomorrow' } } });
  assert.equal(res.statusCode, 422);
  assert.deepEqual(Object.keys(res.json().errors).sort(), ['followUpAt', 'proposalValue', 'status']);
});

test('notes are stored with the author and kept apart from the lead fields', async () => {
  const cookie = await login('staff@adezmold.test', 'staff-pass');
  const ref = refs()[0];
  const res = await call({ method: 'POST', path: `/api/admin/leads/${ref}/notes`, cookie, body: { text: 'Called, prefers mornings.' } });
  assert.equal(res.statusCode, 200);
  const note = res.json().activity.find((a) => a.type === 'note');
  assert.equal(note.text, 'Called, prefers mornings.');
  assert.equal(note.by, 'staff@adezmold.test');
  assert.equal(store.data.leads.get(ref).notes, undefined);
  assert.equal((await call({ method: 'POST', path: `/api/admin/leads/${ref}/notes`, cookie, body: { text: '   ' } })).statusCode, 422);
});

test('staff cannot export or delete; admins can', async () => {
  const staff = await login('staff@adezmold.test', 'staff-pass');
  const ref = refs()[0];
  assert.equal((await call({ path: '/api/admin/export.csv', cookie: staff })).statusCode, 403);
  assert.equal((await call({ method: 'DELETE', path: `/api/admin/leads/${ref}`, cookie: staff, body: { confirm: ref } })).statusCode, 403);
  assert.ok(store.data.leads.has(ref));
});

test('admin CSV export is spreadsheet-safe and audited', async () => {
  const cookie = await login();
  const res = await call({ path: '/api/admin/export.csv', cookie });
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['content-type'], /text\/csv/);
  assert.match(res.headers['content-disposition'], /attachment; filename="adezmold-leads-/);
  const lines = res.body.replace(/^﻿/, '').trim().split('\r\n');
  assert.equal(lines.length, 3);
  assert.match(lines[0], /^Reference,Created,Type,Stage,Name/);
  assert.ok(res.body.includes('Ade Bello') && res.body.includes('LinkedIn (organic)'));
  assert.ok(!res.body.includes('HYPERLINK'), 'free-text notes from the visitor are not exported');
  assert.ok(store.data.audit.some((a) => a.action === 'export' && a.count === 2));
});

test('formula-like values are neutralised in CSV cells', async () => {
  const cookie = await login();
  const ref = refs()[0];
  const { lead } = (await call({ path: `/api/admin/leads/${ref}`, cookie })).json();
  await call({ method: 'PATCH', path: `/api/admin/leads/${ref}`, cookie, body: { version: lead.version, changes: { owner: '=1+1', outcome: '@SUM(A1)' } } });
  const csv = (await call({ path: '/api/admin/export.csv', cookie })).body;
  assert.ok(csv.includes("'=1+1") && csv.includes("'@SUM(A1)"));
});

test('admin deletion needs the reference typed back and removes lead, history and consent', async () => {
  const cookie = await login();
  const ref = refs()[0];
  assert.equal((await call({ method: 'DELETE', path: `/api/admin/leads/${ref}`, cookie, body: { confirm: 'yes' } })).statusCode, 422);
  const res = await call({ method: 'DELETE', path: `/api/admin/leads/${ref}`, cookie, body: { confirm: ref } });
  assert.equal(res.statusCode, 200);
  assert.ok(!store.data.leads.has(ref));
  assert.equal(store.data.activity.filter((a) => a.leadId === ref).length, 0);
  assert.equal(store.data.consents.filter((c) => c.leadId === ref).length, 0);
  assert.ok(store.data.audit.some((a) => a.action === 'lead_delete' && a.reference === ref));
  assert.equal((await call({ path: `/api/admin/leads/${ref}`, cookie })).statusCode, 404);
});

test('cross-site requests are refused even with a valid session', async () => {
  const cookie = await login();
  const ref = refs()[0];
  const res = await call({ method: 'POST', path: `/api/admin/leads/${ref}/notes`, cookie, body: { text: 'x' }, headers: { origin: 'https://evil.example' } });
  assert.equal(res.statusCode, 403);
  const noOrigin = await call({ method: 'POST', path: `/api/admin/leads/${ref}/notes`, cookie, body: { text: 'x' }, headers: { origin: '' } });
  assert.equal(noOrigin.statusCode, 403);
});

test('logout revokes the session everywhere and clears the cookie', async () => {
  const cookie = await login();
  const out = await call({ method: 'POST', path: '/api/admin/logout', cookie });
  assert.equal(out.statusCode, 200);
  assert.match(out.headers['set-cookie'], /Max-Age=0/);
  assert.equal((await call({ path: '/api/admin/session', cookie })).statusCode, 401);
});

test('admin responses are never cached or indexed, and logs hold no lead details', async () => {
  const cookie = await login();
  const res = await call({ path: '/api/admin/leads', cookie });
  assert.equal(res.headers['cache-control'], 'no-store');
  assert.match(res.headers['x-robots-tag'], /noindex/);
  const all = logs.join('\n');
  for (const pii of ['Ade Bello', 'ade@example.com', 'right-pass', '203.0.113.7']) assert.ok(!all.includes(pii), `log contains ${pii}`);
});

test('bad references and unknown routes give 404', async () => {
  const cookie = await login();
  assert.equal((await call({ path: '/api/admin/leads/../../etc', cookie })).statusCode, 404);
  assert.equal((await call({ path: '/api/admin/leads/ADZ-0000-AAAAA', cookie })).statusCode, 404);
  assert.equal((await call({ path: '/api/admin/whatever', cookie })).statusCode, 404);
});
