import { FirebaseError } from 'firebase/app';

/** Maps Firebase Auth error codes to messages that do not reveal whether an account exists. */
export function authErrorMessage(e: unknown): string {
  const code = e instanceof FirebaseError ? e.code : '';
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-email':
      return 'Email or password is incorrect.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Try signing in.';
    case 'auth/weak-password':
      return 'Choose a stronger password (at least 10 characters).';
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a moment and try again.';
    case 'auth/user-disabled':
      return 'This account has been disabled.';
    case 'auth/network-request-failed':
      return 'Could not reach the server. Check your connection.';
    // Set-up problems in the Firebase project, not the user's fault. Named so they can be fixed.
    case 'auth/operation-not-allowed':
    case 'auth/configuration-not-found':
      return 'Email sign-in is not switched on for this site yet. Please tell the administrator.';
    case 'auth/invalid-api-key':
    case 'auth/api-key-not-valid.-please-pass-a-valid-api-key.':
    case 'auth/unauthorized-domain':
      return `This site is not set up correctly for sign-in (${code}). Please tell the administrator.`;
    default:
      // The code helps whoever runs the site; it says nothing about whether an account exists.
      // Logged so the cause can be read in the browser console when there is no code.
      console.error(e);
      return code
        ? `Something went wrong (${code}). Please try again.`
        : 'Something went wrong. Please try again.';
  }
}
