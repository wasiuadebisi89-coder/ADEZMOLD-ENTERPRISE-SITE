import { SYSTEM_ROLES, type Permission } from '@bms/domain';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NAV, visibleNav } from './nav';

type Entry = ReturnType<typeof visibleNav>[number];
const roleCan = (id: string) => {
  const perms = new Set<Permission>(SYSTEM_ROLES.find((r) => r.id === id)!.permissions);
  return (p: Permission) => perms.has(p);
};
const labels = (entries: Entry[]): string[] =>
  entries.flatMap((e) => ('items' in e ? e.items.map((i) => i.label) : [e.label]));
const headings = (entries: Entry[]) => entries.filter((e) => 'items' in e).map((e) => e.label);
const trading = new Set(['trading']);

describe('company menu', () => {
  it('links only to pages that exist', () => {
    const routes = [
      ...readFileSync(resolve(__dirname, '../App.tsx'), 'utf8').matchAll(/path: '([^']+)'/g),
    ].map((m) => m[1]!);
    for (const item of labels(NAV as Entry[])) expect(item).toBeTruthy();
    for (const e of NAV)
      for (const i of 'items' in e ? e.items : [e])
        if (i.to !== '') expect(routes, i.label).toContain(i.to);
  });

  it('shows an admin of a trading company everything except Projects and Production', () => {
    const shown = labels(visibleNav(roleCan('company_admin'), trading));
    expect(shown).toContain('New sale');
    expect(shown).toContain('Settings');
    expect(shown).not.toContain('Projects');
    expect(shown).not.toContain('Production');
  });

  it('adds Production for a company that manufactures', () => {
    const entries = visibleNav(roleCan('company_admin'), new Set(['trading', 'production']));
    expect(labels(entries)).toContain('Production');
    expect(labels(entries)).not.toContain('Projects');
    // One item left under a heading shows on its own, without the heading.
    expect(headings(entries)).not.toContain('Projects & production');
  });

  it('gives a sales officer only selling screens', () => {
    const entries = visibleNav(roleCan('sales_officer'), trading);
    const shown = labels(entries);
    expect(shown).toEqual(expect.arrayContaining(['New sale', 'Customers']));
    for (const hidden of ['Journals', 'Chart of accounts', 'Users', 'Roles', 'Suppliers'])
      expect(shown).not.toContain(hidden);
    expect(headings(entries)).not.toContain('Accounting');
  });

  it('gives a store officer the stock screens but not the books', () => {
    const shown = labels(visibleNav(roleCan('store_officer'), trading));
    expect(shown).toEqual(expect.arrayContaining(['Products', 'Stock adjustments']));
    for (const hidden of ['Journals', 'Trial balance', 'New sale', 'Users'])
      expect(shown).not.toContain(hidden);
  });
});
