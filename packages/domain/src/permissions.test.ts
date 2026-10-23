import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  PERMISSIONS,
  SYSTEM_ROLES,
  branchAllowed,
  effectivePermissions,
  roleTemplate,
} from './permissions.js';

describe('permission catalogue', () => {
  it('has unique, well-formed permission names', () => {
    expect(new Set(PERMISSIONS).size).toBe(PERMISSIONS.length);
    for (const p of PERMISSIONS) expect(p).toMatch(/^[a-z]+\.[a-zA-Z]+(\.[a-zA-Z]+)*$/);
  });
});

describe('system role templates (E2)', () => {
  it('defines the six documented roles', () => {
    expect(SYSTEM_ROLES.map((r) => r.name)).toEqual([
      'Company Admin',
      'Manager',
      'Sales Officer',
      'Store Officer',
      'Accountant',
      'Auditor',
    ]);
    const doc = readFileSync(new URL('../../../docs/bms/ROLES.md', import.meta.url), 'utf8');
    for (const role of SYSTEM_ROLES) expect(doc).toContain(role.name);
  });

  it('gives the Auditor read permissions only (E6)', () => {
    const auditor = roleTemplate('auditor');
    expect(auditor.permissions.length).toBeGreaterThan(0);
    for (const p of auditor.permissions) expect(p.endsWith('.read')).toBe(true);
  });

  it('keeps administration with the Company Admin', () => {
    const adminOnly = [
      'company.members.manage',
      'company.roles.manage',
      'company.members.invite',
      'settings.periods.reopen.approve',
    ];
    for (const role of SYSTEM_ROLES) {
      for (const p of adminOnly) {
        expect(role.permissions.includes(p as never)).toBe(role.id === 'company_admin');
      }
    }
  });

  it('matches the matrix for sensitive actions', () => {
    const has = (id: Parameters<typeof roleTemplate>[0], p: string) =>
      roleTemplate(id).permissions.includes(p as never);
    expect(has('accountant', 'settings.periods.close')).toBe(true);
    expect(has('accountant', 'settings.periods.reopen.request')).toBe(true);
    expect(has('accountant', 'settings.periods.reopen.approve')).toBe(false);
    expect(has('sales_officer', 'sales.refund.request')).toBe(true);
    expect(has('sales_officer', 'sales.refund.approve')).toBe(false);
    expect(has('store_officer', 'inventory.adjustment.approve')).toBe(false);
    expect(has('manager', 'inventory.adjustment.approve')).toBe(true);
    expect(has('manager', 'sales.creditLimit.override')).toBe(true);
    expect(has('sales_officer', 'sales.creditLimit.override')).toBe(false);
    expect(has('sales_officer', 'sales.customers.manage')).toBe(false);
    expect(has('accountant', 'sales.customers.manage')).toBe(true);
  });
});

describe('effective permissions and branch scope', () => {
  it('unions roles and drops unknown strings', () => {
    const set = effectivePermissions([
      { permissions: ['sales.read', 'bogus.perm'] },
      { permissions: ['company.settings.read'] },
    ]);
    expect([...set].sort()).toEqual(['company.settings.read', 'sales.read']);
  });
  it('checks branch scope', () => {
    expect(branchAllowed('all', 'b1')).toBe(true);
    expect(branchAllowed(['b1'], 'b1')).toBe(true);
    expect(branchAllowed(['b1'], 'b2')).toBe(false);
  });
});
