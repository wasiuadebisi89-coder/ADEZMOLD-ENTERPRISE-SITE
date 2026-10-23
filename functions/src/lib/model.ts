/** Firestore document shapes and path helpers (docs/bms/DATA_MODEL.md §2–3). */
import type { Timestamp } from 'firebase-admin/firestore';
import type { BranchScope, PeriodStatus, Permission, SystemRoleId } from '@bms/domain';
import { db } from './firebase.js';

export type MemberStatus = 'active' | 'suspended' | 'removed';

export interface CompanyDoc {
  legalName: string;
  tradingName: string;
  country: string;
  baseCurrency: string;
  timeZone: string;
  fiscalYearStartMonth: number;
  costingMethod: 'weighted_average' | 'fifo';
  businessTypes: string[];
  status: 'active' | 'suspended';
  /** Set by posting services once a value can no longer change (Phase 2+). */
  locks: { baseCurrency: boolean; costingMethod: boolean; fiscalYearStartMonth: boolean };
  createdAt: Timestamp;
  createdBy: string;
  updatedAt: Timestamp;
  updatedBy: string;
  schemaVersion: number;
}

export interface MemberDoc {
  uid: string;
  email: string;
  displayName: string;
  status: MemberStatus;
  roleIds: string[];
  /** Denormalised union of role permissions, read by security rules. */
  permissions: Permission[];
  branchScope: BranchScope;
  joinedAt: Timestamp;
  invitedBy: string | null;
  updatedAt: Timestamp;
  updatedBy: string;
}

export interface RoleDoc {
  name: string;
  description: string;
  system: boolean;
  templateId: SystemRoleId | null;
  permissions: Permission[];
  updatedAt: Timestamp;
  updatedBy: string;
}

export interface BranchDoc {
  code: string;
  name: string;
  address: string;
  status: 'active' | 'inactive';
  isHeadOffice: boolean;
  updatedAt: Timestamp;
  updatedBy: string;
}

export interface SettingsDoc {
  backdateWindowDays: number;
  allowNegativeStock: boolean;
  roundingMode: 'half_away_from_zero';
  taxRounding: 'per_line';
  pricesIncludeTax: boolean;
  updatedAt: Timestamp;
  updatedBy: string;
}

export interface PeriodDoc {
  fiscalYearId: string;
  startDate: string;
  endDate: string;
  status: PeriodStatus;
  statusChangedAt: Timestamp;
  statusChangedBy: string;
  lastReason: string | null;
}

export interface FiscalYearDoc {
  startDate: string;
  endDate: string;
  status: 'open' | 'closed';
  createdAt: Timestamp;
  createdBy: string;
}

export interface InvitationDoc {
  companyId: string;
  companyName: string;
  email: string;
  roleIds: string[];
  branchScope: BranchScope;
  tokenHash: string;
  status: 'pending' | 'accepted' | 'revoked';
  expiresAt: Timestamp;
  invitedBy: string;
  createdAt: Timestamp;
  acceptedBy: string | null;
}

export interface ApprovalRequestDoc {
  action: 'period.reopen';
  target: { periodId: string };
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'used';
  requestedBy: string;
  requestedAt: Timestamp;
  decidedBy: string | null;
  decidedAt: Timestamp | null;
  decisionReason: string | null;
  usedAt: Timestamp | null;
}

export function companyRefs(companyId: string) {
  const company = db.doc(`companies/${companyId}`);
  return {
    company,
    member: (uid: string) => company.collection('members').doc(uid),
    members: company.collection('members'),
    role: (id: string) => company.collection('roles').doc(id),
    roles: company.collection('roles'),
    branch: (id: string) => company.collection('branches').doc(id),
    branches: company.collection('branches'),
    settings: company.collection('settings').doc('general'),
    period: (id: string) => company.collection('periods').doc(id),
    periods: company.collection('periods'),
    fiscalYear: (id: string) => company.collection('fiscalYears').doc(id),
    fiscalYears: company.collection('fiscalYears'),
    approval: (id: string) => company.collection('approvalRequests').doc(id),
    approvals: company.collection('approvalRequests'),
    command: (key: string) => company.collection('commands').doc(key),
    auditLogs: company.collection('auditLogs'),
  };
}

export const membershipMirror = (uid: string, companyId: string) =>
  db.doc(`users/${uid}/memberships/${companyId}`);

export const invitationRef = (id: string) => db.doc(`invitations/${id}`);
