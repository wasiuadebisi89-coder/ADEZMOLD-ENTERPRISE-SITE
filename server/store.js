// Lead storage. Two implementations with the same interface:
//   createFirestoreStore(db) — production (Firestore, all writes in one transaction)
//   createMemoryStore()      — tests and local development only
//
// Collections (see docs/DATA.md):
//   leads/{reference}                 the lead, keyed by its public reference
//   leads/{reference}/activity/{id}   status history and (later) internal notes
//   consents/{id}                     privacy acknowledgement + marketing consent, kept separately
//   submissions/{submissionId}        idempotency: a retried submission returns the same lead
//   dedupe/{hash}                     same person, same form, same day -> same lead
//   rateLimits/{hash}                 request counters per hashed IP and time window
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { makeReference } from './ids.js';

const DAY = 24 * 60 * 60 * 1000;
const addMonths = (date, months) => {
  const d = new Date(date);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
};

export class DuplicateReferenceError extends Error {}

export function createFirestoreStore(db, { retentionMonths = 24 } = {}) {
  return {
    async hit(key, { limit, windowMs }) {
      const now = Date.now();
      const windowStart = Math.floor(now / windowMs) * windowMs;
      const ref = db.doc(`rateLimits/${key}-${windowStart}`);
      return db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const count = (snap.exists ? snap.get('count') : 0) + 1;
        tx.set(ref, { count, expiresAt: Timestamp.fromMillis(windowStart + windowMs * 2) });
        return { allowed: count <= limit, count };
      });
    },

    async createLead({ submissionId, dedupeKey, lead, consent, now = new Date() }) {
      const subRef = db.doc(`submissions/${submissionId}`);
      const dedupeRef = dedupeKey ? db.doc(`dedupe/${dedupeKey}`) : null;

      return db.runTransaction(async (tx) => {
        // Reads first (Firestore transactions require reads before writes).
        const sub = await tx.get(subRef);
        if (sub.exists) return { reference: sub.get('leadId'), duplicate: true };

        if (dedupeRef) {
          const dup = await tx.get(dedupeRef);
          if (dup.exists && dup.get('expiresAt').toMillis() > now.getTime()) {
            tx.set(subRef, { leadId: dup.get('leadId'), createdAt: FieldValue.serverTimestamp(), expiresAt: Timestamp.fromMillis(now.getTime() + 7 * DAY) });
            return { reference: dup.get('leadId'), duplicate: true };
          }
        }

        let reference;
        let leadRef;
        for (let attempt = 0; attempt < 5 && !reference; attempt++) {
          const candidate = makeReference(now);
          const ref = db.doc(`leads/${candidate}`);
          if (!(await tx.get(ref)).exists) {
            reference = candidate;
            leadRef = ref;
          }
        }
        if (!reference) throw new DuplicateReferenceError('could not allocate a unique reference');

        const ts = FieldValue.serverTimestamp();
        tx.create(leadRef, {
          ...lead,
          reference,
          status: 'new',
          createdAt: ts,
          updatedAt: ts,
          retainUntil: Timestamp.fromDate(addMonths(now, retentionMonths)),
        });
        tx.create(leadRef.collection('activity').doc(), { type: 'status', status: 'new', by: 'system', at: ts, note: 'Submitted via website' });
        tx.create(db.collection('consents').doc(), { ...consent, leadId: reference, recordedAt: ts });
        tx.create(subRef, { leadId: reference, createdAt: ts, expiresAt: Timestamp.fromMillis(now.getTime() + 7 * DAY) });
        if (dedupeRef) tx.set(dedupeRef, { leadId: reference, expiresAt: Timestamp.fromMillis(now.getTime() + DAY) });
        return { reference, duplicate: false };
      });
    },

    async updateEmailStatus(reference, patch) {
      const fields = { updatedAt: FieldValue.serverTimestamp() };
      for (const [name, value] of Object.entries(patch)) fields[`email.${name}`] = value;
      await db.doc(`leads/${reference}`).update(fields);
    },

    async recordDownload(reference) {
      await db.doc(`leads/${reference}`).update({ downloads: FieldValue.increment(1), lastDownloadAt: FieldValue.serverTimestamp() });
    },
  };
}

/** In-memory twin of the Firestore store, for tests and local development. */
export function createMemoryStore({ retentionMonths = 24 } = {}) {
  const data = { leads: new Map(), activity: [], consents: [], submissions: new Map(), dedupe: new Map(), rateLimits: new Map() };
  let queue = Promise.resolve();
  const serial = (fn) => (queue = queue.then(fn, fn)); // mimic transaction isolation

  return {
    data,
    hit: (key, { limit, windowMs }) =>
      serial(() => {
        const k = `${key}-${Math.floor(Date.now() / windowMs)}`;
        const count = (data.rateLimits.get(k) ?? 0) + 1;
        data.rateLimits.set(k, count);
        return { allowed: count <= limit, count };
      }),
    createLead: ({ submissionId, dedupeKey, lead, consent, now = new Date() }) =>
      serial(() => {
        if (data.submissions.has(submissionId)) return { reference: data.submissions.get(submissionId), duplicate: true };
        const dup = dedupeKey && data.dedupe.get(dedupeKey);
        if (dup && dup.expiresAt > now.getTime()) {
          data.submissions.set(submissionId, dup.leadId);
          return { reference: dup.leadId, duplicate: true };
        }
        let reference = makeReference(now);
        while (data.leads.has(reference)) reference = makeReference(now);
        const at = now.toISOString();
        data.leads.set(reference, { ...lead, reference, status: 'new', createdAt: at, updatedAt: at, retainUntil: addMonths(now, retentionMonths).toISOString() });
        data.activity.push({ leadId: reference, type: 'status', status: 'new', by: 'system', at });
        data.consents.push({ ...consent, leadId: reference, recordedAt: at });
        data.submissions.set(submissionId, reference);
        if (dedupeKey) data.dedupe.set(dedupeKey, { leadId: reference, expiresAt: now.getTime() + DAY });
        return { reference, duplicate: false };
      }),
    updateEmailStatus: (reference, patch) =>
      serial(() => {
        const lead = data.leads.get(reference);
        if (!lead) throw Object.assign(new Error('not found'), { code: 'not-found' });
        lead.email = { ...lead.email, ...patch };
        lead.updatedAt = new Date().toISOString();
      }),
    recordDownload: (reference) =>
      serial(() => {
        const lead = data.leads.get(reference);
        if (!lead) throw Object.assign(new Error('not found'), { code: 'not-found' });
        lead.downloads = (lead.downloads ?? 0) + 1;
        lead.lastDownloadAt = new Date().toISOString();
      }),
  };
}
