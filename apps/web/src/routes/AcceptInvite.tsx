import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { Button } from '../components/ui/button';
import { Alert } from '../components/ui/feedback';
import { runCommand } from '../lib/api';
import { useAuth } from '../lib/auth';
import { AuthLayout } from './auth/AuthLayout';

export default function AcceptInvite() {
  const { invitationId = '' } = useParams();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [key] = useState(() => crypto.randomUUID());

  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      const { companyId } = await runCommand<{ companyId: string }>(
        'invitation.accept',
        { invitationId, token },
        key,
      );
      navigate(`/c/${companyId}`, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not accept the invitation');
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="Join a company"
      subtitle={`You're signed in as ${user?.email}. The invitation must be for this email address.`}
    >
      <div className="space-y-4">
        {!token && (
          <Alert tone="error">This invitation link is incomplete. Ask for a new link.</Alert>
        )}
        {error && <Alert tone="error">{error}</Alert>}
        <Button className="w-full" onClick={accept} loading={busy} disabled={!token}>
          Accept invitation
        </Button>
        <button
          type="button"
          className="w-full text-sm text-slate-600 hover:underline"
          onClick={() => void signOut()}
        >
          Use a different account
        </button>
      </div>
    </AuthLayout>
  );
}
