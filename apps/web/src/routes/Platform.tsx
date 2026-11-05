import { collection, orderBy, query, where } from 'firebase/firestore';
import { Building2, Clock, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import type { CompanyStatus } from '@bms/schemas';
import { Button } from '../components/ui/button';
import { Dialog } from '../components/ui/dialog';
import { Alert, Card, EmptyState, PageHeader, Spinner } from '../components/ui/feedback';
import { Field, Textarea } from '../components/ui/form';
import { ApiError, runCommand } from '../lib/api';
import { useAuth } from '../lib/auth';
import { db } from '../lib/firebase';
import { useCollection } from '../lib/firestore-hooks';
import { COMPANY_STATUS_LABEL } from '../lib/platform';
import { useAction } from '../lib/useAction';
import { cn, formatDateTime } from '../lib/utils';
import { TopBar } from './TopBar';

export interface RegisteredCompany {
  id: string;
  legalName: string;
  tradingName: string;
  country: string;
  baseCurrency: string;
  timeZone: string;
  status: CompanyStatus;
  registrant?: { uid: string; email: string | null; displayName: string | null } | null;
  statusReason?: string | null;
  statusChangedAt?: { toDate(): Date };
  createdAt?: { toDate(): Date };
}

type Change = { company: RegisteredCompany; status: 'active' | 'rejected' | 'suspended' };

const TABS: { status: CompanyStatus; label: string }[] = [
  { status: 'pending', label: 'Awaiting approval' },
  { status: 'active', label: 'Active' },
  { status: 'suspended', label: 'Suspended' },
  { status: 'rejected', label: 'Not approved' },
];

/** Makes sure the signed-in platform owner holds the admin claim; asks the server once if not. */
function usePlatformAccess() {
  const { user } = useAuth();
  const [state, setState] = useState<'checking' | 'granted' | 'denied' | 'error'>('checking');
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    if (!user) return;
    let live = true;
    void (async () => {
      try {
        const token = await user.getIdTokenResult();
        if (token.claims.platformAdmin !== true) {
          await runCommand('platform.claimAdmin', {});
          await user.getIdToken(true);
        }
        if (live) setState('granted');
      } catch (e) {
        if (!live) return;
        if (
          e instanceof ApiError &&
          ['not_platform_owner', 'not_platform_admin'].includes(e.reason)
        )
          setState('denied');
        else {
          setMessage(e instanceof Error ? e.message : null);
          setState('error');
        }
      }
    })();
    return () => {
      live = false;
    };
  }, [user]);
  return { state, message };
}

function CompanyRow({
  company,
  onChange,
}: {
  company: RegisteredCompany;
  onChange: (c: Change) => void;
}) {
  const r = company.registrant;
  return (
    <li className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 gap-3">
        <Building2 className="mt-0.5 size-5 shrink-0 text-slate-400" aria-hidden />
        <div className="min-w-0">
          <p className="font-medium text-slate-900">
            {company.legalName}
            {company.tradingName && company.tradingName !== company.legalName && (
              <span className="font-normal text-slate-500">
                {' '}
                · trading as {company.tradingName}
              </span>
            )}
          </p>
          <p className="mt-0.5 text-sm text-slate-600">
            {r?.displayName ?? 'Unknown'}
            {r?.email && <span className="text-slate-500"> ({r.email})</span>}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {company.country} · {company.baseCurrency} · {company.timeZone} · registered{' '}
            {formatDateTime(company.createdAt)}
          </p>
          {company.statusReason && company.status !== 'pending' && (
            <p className="mt-1 text-xs text-slate-600">Reason: {company.statusReason}</p>
          )}
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        {company.status === 'pending' && (
          <>
            <Button size="sm" onClick={() => onChange({ company, status: 'active' })}>
              Approve
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => onChange({ company, status: 'rejected' })}
            >
              Reject
            </Button>
          </>
        )}
        {company.status === 'active' && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onChange({ company, status: 'suspended' })}
          >
            Suspend
          </Button>
        )}
        {(company.status === 'suspended' || company.status === 'rejected') && (
          <Button size="sm" onClick={() => onChange({ company, status: 'active' })}>
            {company.status === 'rejected' ? 'Approve' : 'Reactivate'}
          </Button>
        )}
      </div>
    </li>
  );
}

const VERB = { active: 'Approve', rejected: 'Reject', suspended: 'Suspend' } as const;

