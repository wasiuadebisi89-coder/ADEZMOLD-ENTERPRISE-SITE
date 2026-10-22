// Signed, expiring download links for the checklist PDF.
// token = base64url("<reference>.<expiresAtMs>") + "." + base64url(HMAC-SHA256)
// No database lookup is needed to check a link, and links cannot be forged or extended.
import { createHmac, timingSafeEqual } from 'node:crypto';

export const DOWNLOAD_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const b64 = (buf) => Buffer.from(buf).toString('base64url');
const sign = (payload, secret) => createHmac('sha256', secret).update(payload).digest();

export function createDownloadToken(reference, secret, now = Date.now(), ttlMs = DOWNLOAD_TTL_MS) {
  if (!secret) throw new Error('DOWNLOAD_TOKEN_SECRET is not set');
  const payload = `${reference}.${now + ttlMs}`;
  return `${b64(payload)}.${b64(sign(payload, secret))}`;
}

/** @returns {{ok:true, reference:string} | {ok:false, reason:'invalid'|'expired'}} */
export function verifyDownloadToken(token, secret, now = Date.now()) {
  if (!secret || typeof token !== 'string' || token.length > 300) return { ok: false, reason: 'invalid' };
  const [p, s] = token.split('.');
  if (!p || !s) return { ok: false, reason: 'invalid' };
  let payload;
  try {
    payload = Buffer.from(p, 'base64url').toString('utf8');
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  const expected = sign(payload, secret);
  const given = Buffer.from(s, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: 'invalid' };
  const m = payload.match(/^(ADZ-\d{4}-[0-9A-Z]{5})\.(\d{1,15})$/);
  if (!m) return { ok: false, reason: 'invalid' };
  if (Number(m[2]) < now) return { ok: false, reason: 'expired' };
  return { ok: true, reference: m[1] };
}
