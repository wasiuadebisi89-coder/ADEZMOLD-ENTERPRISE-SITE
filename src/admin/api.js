// Thin client for /api/admin. The session lives in an HttpOnly cookie, so no
// token is ever handled by this code.

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error ?? `http-${status}`);
    this.status = status;
    this.body = body;
  }
}

async function request(method, path, body) {
  let res;
  try {
    res = await fetch(`/api/admin/${path}`, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, { error: 'network' });
  }
  const json = await res.json().catch(() => null);
  // Session expired or revoked: tell the app to show the sign-in screen.
  if (res.status === 401 && path !== 'login' && path !== 'session') window.dispatchEvent(new Event('adz-admin-signed-out'));
  if (!res.ok || !json?.ok) throw new ApiError(res.status, json);
  return json;
}

export const api = {
  session: () => request('GET', 'session'),
  login: (email, password) => request('POST', 'login', { email, password }),
  logout: () => request('POST', 'logout', {}),
  leads: (params) => request('GET', `leads?${new URLSearchParams(params)}`),
  lead: (ref) => request('GET', `leads/${encodeURIComponent(ref)}`),
  update: (ref, version, changes) => request('PATCH', `leads/${encodeURIComponent(ref)}`, { version, changes }),
  addNote: (ref, text) => request('POST', `leads/${encodeURIComponent(ref)}/notes`, { text }),
  remove: (ref) => request('DELETE', `leads/${encodeURIComponent(ref)}`, { confirm: ref }),
  exportUrl: (params) => `/api/admin/export.csv?${new URLSearchParams(params)}`,
};

export const naira = (n) => (n === null || n === undefined ? '—' : `₦${Number(n).toLocaleString('en-NG')}`);
export const date = (iso) => (iso ? new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export const dateTime = (iso) => (iso ? new Date(iso).toLocaleString('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
