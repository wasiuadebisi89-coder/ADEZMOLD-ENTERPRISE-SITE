import type { Permission } from '@bms/domain';
import {
  Armchair,
  BarChart3,
  BookOpen,
  Building,
  CheckSquare,
  FileText,
  Factory,
  FolderKanban,
  Contact,
  ClipboardList,
  ListTree,
  Scale,
  CalendarDays,
  CalendarRange,
  HandCoins,
  History,
  Landmark,
  LayoutDashboard,
  Package,
  Percent,
  Receipt,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Store,
  Truck,
  Users,
  Wallet,
} from 'lucide-react';
import { pageHidden } from './modules';

export interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  /** Shown when the member has any of these. */
  permission?: Permission | readonly Permission[];
}

export interface NavGroup {
  id: string;
  label: string;
  icon: typeof LayoutDashboard;
  items: NavItem[];
}

export type NavEntry = NavItem | NavGroup;

export const isGroup = (e: NavEntry): e is NavGroup => 'items' in e;

/**
 * The company menu. Items show only when the member's role allows them and, for Projects and
 * Production, only when the company does that kind of business (Settings). Related items sit
 * under one heading that opens and closes.
 */
export const NAV: NavEntry[] = [
  { to: '', label: 'Overview', icon: LayoutDashboard },
  { to: 'approvals', label: 'Approvals', icon: CheckSquare, permission: 'approvals.read' },
  {
    id: 'sales',
    label: 'Sales',
    icon: Receipt,
    items: [
      { to: 'sales/new', label: 'New sale', icon: Store, permission: 'sales.invoice.post' },
      { to: 'sales', label: 'Sales', icon: Receipt, permission: ['sales.read', 'sales.readOwn'] },
      {
        to: 'quotations',
        label: 'Quotations',
        icon: FileText,
        permission: ['sales.read', 'sales.quotation.manage'],
      },
      {
        to: 'customers',
        label: 'Customers',
        icon: Contact,
        permission: ['sales.read', 'sales.readOwn', 'sales.invoice.post'],
      },
    ],
  },
  {
    id: 'purchasing',
    label: 'Purchasing',
    icon: ShoppingCart,
    items: [
      { to: 'purchases', label: 'Purchases', icon: ShoppingCart, permission: 'purchasing.read' },
      { to: 'suppliers', label: 'Suppliers', icon: Truck, permission: 'purchasing.read' },
      { to: 'expenses', label: 'Expenses', icon: HandCoins, permission: 'purchasing.read' },
    ],
  },
  {
    id: 'stock',
    label: 'Stock',
    icon: Package,
    items: [
      { to: 'products', label: 'Products', icon: Package, permission: 'inventory.products.read' },
      {
        to: 'stock-adjustments',
        label: 'Stock adjustments',
        icon: ClipboardList,
        permission: 'reports.stock.read',
      },
    ],
  },
  {
    id: 'operations',
    label: 'Projects & production',
    icon: Factory,
    items: [
      { to: 'projects', label: 'Projects', icon: FolderKanban, permission: 'projects.read' },
      { to: 'production', label: 'Production', icon: Factory, permission: 'production.read' },
    ],
  },
  {
    id: 'accounting',
    label: 'Accounting',
    icon: BookOpen,
    items: [
      {
        to: 'accounts',
        label: 'Chart of accounts',
        icon: ListTree,
        permission: 'ledger.accounts.read',
      },
      { to: 'journals', label: 'Journals', icon: BookOpen, permission: 'ledger.journal.read' },
      {
        to: 'day-book',
        label: 'Day book',
        icon: CalendarDays,
        permission: ['ledger.journal.read', 'reports.financial.read'],
      },
      {
        to: 'bank-accounts',
        label: 'Bank accounts',
        icon: Wallet,
        permission: 'ledger.accounts.read',
      },
      {
        to: 'bank-reconciliation',
        label: 'Bank reconciliation',
        icon: Landmark,
        permission: ['ledger.bank.reconcile', 'ledger.journal.read'],
      },
      { to: 'fixed-assets', label: 'Fixed assets', icon: Armchair, permission: 'assets.read' },
    ],
  },
  {
    id: 'reports',
    label: 'Reports',
    icon: BarChart3,
    items: [
      {
        to: 'reports',
        label: 'Reports',
        icon: BarChart3,
        permission: [
          'reports.financial.read',
          'reports.stock.read',
          'sales.read',
          'purchasing.read',
        ],
      },
      {
        to: 'trial-balance',
        label: 'Trial balance',
        icon: Scale,
        permission: 'reports.financial.read',
      },
    ],
  },
  {
    id: 'company',
    label: 'Company settings',
    icon: Settings,
    items: [
      { to: 'settings', label: 'Settings', icon: Settings, permission: 'company.settings.read' },
      { to: 'members', label: 'Users', icon: Users, permission: 'company.members.read' },
      { to: 'roles', label: 'Roles', icon: ShieldCheck, permission: 'company.members.read' },
      { to: 'branches', label: 'Branches', icon: Building },
      {
        to: 'periods',
        label: 'Financial periods',
        icon: CalendarRange,
        permission: 'settings.periods.read',
      },
      { to: 'tax-codes', label: 'Tax codes', icon: Percent, permission: 'company.settings.read' },
      { to: 'audit', label: 'Audit log', icon: History, permission: 'company.audit.read' },
    ],
  },
];

/**
 * The menu this member sees: items their role allows, in areas the company uses. A heading
 * left with one item shows that item on its own; an empty heading is dropped.
 */
export function visibleNav(
  can: (p: Permission) => boolean,
  businessTypes: ReadonlySet<string>,
  nav: readonly NavEntry[] = NAV,
): NavEntry[] {
  const allowed = (item: NavItem) =>
    !pageHidden(item.to, businessTypes) &&
    (!item.permission ||
      (typeof item.permission === 'string'
        ? can(item.permission)
        : item.permission.some((p) => can(p))));
  const out: NavEntry[] = [];
  for (const entry of nav) {
    if (!isGroup(entry)) {
      if (allowed(entry)) out.push(entry);
      continue;
    }
    const items = entry.items.filter(allowed);
    if (items.length === 1) out.push(items[0]!);
    else if (items.length > 1) out.push({ ...entry, items });
  }
  return out;
}
