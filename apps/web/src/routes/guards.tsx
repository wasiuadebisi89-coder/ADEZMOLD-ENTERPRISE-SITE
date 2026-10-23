import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { Spinner } from '../components/ui/feedback';
import { useAuth } from '../lib/auth';

/** Requires a signed-in user; optionally a verified email. */
export function RequireAuth({
  children,
  verified = true,
}: {
  children: ReactNode;
  verified?: boolean;
}) {
  const { user, loading } = useAuth();
  const location = useLocation();
  const next = encodeURIComponent(location.pathname + location.search);
  if (loading) return <Spinner />;
  if (!user) return <Navigate to={`/sign-in?next=${next}`} replace />;
  if (verified && !user.emailVerified)
    return <Navigate to={`/verify-email?next=${next}`} replace />;
  return <>{children}</>;
}

export function PublicOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  if (user) return <Navigate to={user.emailVerified ? '/companies' : '/verify-email'} replace />;
  return <>{children}</>;
}
