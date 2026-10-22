// Firestore access through the Admin SDK (server only). Credentials come from
// environment variables; the browser never talks to Firestore directly.
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { ConfigError } from './config.js';

let db;

export function getDb(env = process.env) {
  if (db) return db;
  let app = getApps()[0];
  if (!app) {
    if (env.FIRESTORE_EMULATOR_HOST) {
      app = initializeApp({ projectId: env.FIREBASE_PROJECT_ID || 'demo-adezmold' });
    } else {
      const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = env;
      if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) {
        throw new ConfigError('Firebase credentials are not configured');
      }
      app = initializeApp({
        credential: cert({
          projectId: FIREBASE_PROJECT_ID,
          clientEmail: FIREBASE_CLIENT_EMAIL,
          // Vercel stores the key on one line with literal "\n" sequences.
          privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        }),
      });
    }
  }
  db = getFirestore(app);
  return db;
}