function ChangeDialog({ change, onClose }: { change: Change; onClose: () => void }) {
  const action = useAction();
  const [reason, setReason] = useState('');
  const { company, status } = change;
  const needsReason = status !== 'active';
  const verb = status === 'active' && company.status === 'suspended' ? 'Reactivate' : VERB[status];
  const description = {
    active: 'Its users can start working in it straight away.',
    rejected: 'Its users stay on the waiting screen and see your reason.',
    suspended: 'Nobody in it can work until you reactivate it. Its records are kept.',
  }[status];
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const trimmed = reason.trim();
      await action.run('platform.setCompanyStatus', {
        companyId: company.id,
        status,
        ...(trimmed ? { reason: trimmed } : {}),
      });
      onClose();
    } catch {
      /* shown below */
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`${verb} ${company.legalName}?`}
      description={description}
    >
      <form onSubmit={submit} className="space-y-4">
        {action.error && <Alert tone="error">{action.error.message}</Alert>}
        <Field
          label={needsReason ? 'Reason' : 'Note (optional)'}
          hint={needsReason ? 'The company’s users see this.' : 'Recorded in the platform log.'}
          error={action.error?.fields.reason}
        >
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant={status === 'active' ? 'primary' : 'danger'}
            loading={action.pending}
            disabled={needsReason && reason.trim().length < 3}
          >
            {verb}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function Dashboard() {
  const [tab, setTab] = useState<CompanyStatus>('pending');
  const [change, setChange] = useState<Change | null>(null);
  const pendingQuery = useMemo(
    () => query(collection(db, 'companies'), where('status', '==', 'pending')),
    [],
  );
  const pending = useCollection<Omit<RegisteredCompany, 'id'>>(pendingQuery, 'platform-pending');
  const listQuery = useMemo(
    () =>
      query(collection(db, 'companies'), where('status', '==', tab), orderBy('createdAt', 'desc')),
    [tab],
  );
  const list = useCollection<Omit<RegisteredCompany, 'id'>>(listQuery, `platform-${tab}`);
  const rows = list.data as RegisteredCompany[];

  return (
    <>
      <PageHeader
        title="Company registrations"
        description="New companies wait here until you approve them. Only approved companies can use the app."
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <Card className="flex items-center gap-3 p-4">
          <Clock className="size-6 text-amber-600" aria-hidden />
          <div>
            <p
              className="text-2xl font-semibold text-slate-900"
              aria-label="Awaiting approval count"
            >
              {pending.loading ? '…' : pending.data.length}
            </p>
            <p className="text-sm text-slate-500">Awaiting your approval</p>
          </div>
        </Card>
        <Card className="flex items-center gap-3 p-4">
          <ShieldCheck className="size-6 text-teal-700" aria-hidden />
          <p className="text-sm text-slate-600">
            Every decision is recorded in the platform audit log with your reason.
          </p>
        </Card>
      </div>
      <div role="tablist" aria-label="Registration status" className="mb-3 flex flex-wrap gap-1">
        {TABS.map((t) => (
          <button
            key={t.status}
            role="tab"
            type="button"
            aria-selected={tab === t.status}
            onClick={() => setTab(t.status)}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium',
              tab === t.status ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100',
            )}
          >
            {t.label}
            {t.status === 'pending' && pending.data.length > 0 && (
              <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 text-xs text-white">
                {pending.data.length}
              </span>
            )}
          </button>
        ))}
      </div>
      {list.error && <Alert tone="error">Could not load companies: {list.error.message}</Alert>}
      {list.loading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <EmptyState
          title={
            tab === 'pending'
              ? 'Nothing waiting'
              : `No ${COMPANY_STATUS_LABEL[tab].toLowerCase()} companies`
          }
          description={
            tab === 'pending' ? 'New registrations will appear here as they come in.' : undefined
          }
        />
      ) : (
        <Card>
          <ul className="divide-y divide-slate-100" aria-label={COMPANY_STATUS_LABEL[tab]}>
            {rows.map((c) => (
              <CompanyRow key={c.id} company={c} onChange={setChange} />
            ))}
          </ul>
        </Card>
      )}
      {change && <ChangeDialog change={change} onClose={() => setChange(null)} />}
    </>
  );
}

export default function Platform() {
  const access = usePlatformAccess();
  return (
    <div className="min-h-dvh">
      <TopBar />
      <main className="mx-auto max-w-5xl px-4 py-8">
        {access.state === 'checking' ? (
          <Spinner label="Checking access" />
        ) : access.state === 'granted' ? (
          <Dashboard />
        ) : (
          <div className="mx-auto max-w-md py-8">
            <Alert tone="error">
              {access.state === 'denied'
                ? 'This area is only for the platform owner.'
                : (access.message ?? 'Could not open the platform dashboard.')}{' '}
              <Link to="/companies" className="font-medium underline">
                Back to your companies
              </Link>
            </Alert>
          </div>
        )}
      </main>
    </div>
  );
}
