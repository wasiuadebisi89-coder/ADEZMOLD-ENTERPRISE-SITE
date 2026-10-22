// Wires the lead handlers to the production Firestore store.
import { createLeadHandler } from './handler.js';
import { readConfig } from './config.js';
import { createFirestoreStore } from './store.js';
import { getDb } from './firestore.js';
import { checklist, consultation } from './leads.js';
import { createDownloadHandler } from './download.js';
import { createAdminHandler } from './admin.js';
import { createFirebaseAuthService } from './auth.js';

const firestoreStore = (config) => createFirestoreStore(getDb(), { retentionMonths: config.retentionMonths });

export const consultationHandler = createLeadHandler({ ...consultation, getStore: firestoreStore });
export const checklistHandler = createLeadHandler({ ...checklist, getStore: firestoreStore });
export const checklistDownloadHandler = createDownloadHandler({ getStore: () => firestoreStore(readConfig()) });
export const adminHandler = createAdminHandler({ getStore: firestoreStore, getAuthService: () => createFirebaseAuthService() });
