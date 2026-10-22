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
//   adminAudit/{id}                   who did what in the lead register (no lead contents)
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { makeReference } from './ids.js';

export class NotFoundError extends Error {
  code = 'not-found';
}
export class ConflictError extends Error {
  code = 'conflict';
}

// Pipeline fields live under lead.pipeline, except status which is top-level.
const PIPELINE_FIELDS = ['owner', 'followUpAt', 'proposalValue', 'wonValue', 'outcome'];
const AUDIT_RETENTION_MONTHS = 24;

/** Firestore Timestamps -> ISO strings, recursively (for JSON responses). */
export function toPlain(v) {
  if (v instanceof Timestamp) return v.toDate().toISOString();
  if (Array.isArray(v)) return v.map(toPlain);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toPlain(x)]));
  return v;
}

/** Works out what changed; returns the update patch and one activity entry per change. */
function diffPipeline(lead, changes, by) {
  const patch = {};
  const entries = [];
  if ('status' in changes && changes.status !== lead.status) {
    patch.status = changes.status;
    entries.push({ type: 'status', status: changes.status, from: lead.status, by });
  }
  for (const f of PIPELINE_FIELDS) {
    if (!(f in changes)) continue;
    const before = lead.pipeline?.[f] ?? null;
    if (changes[f] !== before) {
      patch[`pipeline.${f}`] = changes[f];
      entries.push({ type: 'field', field: f, from: before, to: changes[f], by });
    }
  }
  return { patch, entries };
}

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

    // ---------- lead register (Stage 6) ----------

    /** Newest first, one page at a time. `before` = createdAt ISO of the last lead on the previous page. */
    async listLeads({ limit = 200, before } = {}) {
      let q = db.collection('leads').orderBy('createdAt', 'desc').limit(limit);
      if (before) q = q.startAfter(Timestamp.fromDate(new Date(before)));
      const snap = await q.get();
      const leads = snap.docs.map((d) => ({ ...toPlain(d.data()), version: String(d.get('updatedAt')?.toMillis?.() ?? 0) }));
      return { leads, nextCursor: snap.size === limit ? leads.at(-1).createdAt : null };
    },

    async getLead(reference) {
      const ref = db.doc(`leads/${reference}`);
      const [lead, activity, consents] = await Promise.all([
        ref.get(),
        ref.collection('activity').orderBy('at', 'asc').get(),
        db.collection('consents').where('leadId', '==', reference).get(),
      ]);
      if (!lead.exists) throw new NotFoundError(reference);
      return {
        lead: { ...toPlain(lead.data()), version: String(lead.get('updatedAt')?.toMillis?.() ?? 0) },
        activity: activity.docs.map((d) => ({ id: d.id, ...toPlain(d.data()) })),
        consents: consents.docs.map((d) => ({ id: d.id, ...toPlain(d.data()) })),
      };
    },

    /** Optimistic concurrency: fails with ConflictError if someone saved since `expectedVersion`. */
    async updateLead(reference, changes, { by, expectedVersion }) {
      const ref = db.doc(`leads/${reference}`);
      const changed = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw new NotFoundError(reference);
        const version = String(snap.get('updatedAt')?.toMillis?.() ?? 0);
        if (expectedVersion !== version) throw new ConflictError(reference);
        const { patch, entries } = diffPipeline(snap.data(), changes, by);
        if (!entries.length) return 0;
        const ts = FieldValue.serverTimestamp();
        tx.update(ref, { ...patch, updatedAt: ts });
        for (const e of entries) tx.create(ref.collection('activity').doc(), { ...e, at: ts });
        return entries.length;
      });
      return { changed, ...(await this.getLead(reference)) };
    },

    async addNote(reference, text, { by }) {
      const ref = db.doc(`leads/${reference}`);
      await db.runTransaction(async (tx) => {
        if (!(await tx.get(ref)).exists) throw new NotFoundError(reference);
        tx.create(ref.collection('activity').doc(), { type: 'note', text, by, at: FieldValue.serverTimestamp() });
      });
    },

    /** Permanently removes a lead, its activity and its consent records (data-subject deletion). */
    async deleteLead(reference) {
      const ref = db.doc(`leads/${reference}`);
      if (!(await ref.get()).exists) throw new NotFoundError(reference);
      const [activity, consents] = await Promise.all([ref.collection('activity').get(), db.collection('consents').where('leadId', '==', reference).get()]);
      const docs = [...activity.docs.map((d) => d.ref), ...consents.docs.map((d) => d.ref), ref];
      for (let i = 0; i < docs.length; i += 400) {
        const batch = db.batch();
        docs.slice(i, i + 400).forEach((d) => batch.delete(d));
        await batch.commit();
      }
      return { activity: activity.size, consents: consents.size };
    },

    async audit(entry) {
      await db.collection('adminAudit').add({ ...entry, at: FieldValue.serverTimestamp(), expiresAt: Timestamp.fromDate(addMonths(new Date(), AUDIT_RETENTION_MONTHS)) });
    },
  };
}

