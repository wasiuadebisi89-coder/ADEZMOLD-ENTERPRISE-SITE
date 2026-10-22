// Sends a form to the site's own API. The submissionId lets the server ignore
// accidental repeats (double taps, retries on a bad connection).

export class SubmitError extends Error {
  constructor(kind, fieldErrors = null) {
    super(kind);
    this.kind = kind; // 'validation' | 'rate-limited' | 'network' | 'server'
    this.fieldErrors = fieldErrors;
  }
}

export function newSubmissionId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export async function submitForm(endpoint, payload, { timeoutMs = 15000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
      credentials: 'same-origin',
    });
  } catch {
    throw new SubmitError('network');
  } finally {
    clearTimeout(timer);
  }

  let body = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON (e.g. endpoint not deployed yet) */
  }
  if (res.ok && body?.ok) return body;
  if (res.status === 422) throw new SubmitError('validation', body?.errors ?? null);
  if (res.status === 429) throw new SubmitError('rate-limited');
  throw new SubmitError('server');
}
