// Wires the lead handlers to the production Firestore store.
import { createLeadHandler } from './handler.js';
import { createFirestoreStore } from './store.js';
import { getDb } from './firestore.js';
import { checklist, consultation } from './leads.js';

const firestoreStore = (config) => createFirestoreStore(getDb(), { retentionMonths: config.retentionMonths });

export const consultationHandler = createLeadHandler({ ...consultation, getStore: firestoreStore });
export const checklistHandler = createLeadHandler({ ...checklist, getStore: firestoreStore });
