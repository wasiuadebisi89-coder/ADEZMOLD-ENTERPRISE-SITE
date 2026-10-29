import { collection, doc, query, where } from 'firebase/firestore';
import { useMemo } from 'react';
import { Link } from 'react-router';
import { businessDate, periodIdForDate } from '@bms/domain';
import { Alert, Badge, Card, PageHeader } from '../../components/ui/feedback';
import { useCompany } from '../../lib/company';
import { db } from '../../lib/firebase';
import { useCollection, useDoc } from '../../lib/firestore-hooks';
import { formatDate } from '../../lib/utils';
import { PERIOD_STATUS } from './Periods';

export default function Dashboard() {
  const { companyId, company, member, can } = useCompany();
  const today = businessDate(new Date(), company!.timeZone);
  const periodRef = useMemo(
    () =>
      can('settings.periods.read')
        ? doc(db, `companies/${companyId}/periods/${periodIdForDate(today)}`)
        : null,
    [companyId, today, can],
  );
  const period = useDoc<{ status: keyof typeof PERIOD_STATUS; startDate: string; endDate: string }>(
    periodRef,
  );
  const branchesQuery = useMemo(
    () => query(collection(db, `companies/${companyId}/branches`), where('status', '==', 'active')),
    [companyId],
  );
  const branches = useCollection(branchesQuery, `branches-${companyId}`);
  const membersQuery = useMemo(
    () =>
      can('company.members.read')
        ? query(collection(db, `companies/${companyId}/members`), where('status', '==', 'active'))
        : null,
    [companyId, can],
  );
  const members = useCollection(
    membersQuery,
    `members-${companyId}-${can('company.members.read')}`,
  );

  return (
    <>
      <PageHeader
        title={`Welcome, ${member?.displayName ?? ''}`}
        description={`${company!.legalName} · ${company!.baseCurrency} · ${company!.timeZone}`}
      />
      <Alert tone="info" className="mb-6">
        Sales, purchases, stock, accounting and reports are in the menu. This overview shows only
        live company data; no figures are estimated.
      </Alert>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="p-5">
          <p className="text-sm text-slate-500">Current financial period</p>
          {periodRef ? (
            period.data ? (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-lg font-semibold">
                  {formatDate(period.data.startDate)} – {formatDate(period.data.endDate)}
                </span>
                <Badge tone={PERIOD_STATUS[period.data.status].tone}>
                  {PERIOD_STATUS[period.data.status].label}
                </Badge>
              </div>
            ) : (
              <p className="mt-2 text-sm text-amber-700">
                {period.loading ? 'Loading…' : 'No period covers today. '}
                {!period.loading && (
                  <Link to="periods" className="underline">
                    Create the next financial year
                  </Link>
                )}
              </p>
            )
          ) : (
            <p className="mt-2 text-sm text-slate-500">Not available for your role.</p>
          )}
        </Card>
        <Card className="p-5">
          <p className="text-sm text-slate-500">Active branches</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">
            {branches.loading ? '…' : branches.data.length}
          </p>
        </Card>
        {membersQuery && (
          <Card className="p-5">
            <p className="text-sm text-slate-500">Active users</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">
              {members.loading ? '…' : members.data.length}
            </p>
          </Card>
        )}
      </div>
    </>
  );
}
