import { Clock, ShieldOff, XCircle } from 'lucide-react';
import { Link } from 'react-router';
import type { CompanyStatus } from '@bms/schemas';
import { TopBar } from '../routes/TopBar';
import { Button } from './ui/button';
import { Card } from './ui/feedback';

const COPY = {
  pending: {
    Icon: Clock,
    tone: 'text-amber-600',
    title: 'Waiting for approval',
    body: 'Thanks for registering. We check every new company before it goes live. This page opens your company by itself as soon as it is approved, so you can leave it open or come back later.',
  },
  rejected: {
    Icon: XCircle,
    tone: 'text-red-600',
    title: 'Registration not approved',
    body: 'This company was not approved. Contact us if you think this is a mistake.',
  },
  suspended: {
    Icon: ShieldOff,
    tone: 'text-slate-600',
    title: 'Company suspended',
    body: 'This company has been suspended. Your records are safe and nothing has been deleted. Contact us to restore access.',
  },
} as const;

/** Shown instead of the app while a company is not approved, or after it is suspended. */
export function CompanyStatusScreen({
  name,
  status,
  reason,
}: {
  name: string;
  status: Exclude<CompanyStatus, 'active'>;
  reason?: string | null | undefined;
}) {
  const { Icon, tone, title, body } = COPY[status];
  return (
    <div className="min-h-dvh">
      <TopBar />
      <main className="mx-auto max-w-lg px-4 py-12">
        <Card className="p-6 text-center sm:p-8">
          <Icon className={`mx-auto size-10 ${tone}`} aria-hidden />
          <h1 className="mt-4 text-xl font-semibold text-slate-900">{title}</h1>
          <p className="mt-1 text-sm font-medium text-slate-700">{name}</p>
          <p className="mt-3 text-sm text-slate-600">{body}</p>
          {reason && status !== 'pending' && (
            <p className="mt-4 rounded-md bg-slate-50 px-3 py-2 text-left text-sm text-slate-700">
              <span className="font-medium">Reason:</span> {reason}
            </p>
          )}
          <div className="mt-6 flex justify-center">
            <Button variant="secondary" asChild>
              <Link to="/companies">Back to your companies</Link>
            </Button>
          </div>
        </Card>
      </main>
    </div>
  );
}
