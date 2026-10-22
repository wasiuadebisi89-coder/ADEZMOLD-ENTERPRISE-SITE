// Lead register API: /api/admin/* (one function, routed here).
//
//   POST   login                {email,password}   -> sets session cookie
//   POST   logout
//   GET    session                                 -> current user
//   GET    leads?status&kind&source&service&q&due&followup&before
//   GET    leads/:ref                              -> lead + activity + consents
//   PATCH  leads/:ref           {version, changes}  (staff, admin)
//   POST   leads/:ref/notes     {text}             (staff, admin)
//   DELETE leads/:ref           {confirm: ref}     (admin only)
//   GET    export.csv?filters                      (admin only)
//
// Security: HttpOnly + Secure + SameSite=Strict session cookie, verified (with
// revocation check) on every request; role enforced here, not in the browser;
// state-changing requests also need a same-site Origin and a JSON body;
// login is rate-limited; every staff action is written to adminAudit.
import { randomUUID } from 'node:crypto';
import { readConfig, ConfigError } from './config.js';
import { sha256 } from './ids.js';
import { AuthError, SESSION_MS } from './auth.js';
import { ConflictError, NotFoundError } from './store.js';
import { statusLabel, sourceLabel, validatePipelineChanges } from '../src/content/pipeline.js';
import { serviceOptions, businessTypes, businessSizes, challenges, recordStates, timeframes } from '../src/content/forms.js';

export const COOKIE = '__Host-adz_admin';
const MAX_BODY = 16 * 1024;
const REF = /^ADZ-\d{4}-[0-9A-Z]{5}$/;
const LOGIN_LIMITS = [
  { scope: 'ip', limit: 10, windowMs: 15 * 60 * 1000 },
  { scope: 'email', limit: 5, windowMs: 15 * 60 * 1000 },
];

function send(res, status, body, headers = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(body));
}
const log = (level, event, fields) => console[level](JSON.stringify({ event, ...fields }));

function readCookie(req, name) {
  const header = req.headers.cookie ?? '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}
const sessionCookie = (value, maxAgeSec) =>
  `${COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAgeSec}`;

async function readJson(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  let raw = typeof req.body === 'string' || Buffer.isBuffer(req.body) ? String(req.body) : '';
  if (!raw) for await (const chunk of req) {
    raw += chunk;
    if (raw.length > MAX_BODY) throw Object.assign(new Error(), { status: 413 });
  }
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error();
    return v;
  } catch {
    throw Object.assign(new Error(), { status: 400 });
  }
}

function sameOrigin(req, config) {
  const origin = req.headers.origin;
  if (!origin) return false; // browsers always send Origin on these requests; its absence is suspicious
  const clean = origin.replace(/\/+$/, '');
  if (config.allowedOrigins.length) return config.allowedOrigins.includes(clean);
  try {
    return new URL(clean).host === (req.headers['x-forwarded-host'] || req.headers.host);
  } catch {
    return false;
  }
}

const clientIp = (req) => String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';

// ---------- lead list helpers ----------
const today = () => new Date().toISOString().slice(0, 10);

function matches(lead, f) {
  if (f.status && lead.status !== f.status) return false;
  if (f.kind && lead.kind !== f.kind) return false;
  if (f.source && lead.attribution?.source !== f.source) return false;
  if (f.service && lead.inquiry?.service !== f.service) return false;
  if (f.due === '1' && !(lead.retainUntil && lead.retainUntil < new Date().toISOString())) return false;
  if (f.followup === '1' && !(lead.pipeline?.followUpAt && lead.pipeline.followUpAt <= today() && !['won', 'lost'].includes(lead.status))) return false;
  if (f.q) {
    const hay = [lead.reference, lead.contact?.fullName, lead.contact?.email, lead.contact?.phone, lead.business?.name, lead.pipeline?.owner].join(' ').toLowerCase();
    if (!hay.includes(f.q.toLowerCase().trim())) return false;
  }
  return true;
}

const summary = (l) => ({
  reference: l.reference,
  kind: l.kind,
  status: l.status,
  createdAt: l.createdAt,
  name: l.contact?.fullName ?? null,
  business: l.business?.name ?? null,
  phone: l.contact?.phone ?? null,
  email: l.contact?.email ?? null,
  service: l.inquiry?.service ?? null,
  source: l.attribution?.source ?? null,
  owner: l.pipeline?.owner ?? null,
  followUpAt: l.pipeline?.followUpAt ?? null,
  proposalValue: l.pipeline?.proposalValue ?? null,
  wonValue: l.pipeline?.wonValue ?? null,
  retainUntil: l.retainUntil ?? null,
  downloads: l.downloads ?? 0,
});

const filtersFrom = (params) => Object.fromEntries(['status', 'kind', 'source', 'service', 'q', 'due', 'followup'].map((k) => [k, (params.get(k) ?? '').slice(0, 100)]).filter(([, v]) => v));

