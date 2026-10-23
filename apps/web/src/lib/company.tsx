import { doc } from 'firebase/firestore';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { Permission } from '@bms/domain';
import { useAuth } from './auth';
import { db } from './firebase';
import { useDoc } from './firestore-hooks';

export interface Company {
  id: string;
  legalName: string;
  tradingName: string;
  country: string;
  baseCurrency: string;
  timeZone: string;
  fiscalYearStartMonth: number;
  costingMethod: string;
  status: string;
  locks: { baseCurrency: boolean; costingMethod: boolean; fiscalYearStartMonth: boolean };
}

export interface Member {
  id: string;
  uid: string;
  email: string;
  displayName: string;
  status: 'active' | 'suspended' | 'removed';
  roleIds: string[];
  permissions: Permission[];
  branchScope: 'all' | string[];
}

interface CompanyState {
  companyId: string;
  company: Company | null;
  member: Member | null;
  loading: boolean;
  error: Error | null;
  /** UI hint only; the server enforces permissions on every command. */
  can: (permission: Permission) => boolean;
}

const CompanyContext = createContext<CompanyState | null>(null);

export function CompanyProvider({
  companyId,
  children,
}: {
  companyId: string;
  children: ReactNode;
}) {
  const { user } = useAuth();
  const memberRef = useMemo(
    () => (user ? doc(db, `companies/${companyId}/members/${user.uid}`) : null),
    [companyId, user],
  );
  const member = useDoc<Omit<Member, 'id'>>(memberRef);
  const active = member.data?.status === 'active';
  const companyRef = useMemo(
    () => (active ? doc(db, `companies/${companyId}`) : null),
    [companyId, active],
  );
  const company = useDoc<Omit<Company, 'id'>>(companyRef);

  const value = useMemo<CompanyState>(() => {
    const permissions = new Set(active ? (member.data?.permissions ?? []) : []);
    return {
      companyId,
      company: company.data,
      member: member.data,
      loading: member.loading || (active && company.loading),
      error: member.error ?? company.error,
      can: (p) => permissions.has(p),
    };
  }, [companyId, company, member, active]);

  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
}

export function useCompany(): CompanyState {
  const ctx = useContext(CompanyContext);
  if (!ctx) throw new Error('useCompany must be used inside CompanyProvider');
  return ctx;
}
