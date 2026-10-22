// Grant or remove lead-register access. There is no public sign-up: a person must
// first be added in Firebase console → Authentication → Users, then given a role here.
//
//   node scripts/manage-staff.mjs grant  person@example.com admin   # full access incl. export & delete
//   node scripts/manage-staff.mjs grant  person@example.com staff   # view, update, notes
//   node scripts/manage-staff.mjs revoke person@example.com         # removes role and signs them out everywhere
//   node scripts/manage-staff.mjs list
//
// Needs the same FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY
// variables as the server (or FIREBASE_AUTH_EMULATOR_HOST for local testing).
import { getAuth } from 'firebase-admin/auth';
import { getFirebaseApp } from '../server/firebase-app.js';
import { ROLES } from '../server/auth.js';

const [command, email, role] = process.argv.slice(2);
const auth = getAuth(getFirebaseApp());

async function main() {
  if (command === 'list') {
    let token;
    do {
      const page = await auth.listUsers(1000, token);
      for (const u of page.users) if (u.customClaims?.role) console.log(`${u.customClaims.role.padEnd(6)} ${u.email}${u.disabled ? ' (disabled)' : ''}`);
      token = page.pageToken;
    } while (token);
    return;
  }
  if (!email) throw new Error('Give an email address.');
  const user = await auth.getUserByEmail(email).catch(() => {
    throw new Error(`No Firebase user ${email}. Add them in Firebase console → Authentication → Users first.`);
  });
  if (command === 'grant') {
    if (!ROLES.has(role)) throw new Error('Role must be "admin" or "staff".');
    await auth.setCustomUserClaims(user.uid, { ...(user.customClaims ?? {}), role });
    await auth.revokeRefreshTokens(user.uid); // new role applies at their next sign-in
    console.log(`${email} is now ${role}. They need to sign in again.`);
  } else if (command === 'revoke') {
    const { role: _old, ...rest } = user.customClaims ?? {};
    await auth.setCustomUserClaims(user.uid, rest);
    await auth.revokeRefreshTokens(user.uid);
    console.log(`${email} no longer has access and has been signed out.`);
  } else {
    throw new Error('Commands: grant <email> <admin|staff> | revoke <email> | list');
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