// CSV with protection against spreadsheet formula injection.
function csvCell(v) {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const lbl = (list, v) => list.find((o) => o.value === v)?.label ?? v ?? '';

function toCsv(leads) {
  const cols = [
    ['Reference', (l) => l.reference],
    ['Created', (l) => l.createdAt],
    ['Type', (l) => l.kind],
    ['Stage', (l) => statusLabel(l.status)],
    ['Name', (l) => l.contact?.fullName],
    ['Business', (l) => l.business?.name],
    ['Business type', (l) => lbl(businessTypes, l.business?.type)],
    ['Size', (l) => lbl(businessSizes, l.business?.size)],
    ['Phone', (l) => l.contact?.phone],
    ['Email', (l) => l.contact?.email],
    ['Prefers', (l) => l.contact?.preferredContact],
    ['Service', (l) => lbl(serviceOptions, l.inquiry?.service)],
    ['Challenge', (l) => lbl(challenges, l.inquiry?.challenge)],
    ['Records', (l) => lbl(recordStates, l.inquiry?.recordsState)],
    ['Timeframe', (l) => lbl(timeframes, l.inquiry?.timeframe)],
    ['Source', (l) => sourceLabel(l.attribution?.source)],
    ['UTM campaign', (l) => l.attribution?.utm_campaign],
    ['Owner', (l) => l.pipeline?.owner],
    ['Follow-up', (l) => l.pipeline?.followUpAt],
    ['Proposal value (NGN)', (l) => l.pipeline?.proposalValue],
    ['Won value (NGN)', (l) => l.pipeline?.wonValue],
    ['Outcome', (l) => l.pipeline?.outcome],
    ['Marketing consent', (l) => (l.marketingConsent ? 'yes' : 'no')],
    ['Checklist downloads', (l) => l.downloads ?? 0],
    ['Retain until', (l) => l.retainUntil],
  ];
  const lines = [cols.map(([h]) => csvCell(h)).join(',')];
  for (const l of leads) lines.push(cols.map(([, f]) => csvCell(f(l))).join(','));
  return '﻿' + lines.join('\r\n') + '\r\n'; // BOM so Excel reads ₦ and accents correctly
}

async function loadLeads(store, { before, maxPages = 1, pageSize = 200 }) {
  const leads = [];
  let cursor = before || undefined;
  for (let i = 0; i < maxPages; i++) {
    const page = await store.listLeads({ limit: pageSize, before: cursor });
    leads.push(...page.leads);
    cursor = page.nextCursor;
    if (!cursor) break;
  }
  return { leads, nextCursor: cursor ?? null };
}

// ---------- handler ----------
export function createAdminHandler({ getStore, getAuthService, env = process.env, loginLimits = LOGIN_LIMITS }) {
  return async function adminHandler(req, res) {
    const requestId = randomUUID();
    const config = readConfig(env);
    const url = new URL(req.url, 'http://x');
    const route = (url.searchParams.get('route') ?? url.pathname.replace(/^\/api\/admin\/?/, '')).replace(/^\/+|\/+$/g, '');
    url.searchParams.delete('route');
    const method = req.method;

    let store;
    let auth;
    try {
      store = getStore(config);
      auth = getAuthService();
    } catch (e) {
      log('error', 'admin_unavailable', { requestId, reason: e instanceof ConfigError ? 'config' : 'init' });
      return send(res, 503, { ok: false, error: 'unavailable' });
    }

    // State-changing requests: same-site origin + JSON (defence in depth on top of SameSite=Strict).
    if (method !== 'GET') {
      if (!sameOrigin(req, config)) return send(res, 403, { ok: false, error: 'origin' });
      if (method !== 'DELETE' && !String(req.headers['content-type'] ?? '').startsWith('application/json')) return send(res, 415, { ok: false, error: 'content-type' });
    }

    let body = {};
    if (method !== 'GET') {
      try {
        body = await readJson(req);
      } catch (e) {
        return send(res, e.status ?? 400, { ok: false, error: 'bad-request' });
      }
    }

    try {
      // ----- login (no session yet) -----
      if (route === 'login' && method === 'POST') {
        const email = typeof body.email === 'string' ? body.email.trim().toLowerCase().slice(0, 254) : '';
        const password = typeof body.password === 'string' ? body.password.slice(0, 200) : '';
        if (!email || !password) return send(res, 422, { ok: false, error: 'missing' });
        for (const rule of loginLimits) {
          const key = `login-${rule.scope}-${sha256(config.rateLimitSalt, rule.scope === 'ip' ? clientIp(req) : email).slice(0, 32)}`;
          if (!(await store.hit(key, rule)).allowed) {
            log('warn', 'login_rate_limited', { requestId, scope: rule.scope });
            return send(res, 429, { ok: false, error: 'rate-limited' }, { 'Retry-After': '900' });
          }
        }
        let user;
        try {
          user = await auth.signIn(email, password);
        } catch (e) {
          if (!(e instanceof AuthError)) throw e;
          await store.audit({ action: 'login_failed', reason: e.code, emailHash: sha256(email).slice(0, 16) });
          log('warn', 'login_failed', { requestId, reason: e.code });
          if (e.code === 'unavailable') return send(res, 503, { ok: false, error: 'unavailable' });
          if (e.code === 'rate-limited') return send(res, 429, { ok: false, error: 'rate-limited' });
          // Same message whether the password was wrong or the account has no role.
          return send(res, 401, { ok: false, error: 'invalid-credentials' });
        }
        const cookie = await auth.createSession(user.idToken);
        await store.audit({ action: 'login', by: user.email });
        log('info', 'login', { requestId, role: user.role });
        return send(res, 200, { ok: true, user: { email: user.email, role: user.role } }, { 'Set-Cookie': sessionCookie(cookie, SESSION_MS / 1000) });
      }

      // ----- everything else needs a valid session -----
      let user;
      try {
        user = await auth.verifySession(readCookie(req, COOKIE));
      } catch (e) {
        if (!(e instanceof AuthError)) throw e;
        if (route === 'logout') return send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie('', 0) });
        return send(res, 401, { ok: false, error: 'session' }, { 'Set-Cookie': sessionCookie('', 0) });
      }
      const isAdmin = user.role === 'admin';
      const forbid = () => send(res, 403, { ok: false, error: 'forbidden' });

      if (route === 'logout' && method === 'POST') {
        await auth.revoke(user.uid);
        await store.audit({ action: 'logout', by: user.email });
        return send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie('', 0) });
      }

      if (route === 'session' && method === 'GET') return send(res, 200, { ok: true, user: { email: user.email, role: user.role } });

      if (route === 'leads' && method === 'GET') {
        const filters = filtersFrom(url.searchParams);
        const { leads, nextCursor } = await loadLeads(store, { before: url.searchParams.get('before') });
        const counts = {};
        for (const l of leads) counts[l.status] = (counts[l.status] ?? 0) + 1;
        return send(res, 200, { ok: true, leads: leads.filter((l) => matches(l, filters)).map(summary), counts, scanned: leads.length, nextCursor });
      }

      if (route === 'export.csv' && method === 'GET') {
        if (!isAdmin) return forbid();
        const filters = filtersFrom(url.searchParams);
        const { leads } = await loadLeads(store, { maxPages: 25 });
        const rows = leads.filter((l) => matches(l, filters));
        await store.audit({ action: 'export', by: user.email, count: rows.length, filters });
        log('info', 'export', { requestId, count: rows.length });
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="adezmold-leads-${today()}.csv"`);
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('X-Robots-Tag', 'noindex, nofollow');
        return res.end(toCsv(rows));
      }

      const m = route.match(/^leads\/([^/]+)(\/notes)?$/);
      if (m) {
        const reference = decodeURIComponent(m[1]);
        if (!REF.test(reference)) return send(res, 404, { ok: false, error: 'not-found' });

        if (!m[2] && method === 'GET') return send(res, 200, { ok: true, ...(await store.getLead(reference)) });

        if (!m[2] && method === 'PATCH') {
          if (typeof body.version !== 'string' || !body.changes || typeof body.changes !== 'object') return send(res, 400, { ok: false, error: 'bad-request' });
          const { values, errors } = validatePipelineChanges(body.changes);
          if (Object.keys(errors).length) return send(res, 422, { ok: false, errors });
          const result = await store.updateLead(reference, values, { by: user.email, expectedVersion: body.version });
          if (result.changed) await store.audit({ action: 'lead_update', by: user.email, reference, fields: Object.keys(values) });
          return send(res, 200, { ok: true, ...result });
        }

        if (m[2] && method === 'POST') {
          const text = typeof body.text === 'string' ? body.text.trim() : '';
          if (!text || text.length > 2000) return send(res, 422, { ok: false, errors: { text: text ? 'Keep notes under 2000 characters.' : 'Write a note first.' } });
          await store.addNote(reference, text, { by: user.email });
          await store.audit({ action: 'note_add', by: user.email, reference });
          return send(res, 200, { ok: true, ...(await store.getLead(reference)) });
        }

        if (!m[2] && method === 'DELETE') {
          if (!isAdmin) return forbid();
          if (body.confirm !== reference) return send(res, 422, { ok: false, error: 'confirm' });
          const removed = await store.deleteLead(reference);
          await store.audit({ action: 'lead_delete', by: user.email, reference, removed });
          log('info', 'lead_deleted', { requestId, reference });
          return send(res, 200, { ok: true });
        }
      }

      return send(res, 404, { ok: false, error: 'not-found' });
    } catch (e) {
      if (e instanceof NotFoundError) return send(res, 404, { ok: false, error: 'not-found' });
      if (e instanceof ConflictError) return send(res, 409, { ok: false, error: 'conflict' });
      log('error', 'admin_failed', { requestId, route: route.replace(/ADZ-[\w-]+/, ':ref'), error: e?.code ?? e?.name ?? 'unknown' });
      return send(res, 500, { ok: false, error: 'server' });
    }
  };
}
