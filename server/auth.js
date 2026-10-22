// Staff authentication for the lead register.
// Password check: Firebase Auth REST API (signInWithPassword), done on the server.
// Session: a Firebase *session cookie* (HttpOnly, 8 h), verified on every request
// with revocation checks. Authorisation: the `role` custom claim ('admin' | 'staff'),
// which can only be set with server credentials (scripts/manage-staff.mjs).
import { getAuth } from 'firebase-admin/auth';
import { ConfigError } from './config.js';
import { getFirebaseApp } from './firebase-app.js';

export const SESSION_MS = 8 * 60 * 60 * 1000;
export const ROLES = new Set(['admin', 'staff']);

export class AuthError extends Error {
  constructor(code) {
    super(code);
    this.code = code; // 'invalid-credentials' | 'not-authorised' | 'invalid-session' | 'unavailable'
  }
}

export function createFirebaseAuthService(env = process.env, { fetchImpl = globalThis.fetch } = {}) {
  const emulator = env.FIREBASE_AUTH_EMULATOR_HOST;
  const apiKey = env.FIREBASE_WEB_API_KEY || (emulator ? 'emulator' : '');
  if (!apiKey) throw new ConfigError('FIREBASE_WEB_API_KEY is not set');
  const base = emulator ? `http://${emulator}/identitytoolkit.googleapis.com` : 'https://identitytoolkit.googleapis.com';
  const auth = () => getAuth(getFirebaseApp(env));

  return {
    /** Checks email + password and returns the verified user with role. */
    async signIn(email, password) {
      let res;
      try {
        res = await fetchImpl(`${base}/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, returnSecureToken: true }),
        });
      } catch {
        throw new AuthError('unavailable');
      }
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.idToken) {
        const msg = body?.error?.message ?? '';
        if (/TOO_MANY_ATTEMPTS/.test(msg)) throw new AuthError('rate-limited');
        throw new AuthError('invalid-credentials');
      }
      const decoded = await auth().verifyIdToken(body.idToken, true);
      if (!ROLES.has(decoded.role)) throw new AuthError('not-authorised');
      return { idToken: body.idToken, uid: decoded.uid, email: decoded.email, role: decoded.role };
    },

    createSession(idToken) {
      return auth().createSessionCookie(idToken, { expiresIn: SESSION_MS });
    },

    /** Verifies the session cookie (incl. revocation) and returns the user. */
    async verifySession(cookie) {
      if (!cookie) throw new AuthError('invalid-session');
      let decoded;
      try {
        decoded = await auth().verifySessionCookie(cookie, true);
      } catch {
        throw new AuthError('invalid-session');
      }
      if (!ROLES.has(decoded.role)) throw new AuthError('not-authorised');
      return { uid: decoded.uid, email: decoded.email, role: decoded.role };
    },

    revoke(uid) {
      return auth().revokeRefreshTokens(uid);
    },
  };
}
