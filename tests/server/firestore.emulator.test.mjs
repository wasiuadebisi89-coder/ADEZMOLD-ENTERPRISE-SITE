// Tests against the real Firestore emulator (store transactions + security rules).
// Run with:  npm run test:emulator
// They are skipped when FIRESTORE_EMULATOR_HOST is not set (e.g. a plain `npm run test:server`).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const projectId = process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || 'demo-adezmold';

let db;
let store;
let rulesEnv;

before(async () => {
  if (!enabled) return;
  process.env.FIREBASE_PROJECT_ID = projectId;
  const { getDb } = await import('../../server/firestore.js');
  const { createFirestoreStore } = await import('../../server/store.js');
  db = getDb();
  store = createFirestoreStore(db, { retentionMonths: 24 });
  const { initializeTestEnvironment } = await import('@firebase/rules-unit-testing');
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
  rulesEnv = await initializeTestEnvironment({
    projectId,
    firestore: { host, port: Number(port), rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8') },
  });
});

after(async () => {
  await rulesEnv?.cleanup();
});

const lead = () => ({
  kind: 'checklist',
  contact: { fullName: 'Ade', email: 'ade@example.com', phone: null, preferredContact: 'email' },
  business: { name: null, type: null, size: null },
  inquiry: { resource: 'produce-business-health-checklist' },
  attribution: { source: 'direct' },
  marketingConsent: false,
  email: { checklistDelivery: 'not-sent', internalAlert: 'not-sent' },
  pipeline: { owner: null, followUpAt: null, proposalValue: null, wonValue: null, outcome: null },
});
const consent = { kind: 'checklist', email: 'ade@example.com', privacyAck: true, privacyNoticeVersion: 'test', marketing: false, method: 'web-form' };
const uid = () => `emu-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

test('createLead writes lead, activity, consent and submission in one transaction', { skip: !enabled }, async () => {
  const submissionId = uid();
  const { reference, duplicate } = await store.createLead({ submissionId, dedupeKey: uid(), lead: lead(), consent });
  assert.equal(duplicate, false);
  const snap = await db.doc(`leads/${reference}`).get();
  assert.ok(snap.exists);
  assert.equal(snap.get('status'), 'new');
  assert.ok(snap.get('createdAt').toMillis() > 0, 'server timestamp set');
  assert.ok(snap.get('retainUntil').toMillis() > Date.now());
  assert.equal((await db.collection(`leads/${reference}/activity`).get()).size, 1);
  assert.equal((await db.collection('consents').where('leadId', '==', reference).get()).size, 1);
  assert.equal((await db.doc(`submissions/${submissionId}`).get()).get('leadId'), reference);
});

test('concurrent retries of one submission create exactly one lead', { skip: !enabled }, async () => {
  const submissionId = uid();
  const results = await Promise.all(Array.from({ length: 5 }, () => store.createLead({ submissionId, dedupeKey: uid(), lead: lead(), consent })));
  assert.equal(new Set(results.map((r) => r.reference)).size, 1);
  const consents = await db.collection('consents').where('leadId', '==', results[0].reference).get();
  assert.equal(consents.size, 1);
});

test('dedupe key returns the existing lead', { skip: !enabled }, async () => {
  const key = uid();
  const a = await store.createLead({ submissionId: uid(), dedupeKey: key, lead: lead(), consent });
  const b = await store.createLead({ submissionId: uid(), dedupeKey: key, lead: lead(), consent });
  assert.equal(b.reference, a.reference);
  assert.equal(b.duplicate, true);
});

test('rate limiter counts per key and window', { skip: !enabled }, async () => {
  const key = uid();
  const rule = { limit: 2, windowMs: 60_000 };
  const r = [];
  for (let i = 0; i < 3; i++) r.push((await store.hit(key, rule)).allowed);
  assert.deepEqual(r, [true, true, false]);
});

test('security rules: browsers (signed in or not) can neither read nor write', { skip: !enabled }, async () => {
  const { assertFails } = await import('@firebase/rules-unit-testing');
  const { doc, getDoc, setDoc, collection, getDocs } = await import('firebase/firestore');
  for (const ctx of [rulesEnv.unauthenticatedContext(), rulesEnv.authenticatedContext('someone', { email: 'x@example.com' })]) {
    const fs = ctx.firestore();
    await assertFails(getDoc(doc(fs, 'leads/ADZ-0000-AAAAA')));
    await assertFails(getDocs(collection(fs, 'leads')));
    await assertFails(getDocs(collection(fs, 'consents')));
    await assertFails(setDoc(doc(fs, 'leads/ADZ-0000-BBBBB'), { status: 'won' }));
    await assertFails(setDoc(doc(fs, 'consents/x'), { marketing: true }));
  }
});

// ---------- lead register operations (Stage 6) ----------
test('register: list, get, update with version check, notes, delete', { skip: !enabled }, async () => {
  const { reference } = await store.createLead({ submissionId: uid(), dedupeKey: uid(), lead: lead(), consent });
  const page = await store.listLeads({ limit: 50 });
  assert.ok(page.leads.some((l) => l.reference === reference));
  assert.equal(typeof page.leads[0].createdAt, 'string', 'timestamps come back as ISO strings');

  const { lead: got, activity } = await store.getLead(reference);
  assert.equal(activity.length, 1);
  const updated = await store.updateLead(reference, { status: 'contacted', owner: 'Ade', proposalValue: 450000 }, { by: 'staff@x.co', expectedVersion: got.version });
  assert.equal(updated.changed, 3);
  assert.equal(updated.lead.status, 'contacted');
  assert.equal(updated.lead.pipeline.owner, 'Ade');
  assert.notEqual(updated.lead.version, got.version);
  await assert.rejects(store.updateLead(reference, { status: 'lost' }, { by: 'b', expectedVersion: got.version }), { code: 'conflict' });

  await store.addNote(reference, 'Called back', { by: 'staff@x.co' });
  const after = await store.getLead(reference);
  assert.ok(after.activity.some((a) => a.type === 'note' && a.text === 'Called back'));
  assert.equal(after.lead.version, updated.lead.version, 'notes do not bump the version');

  await store.audit({ action: 'test', by: 'staff@x.co', reference });
  const removed = await store.deleteLead(reference);
  assert.deepEqual(removed, { activity: 5, consents: 1 });
  await assert.rejects(store.getLead(reference), { code: 'not-found' });
  assert.equal((await db.collection(`leads/${reference}/activity`).get()).size, 0);
});
