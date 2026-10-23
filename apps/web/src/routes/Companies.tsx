import { collection } from 'firebase/firestore';
import { Building2, ChevronRight, Plus } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router';
import { Button } from '../components/ui/button';
import { Alert, Badge, Card, EmptyState, PageHeader, Spinner } from '../components/ui/feedback';
import { useAuth } from '../lib/auth';
import { db } from '../lib/firebase';
import { useCollection } from '../lib/firestore-hooks';
import { TopBar } from './TopBar';

interface Membership {
  companyName: string;
  status: 'active' | 'suspended' | 'removed';
  roleIds: string[];
}

export default function Companies() {
  const { user } = useAuth();
  const query = useMemo(
    () => (user ? collection(db, `users/${user.uid}/memberships`) : null),
    [user],
  );
  const { data, loading, error } = useCollection<Membership>(query, user?.uid ?? '');
  const visible = data
    .filter((m) => m.status !== 'removed')
    .sort((a, b) => a.companyName.localeCompare(b.companyName));

  return (
    <div className="min-h-dvh">
      <TopBar />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <PageHeader
          title="Your companies"
          description="Choose a company to work in."
          actions={
            <Button asChild>
              <Link to="/companies/new">
                <Plus className="size-4" aria-hidden /> New company
              </Link>
            </Button>
          }
        />
        {error && <Alert tone="error">Could not load your companies.</Alert>}
        {loading ? (
          <Spinner />
        ) : visible.length === 0 ? (
          <EmptyState
            title="No companies yet"
            description="Create your company, or open the invitation link a colleague sent you."
            action={
              <Button asChild>
                <Link to="/companies/new">Create a company</Link>
              </Button>
            }
          />
        ) : (
          <Card>
            <ul className="divide-y divide-slate-100">
              {visible.map((m) => (
                <li key={m.id}>
                  {m.status === 'active' ? (
                    <Link
                      to={`/c/${m.id}`}
                      className="flex items-center gap-3 px-4 py-4 hover:bg-slate-50"
                    >
                      <Building2 className="size-5 text-slate-400" aria-hidden />
                      <span className="flex-1 font-medium">{m.companyName}</span>
                      <ChevronRight className="size-4 text-slate-400" aria-hidden />
                    </Link>
                  ) : (
                    <div className="flex items-center gap-3 px-4 py-4 text-slate-500">
                      <Building2 className="size-5" aria-hidden />
                      <span className="flex-1">{m.companyName}</span>
                      <Badge tone="amber">Suspended</Badge>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </main>
    </div>
  );
}
