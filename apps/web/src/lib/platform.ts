import { useEffect, useState } from 'react';
import type { CompanyStatus } from '@bms/schemas';
import { onIdTokenChanged } from 'firebase/auth';
import { useAuth } from './auth';
import { auth } from './firebase';

/**
 * Whether the signed-in user's token carries the Platform Super Admin claim. A UI hint only:
 * the server and the security rules check the claim and the `platformAdmins` record.
 */
export function usePlatformAdmin(): { isAdmin: boolean; loading: boolean } {
  const { user } = useAuth();
  const [state, setState] = useState<{ uid: string | null; isAdmin: boolean } | null>(null);
  useEffect(() => {
    if (!user) return;
    // Re-check on every token refresh, so the link appears as soon as the claim is granted.
    return onIdTokenChanged(auth, (u) => {
      if (!u) return;
      void u
        .getIdTokenResult()
        .then((t) => setState({ uid: u.uid, isAdmin: t.claims.platformAdmin === true }))
        .catch(() => setState({ uid: u.uid, isAdmin: false }));
    });
  }, [user]);
  const current = user && state?.uid === user.uid ? state : null;
  return { isAdmin: current?.isAdmin ?? false, loading: !!user && !current };
}

export const COMPANY_STATUS_LABEL: Record<CompanyStatus, string> = {
  pending: 'Awaiting approval',
  active: 'Active',
  rejected: 'Not approved',
  suspended: 'Suspended',
};

export const COMPANY_STATUS_TONE = {
  pending: 'amber',
  active: 'green',
  rejected: 'red',
  suspended: 'slate',
} as const satisfies Record<CompanyStatus, string>;
