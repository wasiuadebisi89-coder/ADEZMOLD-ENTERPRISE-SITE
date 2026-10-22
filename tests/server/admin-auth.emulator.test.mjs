// Real Firebase Auth (emulator): password check, role claims, session cookies, revocation.
// Run with:  npm run test:auth-emulator   (skipped unless FIREBASE_AUTH_EMULATOR_HOST is set)
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';

const host = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const enabled = Boolean(host);
const env = { FIREBASE_AUTH_EMULATOR_HOST: host, FIREBASE_PROJECT_ID: process.env.GCLOUD_PROJECT || 'demo-adezmold', RATE_LIMIT_SALT: 's' };
const stamp = Date.now();
const users = { admin: `admin-${stamp}@adezmold.test`, staff: `staff-${stamp}@adezmold.test`, none: `none-${stamp}@adezmold.test` };
const PASSWORD = 'correct-horse-battery';

let service;
let adminSdk;
before(async () => {
  if (!enabled) return;
  process.env.FIREBASE_PROJECT_ID = env.FIREBASE_PROJECT_ID;
  const { getAuth } = await import('firebase-admin/auth');
  const { getFirebaseApp } = await import('../../server/firebase-app.js');
  const { createFirebaseAuthService } = await import('../../server/auth.js');
  adminSdk = getAuth(getFirebaseApp(env));
  for (const [role, email] of Object.entries(users)) {
    const u = await adminSdk.createUser({ email, password: PASSWORD });
    if (role !== 'none') await adminSdk.setCustomUserClaims(u.uid, { role });
  }
  service = createFirebaseAuthService(env);
});

test('correct password + role -> verified user', { skip: !enabled }, async () => {
  const u = await service.signIn(users.admin, PASSWORD);
  assert.equal(u.role, 'admin');
  assert.equal(u.email, users.admin);
  assert.ok(u.idToken);
});

test('wrong password and missing role are refused', { skip: !enabled }, async () => {
  await assert.rejects(service.signIn(users.admin, 'wrong-password'), { code: 'invalid-credentials' });
  await assert.rejects(service.signIn(`ghost-${stamp}@adezmold.test`, PASSWORD), { code: 'invalid-credentials' });
  await assert.rejects(service.signIn(users.none, PASSWORD), { code: 'not-authorised' });
});

test('session cookie verifies, and stops working once revoked', { skip: !enabled }, async () => {
  const u = await service.signIn(users.staff, PASSWORD);
  const cookie = await service.createSession(u.idToken);
  assert.deepEqual(await service.verifySession(cookie), { uid: u.uid, email: users.staff, role: 'staff' });
  await assert.rejects(service.verifySession(cookie + 'x'), { code: 'invalid-session' });
  await new Promise((r) => setTimeout(r, 1100)); // revocation works at 1-second granularity
  await service.revoke(u.uid);
  await assert.rejects(service.verifySession(cookie), { code: 'invalid-session' });
});

test('removing the role locks the person out at their next sign-in', { skip: !enabled }, async () => {
  const email = `temp-${stamp}@adezmold.test`;
  const created = await adminSdk.createUser({ email, password: PASSWORD });
  await adminSdk.setCustomUserClaims(created.uid, { role: 'staff' });
  assert.equal((await service.signIn(email, PASSWORD)).role, 'staff');
  await adminSdk.setCustomUserClaims(created.uid, {});
  await assert.rejects(service.signIn(email, PASSWORD), { code: 'not-authorised' });
});

test('full admin API login with real Firebase Auth', { skip: !enabled }, async () => {
  const { createAdminHandler } = await import('../../server/admin.js');
  const { createMemoryStore } = await import('../../server/store.js');
  const store = createMemoryStore();
  const handler = createAdminHandler({ getStore: () => store, getAuthService: () => service, env });
  const call = async (method, path, body, cookie) => {
    const payload = body ? JSON.stringify(body) : '';
    const req = Object.assign(Readable.from(payload ? [Buffer.from(payload)] : []), {
      method,
      url: path,
      headers: { host: 'a.test', origin: 'https://a.test', 'content-type': 'application/json', ...(cookie ? { cookie: `__Host-adz_admin=${encodeURIComponent(cookie)}` } : {}) },
    });
    const res = { headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(b) { this.body = String(b ?? ''); } };
    await handler(req, res);
    return res;
  };
  const login = await call('POST', '/api/admin/login', { email: users.admin, password: PASSWORD });
  assert.equal(login.statusCode, 200, login.body);
  const cookie = decodeURIComponent(/__Host-adz_admin=([^;]+)/.exec(login.headers['set-cookie'])[1]);
  assert.equal((await call('GET', '/api/admin/session', null, cookie)).statusCode, 200);
  assert.equal((await call('GET', '/api/admin/leads', null, cookie)).statusCode, 200);
  assert.equal((await call('POST', '/api/admin/login', { email: users.none, password: PASSWORD })).statusCode, 401);
});
