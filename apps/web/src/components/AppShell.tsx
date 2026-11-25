import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ChevronDown, ChevronsUpDown, LogOut, Menu, X } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router';
import { useAuth } from '../lib/auth';
import { useCompany } from '../lib/company';
import { runCommand } from '../lib/api';
import { pageOf } from '../lib/help/search';
import { businessTypesOf } from '../lib/modules';
import { isGroup, visibleNav, type NavEntry, type NavItem } from '../lib/nav';
import { cn } from '../lib/utils';
import { HelpButton } from './HelpPanel';
import { InstallAppButton } from './InstallAppButton';

/** Which group holds the page now open, so it starts expanded. */
function activeGroupId(entries: readonly NavEntry[], page: string): string | undefined {
  const matches = (to: string) =>
    to === '' ? page === '' : page === to || page.startsWith(`${to}/`);
  return entries.filter(isGroup).find((g) => g.items.some((i) => matches(i.to)))?.id;
}

const OPEN_KEY = 'bms.nav.open';

function readOpen(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(OPEN_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function NavLinkItem({
  item,
  companyId,
  nested,
  onNavigate,
}: {
  item: NavItem;
  companyId: string;
  nested?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <NavLink
      to={`/c/${companyId}/${item.to}`}
      end={item.to === '' || item.to === 'sales'}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium',
          nested && 'py-1.5 pl-9',
          isActive ? 'bg-brand-50 text-brand-800' : 'text-slate-700 hover:bg-slate-100',
        )
      }
    >
      {!nested && <item.icon className="size-4" aria-hidden />}
      {item.label}
    </NavLink>
  );
}

function Nav({ onNavigate }: { onNavigate?: () => void }) {
  const { companyId, can, company } = useCompany();
  const { pathname } = useLocation();
  const types = useMemo(() => businessTypesOf(company), [company]);
  const entries = useMemo(() => visibleNav(can, types), [can, types]);
  const page = pageOf(pathname);
  const current = activeGroupId(entries, page);
  // Headings the member opened (remembered on this device). The heading of the page now open
  // is also open, unless the member closed it.
  const [open, setOpen] = useState<string[]>(readOpen);
  const [closedCurrent, setClosedCurrent] = useState<string | null>(null);
  const isOpen = (id: string) => open.includes(id) || (id === current && closedCurrent !== current);
  const toggle = (id: string) => {
    const next = isOpen(id) ? open.filter((x) => x !== id) : [...open, id];
    if (id === current) setClosedCurrent(isOpen(id) ? id : null);
    setOpen(next);
    try {
      localStorage.setItem(OPEN_KEY, JSON.stringify(next));
    } catch {
      /* the menu still works without remembering */
    }
  };

  return (
    <nav aria-label="Company" className="space-y-1">
      {entries.map((entry) => {
        if (!isGroup(entry))
          return (
            <NavLinkItem
              key={entry.to}
              item={entry}
              companyId={companyId}
              onNavigate={onNavigate}
            />
          );
        const expanded = isOpen(entry.id);
        const panelId = `nav-${entry.id}`;
        return (
          <div key={entry.id}>
            <button
              type="button"
              onClick={() => toggle(entry.id)}
              aria-expanded={expanded}
              aria-controls={panelId}
              className={cn(
                'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-medium hover:bg-slate-100',
                entry.id === current && !expanded ? 'text-brand-800' : 'text-slate-700',
              )}
            >
              <entry.icon className="size-4" aria-hidden />
              <span className="flex-1">{entry.label}</span>
              <ChevronDown
                className={cn(
                  'size-4 text-slate-400 transition-transform',
                  expanded && 'rotate-180',
                )}
                aria-hidden
              />
            </button>
            {expanded && (
              <div id={panelId} className="mt-0.5 space-y-0.5">
                {entry.items.map((item) => (
                  <NavLinkItem
                    key={item.to}
                    item={item}
                    companyId={companyId}
                    nested
                    onNavigate={onNavigate}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
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
        data-print-hide
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      {/* Desktop sidebar */}
      <aside
        data-print-hide
        className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-slate-200 bg-white p-3 lg:flex"
      >
        <CompanyHeader />
        {/* The menu scrolls on its own so Help and the user menu stay in view. */}
        <div className="-mx-1 mt-4 min-h-0 flex-1 overflow-y-auto px-1">
          <Nav />
        </div>
        <HelpButton className="mb-1 w-full justify-start" />
        <InstallAppButton size="sm" variant="ghost" className="mb-1 w-full justify-start" />
        <UserMenu />
      </aside>

      {/* Mobile top bar + drawer */}
      <header
        data-print-hide
        className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-slate-200 bg-white px-3 lg:hidden"
      >
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
        <HelpButton iconOnly />
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
            {/* The menu outgrows a phone screen, so it scrolls between the header and user menu. */}
            <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
              <Nav onNavigate={() => setOpen(false)} />
            </div>
            <InstallAppButton size="sm" variant="ghost" className="mb-1 w-full justify-start" />
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
