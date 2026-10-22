// Saves a JSON copy of all lead data (works on the free Spark plan).
// Usage (from your own computer, never commit the output):
//   FIREBASE_PROJECT_ID=... FIREBASE_CLIENT_EMAIL=... FIREBASE_PRIVATE_KEY="..." node scripts/backup-firestore.mjs
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Timestamp } from 'firebase-admin/firestore';
import { getDb } from '../server/firestore.js';

const db = getDb();
const toPlain = (v) =>
  v instanceof Timestamp ? v.toDate().toISOString() : Array.isArray(v) ? v.map(toPlain) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toPlain(x)])) : v;

const out = { exportedAt: new Date().toISOString(), leads: [], consents: [] };
for (const lead of (await db.collection('leads').get()).docs) {
  const activity = (await lead.ref.collection('activity').get()).docs.map((d) => ({ id: d.id, ...toPlain(d.data()) }));
  out.leads.push({ id: lead.id, ...toPlain(lead.data()), activity });
}
out.consents = (await db.collection('consents').get()).docs.map((d) => ({ id: d.id, ...toPlain(d.data()) }));

const dir = path.resolve('backups');
await mkdir(dir, { recursive: true });
const file = path.join(dir, `adezmold-leads-${out.exportedAt.slice(0, 10)}.json`);
await writeFile(file, JSON.stringify(out, null, 2), { mode: 0o600 });
console.log(`Saved ${out.leads.length} leads and ${out.consents.length} consent records to ${file}`);
