/**
 * Permission catalogue and system role templates. Strings follow `module.resource.action`.
 * docs/bms/ROLES.md is the human-readable version of SYSTEM_ROLES; a unit test keeps them aligned.
 */

export const PERMISSIONS = [
  // Phase 1: company administration
  'company.settings.read',
  'company.settings.update',
  'company.branches.manage',
  'company.members.read',
  'company.members.invite',
  'company.members.manage',
  'company.roles.manage',
  'company.audit.read',
  'settings.periods.read',
  'settings.periods.close',
  'settings.periods.postSoftClosed',
  'settings.periods.reopen.request',
  'settings.periods.reopen.approve',
  'approvals.read',
  // Phase 2+: declared now so role templates are stable
  'ledger.accounts.read',
  'ledger.accounts.manage',
  'ledger.journal.read',
  'ledger.journal.post',
  'ledger.journal.reverse',
  'ledger.journal.reverse.approve',
  'ledger.backdate.request',
  'ledger.backdate.approve',
  'ledger.bank.reconcile',
  'inventory.products.read',
  'inventory.products.manage',
  'inventory.adjustment.create',
  'inventory.adjustment.approve',
  'inventory.count.create',
  'inventory.count.approve',
  'purchasing.read',
  'purchasing.suppliers.manage',
  'purchasing.invoice.post',
  'purchasing.receipt.post',
  'purchasing.payment.post',
  'purchasing.payment.approve',
  'sales.read',
  'sales.readOwn',
  'sales.customers.manage',
  'sales.creditLimit.override',
  'sales.invoice.post',
  'sales.priceOverride',
  'sales.receipt.post',
  'sales.return.create',
  'sales.return.post',
  'sales.return.receiveGoods',
  'sales.refund.request',
  'sales.refund.post',
  'sales.refund.approve',
  'assets.read',
  'assets.manage',
  'assets.depreciation.post',
  'reports.financial.read',
  'reports.stock.read',
  'reports.sales.read',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const PERMISSION_SET: ReadonlySet<string> = new Set(PERMISSIONS);

export function isPermission(value: string): value is Permission {
  return PERMISSION_SET.has(value);
}

export type SystemRoleId =
  'company_admin' | 'manager' | 'sales_officer' | 'store_officer' | 'accountant' | 'auditor';

export interface RoleTemplate {
  id: SystemRoleId;
  name: string;
  description: string;
  permissions: readonly Permission[];
}

const READ_ALL: Permission[] = PERMISSIONS.filter((p) => p.endsWith('.read'));

/** Request-only permissions are for roles that cannot act directly; admins act directly. */
const REQUEST_ONLY: readonly Permission[] = ['sales.readOwn', 'sales.refund.request'];

const ADMIN_PERMISSIONS: Permission[] = PERMISSIONS.filter((p) => !REQUEST_ONLY.includes(p));

export const SYSTEM_ROLES: readonly RoleTemplate[] = [
  {
    id: 'company_admin',
    name: 'Company Admin',
    description: 'Full control of the company, its users and approvals.',
    permissions: ADMIN_PERMISSIONS,
  },
  {
    id: 'manager',
    name: 'Manager',
    description: 'Runs daily operations and approves operational exceptions.',
    permissions: [
      ...READ_ALL,
      'inventory.products.manage',
      'inventory.adjustment.approve',
      'inventory.count.approve',
      'purchasing.suppliers.manage',
      'purchasing.invoice.post',
      'purchasing.receipt.post',
      'purchasing.payment.post',
      'sales.customers.manage',
      'sales.creditLimit.override',
      'sales.invoice.post',
      'sales.priceOverride',
      'sales.receipt.post',
      'sales.return.create',
      'sales.return.post',
      'sales.refund.post',
      'sales.refund.approve',
      'ledger.backdate.approve',
    ],
  },
  {
    id: 'sales_officer',
    name: 'Sales Officer',
    description: 'Sells, takes customer payments and starts returns in assigned branches.',
    permissions: [
      'company.settings.read',
      'inventory.products.read',
      'sales.readOwn',
      'sales.invoice.post',
      'sales.receipt.post',
      'sales.return.create',
      'sales.refund.request',
    ],
  },
  {
    id: 'store_officer',
    name: 'Store Officer',
    description: 'Maintains products, receives goods and counts stock.',
    permissions: [
      'company.settings.read',
      'inventory.products.read',
      'inventory.products.manage',
      'inventory.adjustment.create',
      'inventory.count.create',
      'purchasing.read',
      'purchasing.receipt.post',
      'sales.return.receiveGoods',
      'reports.stock.read',
    ],
  },
  {
    id: 'accountant',
    name: 'Accountant',
    description: 'Maintains the books, closes periods and posts financial transactions.',
    permissions: [
      ...READ_ALL,
      'settings.periods.close',
      'settings.periods.postSoftClosed',
      'settings.periods.reopen.request',
      'ledger.accounts.manage',
      'ledger.journal.post',
      'ledger.journal.reverse',
      'ledger.backdate.request',
      'ledger.bank.reconcile',
      'purchasing.suppliers.manage',
      'purchasing.invoice.post',
      'purchasing.payment.post',
      'sales.customers.manage',
      'sales.receipt.post',
      'sales.refund.post',
      'assets.manage',
      'assets.depreciation.post',
    ],
  },
  {
    id: 'auditor',
    name: 'Auditor',
    description: 'Read-only access to all records and reports.',
    permissions: READ_ALL,
  },
];

export function roleTemplate(id: SystemRoleId): RoleTemplate {
  const role = SYSTEM_ROLES.find((r) => r.id === id);
  if (!role) throw new Error(`Unknown system role ${id}`);
  return role;
}

/** Union of the permissions granted by a member's roles. */
export function effectivePermissions(
  roles: readonly { permissions: readonly string[] }[],
): Set<Permission> {
  const result = new Set<Permission>();
  for (const role of roles) {
    for (const p of role.permissions) if (isPermission(p)) result.add(p);
  }
  return result;
}

export type BranchScope = 'all' | readonly string[];

export function branchAllowed(scope: BranchScope, branchId: string): boolean {
  return scope === 'all' || scope.includes(branchId);
}
