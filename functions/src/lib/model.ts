/** Firestore document shapes and path helpers (docs/bms/DATA_MODEL.md §2–3). */
import type { Timestamp } from 'firebase-admin/firestore';
import type {
  AccountSubtype,
  AccountType,
  BranchScope,
  JournalOrigin,
  PeriodStatus,
  Permission,
  SystemRoleId,
} from '@bms/domain';
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

export type ApprovalTarget =
  | { action: 'period.reopen'; target: { periodId: string } }
  | { action: 'ledger.backdate'; target: { postingDate: string } };

export type ApprovalRequestDoc = ApprovalTarget & {
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'used';
  requestedBy: string;
  requestedAt: Timestamp;
  decidedBy: string | null;
  decidedAt: Timestamp | null;
  decisionReason: string | null;
  usedAt: Timestamp | null;
  /** The record that consumed the approval, e.g. a journal id. */
  usedFor: string | null;
};

// --- Ledger (DATA_MODEL.md §4) ---------------------------------------------------------------

export interface AccountDoc {
  code: string;
  name: string;
  type: AccountType;
  subtype: AccountSubtype;
  parentId: string | null;
  isPostable: boolean;
  /** Derived from the subtype; control accounts only take postings from their module. */
  isControl: boolean;
  status: 'active' | 'inactive';
  /** Set by the first posting; the type and subtype are fixed from then on. */
  hasPostings: boolean;
  template: { id: string; version: number } | null;
  createdAt: Timestamp;
  createdBy: string;
  updatedAt: Timestamp;
  updatedBy: string;
}

export interface JournalLineDoc {
  lineNo: number;
  accountId: string;
  /** Snapshots so the journal reads correctly after an account is renamed. */
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  memo: string | null;
}

export interface JournalDoc {
  number: string;
  postingDate: string;
  periodId: string;
  branchId: string;
  origin: JournalOrigin;
  currency: string;
  memo: string;
  reference: string | null;
  lines: JournalLineDoc[];
  totalDebit: number;
  totalCredit: number;
  status: 'posted' | 'reversed';
  reversesJournalId: string | null;
  reversedByJournalId: string | null;
  reversalReason: string | null;
  backdateApprovalId: string | null;
  postedAt: Timestamp;
  postedBy: string;
}

export interface LedgerEntryDoc {
  journalId: string;
  journalNumber: string;
  lineNo: number;
  accountId: string;
  postingDate: string;
  periodId: string;
  branchId: string;
  origin: JournalOrigin;
  debit: number;
  credit: number;
  memo: string | null;
  postedAt: Timestamp;
}

export interface NumberSeriesDoc {
  prefix: string;
  next: number;
}

export interface LedgerSettingsDoc {
  /** The posted, unreversed opening-balance journal, if any. */
  openingBalanceJournalId: string | null;
  updatedAt: Timestamp;
  updatedBy: string;
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
    account: (id: string) => company.collection('accounts').doc(id),
    accounts: company.collection('accounts'),
    journal: (id: string) => company.collection('journals').doc(id),
    journals: company.collection('journals'),
    ledgerEntry: (id: string) => company.collection('ledgerEntries').doc(id),
    ledgerEntries: company.collection('ledgerEntries'),
    numberSeries: (id: string) => company.collection('numberSeries').doc(id),
    ledgerSettings: company.collection('settings').doc('ledger'),
    auditLogs: company.collection('auditLogs'),
  };
}

export const membershipMirror = (uid: string, companyId: string) =>
  db.doc(`users/${uid}/memberships/${companyId}`);

export const invitationRef = (id: string) => db.doc(`invitations/${id}`);
