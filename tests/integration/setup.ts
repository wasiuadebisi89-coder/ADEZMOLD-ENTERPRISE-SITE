// Emulator hosts are set by `firebase emulators:exec`; default them for direct runs.
process.env.GCLOUD_PROJECT ??= 'demo-bms';
process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
