import { SYSTEM_ROLES, type Permission } from '@bms/domain';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HelpButton } from './HelpPanel';

let roleId = 'sales_officer';
vi.mock('../lib/company', () => ({
  useCompany: () => {
    const perms = new Set<Permission>(SYSTEM_ROLES.find((r) => r.id === roleId)!.permissions);
    return {
      companyId: 'co1',
      member: { roleIds: [roleId] },
      can: (p: Permission) => perms.has(p),
    };
  },
}));

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <HelpButton />
    </MemoryRouter>,
  );
}

describe('HelpPanel', () => {
  afterEach(cleanup);

  it('shows help for the current page and opens a topic', async () => {
    roleId = 'sales_officer';
    renderAt('/c/co1/sales/new');
    await userEvent.click(screen.getByRole('button', { name: 'Help' }));
    expect(screen.getByRole('dialog', { name: 'Help' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Make a sale/ }));
    expect(screen.getByRole('heading', { name: 'Make a sale' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /New sale/ })).toHaveAttribute(
      'href',
      '/c/co1/sales/new',
    );
  });

  it('tells a member when an answer is outside their role, without showing it', async () => {
    roleId = 'sales_officer';
    renderAt('/c/co1');
    await userEvent.click(screen.getByRole('button', { name: 'Help' }));
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search help' }), 'depreciation');
    expect(screen.getByText(/isn’t part of your role/)).toBeInTheDocument();
    expect(screen.queryByText('Run monthly depreciation')).not.toBeInTheDocument();
  });

  it('lets company admins find every topic', async () => {
    roleId = 'company_admin';
    renderAt('/c/co1');
    await userEvent.click(screen.getByRole('button', { name: 'Help' }));
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search help' }), 'manual journal');
    expect(screen.getByRole('button', { name: /Post a manual journal/ })).toBeInTheDocument();
  });
});
