import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  BookOpen,
  Building,
  CheckSquare,
  Contact,
  ClipboardList,
  ListTree,
  Scale,
  CalendarRange,
  ChevronsUpDown,
  History,
  Landmark,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Percent,
  Receipt,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Store,
  Truck,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink } from 'react-router';
import type { Permission } from '@bms/domain';
import { useAuth } from '../lib/auth';
import { useCompany } from '../lib/company';
import { runCommand } from '../lib/api';
import { cn } from '../lib/utils';

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  /** Shown when the member has any of these. */
  permission?: Permission | readonly Permission[];
}

const NAV: NavItem[] = [
  { to: '', label: 'Overview', icon: LayoutDashboard },
  {
    to: 'accounts',
    label: 'Chart of accounts',
    icon: ListTree,
    permission: 'ledger.accounts.read',
  },
  { to: 'journals', label: 'Journals', icon: BookOpen, permission: 'ledger.journal.read' },
  {
    to: 'trial-balance',
    label: 'Trial balance',
    icon: Scale,
    permission: 'reports.financial.read',
  },
  {
    to: 'bank-reconciliation',
    label: 'Bank reconciliation',
    icon: Landmark,
    permission: ['ledger.bank.reconcile', 'ledger.journal.read'],
  },
  { to: 'products', label: 'Products', icon: Package, permission: 'inventory.products.read' },
  {
    to: 'stock-adjustments',
    label: 'Stock adjustments',
    icon: ClipboardList,
    permission: 'reports.stock.read',
  },
  {
    to: 'sales/new',
    label: 'New sale',
    icon: Store,
    permission: 'sales.invoice.post',
  },
  {
    to: 'sales',
    label: 'Sales',
    icon: Receipt,
    permission: ['sales.read', 'sales.readOwn'],
  },
  {
    to: 'customers',
    label: 'Customers',
    icon: Contact,
    permission: ['sales.read', 'sales.readOwn', 'sales.invoice.post'],
  },
  { to: 'suppliers', label: 'Suppliers', icon: Truck, permission: 'purchasing.read' },
  { to: 'purchases', label: 'Purchases', icon: ShoppingCart, permission: 'purchasing.read' },
  { to: 'approvals', label: 'Approvals', icon: CheckSquare, permission: 'approvals.read' },
  { to: 'members', label: 'Users', icon: Users, permission: 'company.members.read' },
  { to: 'roles', label: 'Roles', icon: ShieldCheck, permission: 'company.members.read' },
  { to: 'branches', label: 'Branches', icon: Building },
  {
    to: 'periods',
    label: 'Financial periods',
    icon: CalendarRange,
    permission: 'settings.periods.read',
  },
  { to: 'audit', label: 'Audit log', icon: History, permission: 'company.audit.read' },
  { to: 'tax-codes', label: 'Tax codes', icon: Percent, permission: 'company.settings.read' },
  { to: 'settings', label: 'Settings', icon: Settings, permission: 'company.settings.read' },
];

function Nav({ onNavigate }: { onNavigate?: () => void }) {
  const { companyId, can } = useCompany();
  return (
    <nav aria-label="Company" className="space-y-1">
      {NAV.filter(
        (item) =>
          !item.permission ||
          (typeof item.permission === 'string'
            ? can(item.permission)
            : item.permission.some((p) => can(p))),
      ).map((item) => (
        <NavLink
          key={item.label}
          to={`/c/${companyId}/${item.to}`}
          end={item.to === '' || item.to === 'sales'}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium',
              isActive ? 'bg-brand-50 text-brand-800' : 'text-slate-700 hover:bg-slate-100',
            )
          }
        >
          <item.icon className="size-4" aria-hidden />
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

function CompanyHeader() {
  const { company } = useCompany();
  return (
    <Link
      to="/companies"
      className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-100"
      title="Switch company"
    >
      <img src="/favicon.svg" alt="" className="size-7" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{company?.tradingName ?? '…'}</span>
        <span className="block text-xs text-slate-500">Switch company</span>
      </span>
      <ChevronsUpDown className="size-4 text-slate-400" aria-hidden />
    </Link>
  );
}

function UserMenu() {
  const { user, signOut } = useAuth();
  const signOutEverywhere = async () => {
    await runCommand('session.revokeAll', {});
    await signOut();
  };
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-slate-100">
        <span className="flex size-7 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold uppercase">
          {(user?.displayName ?? user?.email ?? '?').slice(0, 1)}
        </span>
        <span className="min-w-0 flex-1 truncate">{user?.email}</span>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side="top"
          align="start"
          className="z-50 min-w-52 rounded-md border border-slate-200 bg-white p-1 shadow-lg"
        >
          <DropdownMenu.Item
            onSelect={() => void signOut()}
            className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-slate-100"
          >
            <LogOut className="size-4" aria-hidden /> Sign out
          </DropdownMenu.Item>
          <DropdownMenu.Item
            onSelect={() => void signOutEverywhere()}
            className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-slate-100"
          >
            <LogOut className="size-4" aria-hidden /> Sign out on all devices
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  return (
    <div className="min-h-dvh lg:flex">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white p-3 lg:flex">
        <CompanyHeader />
        <div className="mt-4 flex-1">
          <Nav />
        </div>
        <UserMenu />
      </aside>

      {/* Mobile top bar + drawer */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-slate-200 bg-white px-3 lg:hidden">
        <button
          type="button"
          className="rounded p-2 hover:bg-slate-100"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          aria-expanded={open}
        >
          <Menu className="size-5" />
        </button>
        <div className="min-w-0 flex-1">
          <CompanyHeader />
        </div>
      </header>
      {open && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
        >
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white p-3 shadow-xl">
            <div className="flex justify-end">
              <button
                type="button"
                className="rounded p-2 hover:bg-slate-100"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="flex-1">
              <Nav onNavigate={() => setOpen(false)} />
            </div>
            <UserMenu />
          </div>
        </div>
      )}

      <main id="main" className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
