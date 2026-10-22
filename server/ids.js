import { createHash, randomInt } from 'node:crypto';

// Crockford base32 without look-alike characters (no I, L, O, U).
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Human-friendly lead reference, e.g. ADZ-2610-7KQ3M (year+month, then 5 random characters). */
export function makeReference(now = new Date()) {
  const yymm = `${String(now.getUTCFullYear()).slice(2)}${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  let tail = '';
  for (let i = 0; i < 5; i++) tail += ALPHABET[randomInt(ALPHABET.length)];
  return `ADZ-${yymm}-${tail}`;
}

export function sha256(...parts) {
  return createHash('sha256').update(parts.join('|')).digest('hex');
}

export const isSubmissionId = (v) => typeof v === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(v);
