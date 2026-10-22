// Firestore access through the Admin SDK (server only). The browser never talks to Firestore directly.
import { getFirestore } from 'firebase-admin/firestore';
import { getFirebaseApp } from './firebase-app.js';

let db;

export function getDb(env = process.env) {
  if (!db) db = getFirestore(getFirebaseApp(env));
  return db;
}
