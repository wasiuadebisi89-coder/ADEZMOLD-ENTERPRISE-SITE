// Fake staff auth service for tests (same interface as server/auth.js).
import { AuthError } from '../../server/auth.js';

export function fakeAuth() {
  const users = { 'owner@adezmold.test': { uid: 'u1', password: 'right-pass', role: 'admin' }, 'staff@adezmold.test': { uid: 'u2', password: 'staff-pass', role: 'staff' }, 'nobody@x.co': { uid: 'u3', password: 'pw', role: null } };
  const sessions = new Map();
  const revoked = new Set();
  return {
    revoked,
    async signIn(email, password) {
      const u = users[email];
      if (!u || u.password !== password) throw new AuthError('invalid-credentials');
      if (!u.role) throw new AuthError('not-authorised');
      return { idToken: `id-${u.uid}`, uid: u.uid, email, role: u.role };
    },
    async createSession(idToken) {
      const uid = idToken.slice(3);
      const email = Object.keys(users).find((e) => users[e].uid === uid);
      const cookie = `sess-${uid}-${sessions.size}`;
      sessions.set(cookie, { uid, email, role: users[email].role });
      return cookie;
    },
    async verifySession(cookie) {
      const s = sessions.get(cookie);
      if (!s || revoked.has(s.uid)) throw new AuthError('invalid-session');
      return s;
    },
    async revoke(uid) {
      revoked.add(uid);
    },
  };
}
