import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SYSTEM_ROLES, type Permission } from '@bms/domain';
import { describe, expect, it } from 'vitest';
import { pageOf, searchTopics, topicsFor, topicsForPage } from './search';
import { HELP_TOPICS } from './topics';

const roleCan = (id: string) => {
  const perms = new Set<Permission>(SYSTEM_ROLES.find((r) => r.id === id)!.permissions);
  return (p: Permission) => perms.has(p);
};
const ids = (role: string) => topicsFor(roleCan(role), role === 'company_admin').map((t) => t.id);

const appRoutes = [
  ...readFileSync(resolve(__dirname, '../../App.tsx'), 'utf8').matchAll(/path: '([^']+)'/g),
].map((m) => m[1]!);

describe('help topics', () => {
  it('have unique ids', () => {
    expect(new Set(HELP_TOPICS.map((t) => t.id)).size).toBe(HELP_TOPICS.length);
  });

  it('point at pages that exist', () => {
    for (const t of HELP_TOPICS) {
      for (const p of [...t.pages, ...(t.link ? [t.link.to] : [])]) {
        if (p === '') continue;
        expect(appRoutes, `${t.id}: ${p}`).toContain(p);
      }
    }
  });

  it('never describe how the system is secured or hosted', () => {
    const banned =
      /firebase|firestore|cloud function|api key|app check|recaptcha|token|secret|database|server|security rule|\/platform|permission string|\b[a-z]+\.[a-z]+\.[a-z]+\b/i;
    for (const t of HELP_TOPICS) {
      const text = [t.title, t.keywords, t.summary, ...(t.steps ?? []), ...(t.tips ?? [])].join(
        ' ',
      );
      expect(text, t.id).not.toMatch(banned);
    }
  });
});

describe('role filtering', () => {
  it('gives company admins every topic', () => {
    expect(ids('company_admin')).toHaveLength(HELP_TOPICS.length);
  });

  it('keeps sales officers to selling', () => {
    const mine = ids('sales_officer');
    expect(mine).toEqual(
      expect.arrayContaining(['new-sale', 'print-receipt', 'quotation', 'refund']),
    );
    expect(mine).not.toContain('new-journal');
    expect(mine).not.toContain('settings');
    expect(mine).not.toContain('invite-user');
    expect(mine).not.toContain('approve-adjustment');
  });

  it('keeps store officers to stock', () => {
    const mine = ids('store_officer');
    expect(mine).toEqual(
      expect.arrayContaining(['stock-adjustment', 'receive-goods', 'new-product']),
    );
    expect(mine).not.toContain('new-sale');
    expect(mine).not.toContain('financial-reports');
  });

  it('gives auditors reading topics but no posting ones', () => {
    const mine = ids('auditor');
    expect(mine).toEqual(expect.arrayContaining(['audit-log', 'trial-balance', 'day-book']));
    expect(mine).not.toContain('new-sale');
    expect(mine).not.toContain('pay-supplier');
  });
});

describe('search', () => {
  const all = HELP_TOPICS;
  it('finds the topic for a plain question', () => {
    expect(searchTopics('How do I refund a customer?', all)[0]?.id).toBe('refund');
    expect(searchTopics('print receipt on bluetooth printer', all)[0]?.id).toBe('print-receipt');
    expect(searchTopics('diesel for generator', all)[0]?.id).toBe('record-expense');
    expect(searchTopics('add a colleague', all)[0]?.id).toBe('invite-user');
  });

  it('returns nothing for empty or unrelated text', () => {
    expect(searchTopics('', all)).toEqual([]);
    expect(searchTopics('how is the weather', all)).toEqual([]);
  });
});

describe('page topics', () => {
  it('reads the page from a company URL', () => {
    expect(pageOf('/c/abc')).toBe('');
    expect(pageOf('/c/abc/')).toBe('');
    expect(pageOf('/c/abc/sales/new')).toBe('sales/new');
    expect(pageOf('/c/abc/sales/invoices/x1')).toBe('sales/invoices/x1');
  });

  it('puts the most specific page first', () => {
    const t = topicsForPage('sales/new', HELP_TOPICS);
    expect(t[0]?.pages).toContain('sales/new');
    expect(t.map((x) => x.id)).toContain('sales-list');
    expect(topicsForPage('settings', HELP_TOPICS).map((x) => x.id)).not.toContain('find-your-way');
  });
});
