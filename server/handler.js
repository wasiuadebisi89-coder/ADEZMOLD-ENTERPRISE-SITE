// Shared request handling for the public lead endpoints.
// Order of checks: method -> content type -> origin -> size -> honeypot ->
// submission id -> rate limit -> validation -> transactional save.
// Responses never echo submitted data back, and logs never contain personal data.
import { randomUUID } from 'node:crypto';
import { ConfigError, readConfig } from './config.js';
import { isSubmissionId, sha256 } from './ids.js';
import { afterLeadSaved } from './delivery.js';

const MAX_BODY_BYTES = 16 * 1024;
const RATE_LIMITS = [
  { name: 'burst', limit: 5, windowMs: 10 * 60 * 1000 }, // 5 per 10 minutes
  { name: 'daily', limit: 20, windowMs: 24 * 60 * 60 * 1000 }, // 20 per day
];
const SOURCES = new Set(['linkedin-organic', 'linkedin-paid', 'campaign', 'search', 'referral', 'direct']);

function send(res, status, body, extraHeaders = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  for (const [k, v] of Object.entries(extraHeaders)) res.setHeader(k, v);
  res.end(JSON.stringify(body));
}

function log(level, event, fields) {
  // Structured, PII-free log line (visible in Vercel's function logs).
  console[level](JSON.stringify({ event, ...fields }));
}

async function readJson(req) {
  if (req.body !== undefined && req.body !== null && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  let raw = typeof req.body === 'string' || Buffer.isBuffer(req.body) ? String(req.body) : '';
  if (!raw) {
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > MAX_BODY_BYTES) throw Object.assign(new Error('too large'), { status: 413 });
    }
  }
  if (raw.length > MAX_BODY_BYTES) throw Object.assign(new Error('too large'), { status: 413 });
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    return parsed;
  } catch {
    throw Object.assign(new Error('bad json'), { status: 400 });
  }
}

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd) return fwd.split(',')[0].trim();
  return req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
}

function originAllowed(req, config) {
  const origin = req.headers.origin;
  if (!origin) return true; // same-origin form posts from some browsers omit it; JSON + no cookies limits CSRF value
  const clean = origin.replace(/\/+$/, '');
  if (config.allowedOrigins.length) return config.allowedOrigins.includes(clean);
  try {
    return new URL(clean).host === req.headers.host;
  } catch {
    return false;
  }
}

const str = (v, max = 100) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

export function sanitiseAttribution(a) {
  const src = a && typeof a === 'object' ? a : {};
  return {
    source: SOURCES.has(src.source) ? src.source : 'direct',
    utm_source: str(src.utm_source),
    utm_medium: str(src.utm_medium),
    utm_campaign: str(src.utm_campaign),
    utm_content: str(src.utm_content),
    utm_term: str(src.utm_term),
    referrerHost: str(src.referrerHost, 253),
    landingPath: str(src.landingPath, 200),
    formPath: str(src.formPath, 200),
  };
}

/**
 * @param {object} opts
 * @param {'consultation'|'checklist'} opts.kind
 * @param {(input:object)=>{values:object,errors:object,valid:boolean}} opts.validate
 * @param {(values:object, attribution:object, config:object)=>{lead:object, consent:object, dedupeKey:string}} opts.toRecord
 * @param {()=>object} opts.getStore  returns a store (see store.js)
 * @param {object} [opts.mailer]       optional mailer override (tests)
 */
export function createLeadHandler({ kind, validate, toRecord, getStore, env = process.env, mailer }) {
  return async function handler(req, res) {
    const requestId = randomUUID();
    const config = readConfig(env);

    if (req.method !== 'POST') return send(res, 405, { ok: false, error: 'method' }, { Allow: 'POST' });
    if (!String(req.headers['content-type'] ?? '').startsWith('application/json')) return send(res, 415, { ok: false, error: 'content-type' });
    if (!originAllowed(req, config)) {
      log('warn', 'origin_rejected', { kind, requestId });
      return send(res, 403, { ok: false, error: 'origin' });
    }
    const declared = Number(req.headers['content-length'] ?? 0);
    if (declared > MAX_BODY_BYTES) return send(res, 413, { ok: false, error: 'too-large' });

    let body;
    try {
      body = await readJson(req);
    } catch (e) {
      return send(res, e.status ?? 400, { ok: false, error: e.status === 413 ? 'too-large' : 'bad-request' });
    }

    // Honeypot: bots fill the hidden "website" field. Pretend success, store nothing.
    if (typeof body.website === 'string' && body.website.trim() !== '') {
      log('info', 'honeypot', { kind, requestId });
      return send(res, 200, { ok: true });
    }
    if (!isSubmissionId(body.submissionId)) return send(res, 400, { ok: false, error: 'bad-request' });

    let store;
    try {
      store = getStore(config);
    } catch (e) {
      log('error', 'store_unavailable', { kind, requestId, reason: e instanceof ConfigError ? 'config' : 'init' });
      return send(res, 503, { ok: false, error: 'unavailable' });
    }

    try {
      const ipKey = sha256(config.rateLimitSalt, clientIp(req)).slice(0, 32);
      for (const rule of RATE_LIMITS) {
        const { allowed } = await store.hit(`${kind}-${rule.name}-${ipKey}`, rule);
        if (!allowed) {
          log('warn', 'rate_limited', { kind, requestId, rule: rule.name });
          return send(res, 429, { ok: false, error: 'rate-limited' }, { 'Retry-After': '600' });
        }
      }

      const { values, errors, valid } = validate(body);
      if (!valid) return send(res, 422, { ok: false, errors });

      const attribution = sanitiseAttribution(body.attribution);
      const { lead, consent, dedupeKey } = toRecord(values, attribution, config);
      const { reference, duplicate } = await store.createLead({ submissionId: body.submissionId, dedupeKey, lead, consent });

      log('info', duplicate ? 'lead_duplicate' : 'lead_created', { kind, requestId, reference, source: attribution.source });

      // The lead is safely stored at this point. Delivery problems are logged and
      // recorded on the lead, but never turn a saved lead into an error for the visitor.
      let extra = {};
      try {
        const host = req.headers['x-forwarded-host'] || req.headers.host;
        extra = await afterLeadSaved({ kind, lead, reference, duplicate, store, env, mailer, log, requestOrigin: host ? `https://${host}` : '' });
      } catch (e) {
        log('error', 'delivery_failed', { kind, requestId, reference, error: e?.code ?? e?.name ?? 'unknown' });
      }
      return send(res, 200, { ok: true, reference, ...extra });
    } catch (e) {
      log('error', 'lead_save_failed', { kind, requestId, error: e?.code ?? e?.name ?? 'unknown' });
      return send(res, 500, { ok: false, error: 'server' });
    }
  };
}