/** In-memory twin of the Firestore store, for tests and local development. */
export function createMemoryStore({ retentionMonths = 24 } = {}) {
  const data = { leads: new Map(), activity: [], consents: [], submissions: new Map(), dedupe: new Map(), rateLimits: new Map(), audit: [] };
  const clone = (v) => structuredClone(v);
  const version = (lead) => String(Date.parse(lead.updatedAt));
  // Guarantees a distinct, increasing updatedAt even for edits in the same millisecond.
  let lastTs = 0;
  const stamp = () => {
    lastTs = Math.max(Date.now(), lastTs + 1);
    return new Date(lastTs).toISOString();
  };
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
        const at = stamp();
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
        lead.updatedAt = stamp();
      }),
    recordDownload: (reference) =>
      serial(() => {
        const lead = data.leads.get(reference);
        if (!lead) throw Object.assign(new Error('not found'), { code: 'not-found' });
        lead.downloads = (lead.downloads ?? 0) + 1;
        lead.lastDownloadAt = new Date().toISOString();
      }),

    listLeads: ({ limit = 200, before } = {}) =>
      serial(() => {
        const all = [...data.leads.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        const page = all.filter((l) => !before || l.createdAt < before).slice(0, limit);
        return { leads: page.map((l) => ({ ...clone(l), version: version(l) })), nextCursor: page.length === limit ? page.at(-1).createdAt : null };
      }),
    getLead: (reference) =>
      serial(() => {
        const lead = data.leads.get(reference);
        if (!lead) throw new NotFoundError(reference);
        return {
          lead: { ...clone(lead), version: version(lead) },
          activity: clone(data.activity.filter((a) => a.leadId === reference)),
          consents: clone(data.consents.filter((c) => c.leadId === reference)),
        };
      }),
    async updateLead(reference, changes, { by, expectedVersion }) {
      const changed = await serial(() => {
        const lead = data.leads.get(reference);
        if (!lead) throw new NotFoundError(reference);
        if (expectedVersion !== version(lead)) throw new ConflictError(reference);
        const { patch, entries } = diffPipeline(lead, changes, by);
        if (!entries.length) return 0;
        const at = stamp();
        for (const [k, v] of Object.entries(patch)) {
          if (k.startsWith('pipeline.')) lead.pipeline = { ...lead.pipeline, [k.slice(9)]: v };
          else lead[k] = v;
        }
        lead.updatedAt = at;
        for (const e of entries) data.activity.push({ ...e, leadId: reference, at });
        return entries.length;
      });
      return { changed, ...(await this.getLead(reference)) };
    },
    addNote: (reference, text, { by }) =>
      serial(() => {
        if (!data.leads.has(reference)) throw new NotFoundError(reference);
        data.activity.push({ leadId: reference, type: 'note', text, by, at: stamp() });
      }),
    deleteLead: (reference) =>
      serial(() => {
        if (!data.leads.has(reference)) throw new NotFoundError(reference);
        const activity = data.activity.filter((a) => a.leadId === reference).length;
        const consents = data.consents.filter((c) => c.leadId === reference).length;
        data.activity = data.activity.filter((a) => a.leadId !== reference);
        data.consents = data.consents.filter((c) => c.leadId !== reference);
        data.leads.delete(reference);
        return { activity, consents };
      }),
    audit: (entry) => serial(() => void data.audit.push({ ...entry, at: new Date().toISOString() })),
  };
}
