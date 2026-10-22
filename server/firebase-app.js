// One Firebase Admin app for the whole server (Firestore + Auth).
// Credentials come from environment variables; emulators are used automatically
// when FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST are set.
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { ConfigError } from './config.js';

export function getFirebaseApp(env = process.env) {
  const existing = getApps()[0];
  if (existing) return existing;
  if (env.FIRESTORE_EMULATOR_HOST || env.FIREBASE_AUTH_EMULATOR_HOST) {
    return initializeApp({ projectId: env.FIREBASE_PROJECT_ID || 'demo-adezmold' });
  }
  const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = env;
  if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) {
    throw new ConfigError('Firebase credentials are not configured');
  }
  return initializeApp({
    credential: cert({
      projectId: FIREBASE_PROJECT_ID,
      clientEmail: FIREBASE_CLIENT_EMAIL,
      // Vercel stores the key on one line with literal "\n" sequences.
      privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });
}
