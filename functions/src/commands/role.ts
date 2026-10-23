import { effectivePermissions } from '@bms/domain';
import type { Transaction } from 'firebase-admin/firestore';
import { defineCommand } from '../lib/command.js';
import { conflict, failedPrecondition, notFound } from '../lib/errors.js';
import { companyRefs, type MemberDoc, type RoleDoc } from '../lib/model.js';

export const createRole = defineCommand({
  name: 'role.create',
  access: { kind: 'company', permission: 'company.roles.manage' },
  async handler({ tx, caller, input, now }) {
    const refs = companyRefs(input.companyId);
    const ref = refs.roles.doc();
    const role: RoleDoc = {
      name: input.name,
      description: input.description ?? '',
      system: false,
      templateId: null,
      permissions: [...new Set(input.permissions)].sort(),
      updatedAt: now,
      updatedBy: caller.uid,
    };
    tx.set(ref, role);
    return {
      result: { roleId: ref.id },
      audit: {
        target: { scope: 'company', companyId: input.companyId },
        entityType: 'role',
        entityId: ref.id,
        after: { name: role.name, permissions: role.permissions },
      },
    };
  },
});

/**
 * Recomputes the denormalised `permissions` on every member holding one of the changed roles.
 * Must be called after all other reads in the transaction.
 */
export async function membersWithRole(tx: Transaction, companyId: string, roleId: string) {
  const snap = await tx.get(
    companyRefs(companyId).members.where('roleIds', 'array-contains', roleId),
  );
  return snap.docs.map((d) => ({ ref: d.ref, member: d.data() as MemberDoc }));
}

export const updateRole = defineCommand({
  name: 'role.update',
  access: { kind: 'company', permission: 'company.roles.manage' },
  async handler({ tx, caller, input, now }) {
    const refs = companyRefs(input.companyId);
    const snap = await tx.get(refs.role(input.roleId));
    if (!snap.exists) throw notFound('role_not_found', 'Role not found');
    const role = snap.data() as RoleDoc;
    if (role.system) {
      throw failedPrecondition(
        'system_role_immutable',
        'System roles cannot be changed. Create a custom role instead',
      );
    }
    const patch: Partial<RoleDoc> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.description !== undefined) patch.description = input.description;
    if (input.permissions !== undefined) patch.permissions = [...new Set(input.permissions)].sort();

    if (patch.permissions) {
      const holders = await membersWithRole(tx, input.companyId, input.roleId);
      const otherRoleIds = [...new Set(holders.flatMap((h) => h.member.roleIds))].filter(
        (id) => id !== input.roleId,
      );
      const otherRoles = new Map<string, RoleDoc>();
      if (otherRoleIds.length) {
        const snaps = await tx.getAll(...otherRoleIds.map((id) => refs.role(id)));
        for (const s of snaps) if (s.exists) otherRoles.set(s.id, s.data() as RoleDoc);
      }
      const updatedRole = { ...role, ...patch };
      for (const { ref, member } of holders) {
        const roles = member.roleIds
          .map((id) => (id === input.roleId ? updatedRole : otherRoles.get(id)))
          .filter(Boolean) as RoleDoc[];
        tx.update(ref, {
          permissions: [...effectivePermissions(roles)].sort(),
          updatedAt: now,
          updatedBy: caller.uid,
        });
      }
    }
    tx.update(refs.role(input.roleId), { ...patch, updatedAt: now, updatedBy: caller.uid });
    return {
      result: { roleId: input.roleId },
      audit: {
        target: { scope: 'company', companyId: input.companyId },
        entityType: 'role',
        entityId: input.roleId,
        before: { name: role.name, description: role.description, permissions: role.permissions },
        after: patch,
      },
    };
  },
});

export const deleteRole = defineCommand({
  name: 'role.delete',
  access: { kind: 'company', permission: 'company.roles.manage' },
  async handler({ tx, input }) {
    const refs = companyRefs(input.companyId);
    const snap = await tx.get(refs.role(input.roleId));
    if (!snap.exists) throw notFound('role_not_found', 'Role not found');
    const role = snap.data() as RoleDoc;
    if (role.system)
      throw failedPrecondition('system_role_immutable', 'System roles cannot be deleted');
    const holders = await membersWithRole(tx, input.companyId, input.roleId);
    if (holders.some((h) => h.member.status !== 'removed')) {
      throw conflict('role_in_use', 'Remove this role from all members before deleting it');
    }
    tx.delete(refs.role(input.roleId));
    return {
      result: { roleId: input.roleId },
      audit: {
        target: { scope: 'company', companyId: input.companyId },
        entityType: 'role',
        entityId: input.roleId,
        before: { name: role.name, permissions: role.permissions },
      },
    };
  },
});
