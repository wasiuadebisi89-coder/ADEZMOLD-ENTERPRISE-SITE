import { sendEmailVerification } from 'firebase/auth';
import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { Button } from '../../components/ui/button';
import { Alert } from '../../components/ui/feedback';
import { useAuth } from '../../lib/auth';
import { AuthLayout } from './AuthLayout';
import { safeNext } from './SignIn';

export default function VerifyEmail() {
  const { user, refresh, signOut } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [message, setMessage] = useState<{ tone: 'info' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  if (!user) return <Navigate to="/sign-in" replace />;
  if (user.emailVerified) return <Navigate to={safeNext(params.get('next'))} replace />;

  const check = async () => {
    setBusy(true);
    await refresh();
    setBusy(false);
    if (user.emailVerified) navigate(safeNext(params.get('next')), { replace: true });
    else
      setMessage({
        tone: 'error',
        text: 'Not verified yet. Open the link in the email, then try again.',
      });
  };

  const resend = async () => {
    try {
      await sendEmailVerification(user);
      setMessage({ tone: 'info', text: 'Verification email sent.' });
    } catch {
      setMessage({ tone: 'error', text: 'Please wait a little before requesting another email.' });
    }
  };

  return (
    <AuthLayout title="Verify your email" subtitle={`We sent a link to ${user.email}.`}>
      <div className="space-y-4">
        {message && <Alert tone={message.tone}>{message.text}</Alert>}
        <Button className="w-full" onClick={check} loading={busy}>
          I've verified my email
        </Button>
        <div className="flex justify-between text-sm">
          <button type="button" className="text-brand-700 hover:underline" onClick={resend}>
            Resend email
          </button>
          <button
            type="button"
            className="text-slate-600 hover:underline"
            onClick={() => void signOut()}
          >
            Sign out
          </button>
        </div>
      </div>
    </AuthLayout>
  );
}
