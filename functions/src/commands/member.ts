import { Timestamp, type Transaction } from 'firebase-admin/firestore';
import { effectivePermissions, type BranchScope } from '@bms/domain';
import { defineCommand } from '../lib/command.js';
import {
  CommandError,
  conflict,
  denied,
  failedPrecondition,
  invalid,
  notFound,
} from '../lib/errors.js';
import { db } from '../lib/firebase.js';
import { newToken, safeEqualHex, sha256 } from '../lib/hash.js';
import {
  companyRefs,
  invitationRef,
  membershipMirror,
  type CompanyDoc,
  type InvitationDoc,
  type MemberDoc,
  type RoleDoc,
} from '../lib/model.js';

export const INVITATION_TTL_DAYS = 7;
const ADMIN_ROLE = 'company_admin';

async function loadRoles(
  tx: Transaction,
  companyId: string,
  roleIds: readonly string[],
): Promise<RoleDoc[]> {
  const refs = companyRefs(companyId);
  const snaps = await tx.getAll(...roleIds.map((id) => refs.role(id)));
  const missing = snaps.filter((s) => !s.exists).map((s) => s.id);
  if (missing.length)
    throw invalid('unknown_role', 'One or more roles do not exist', { roleIds: missing });
  return snaps.map((s) => s.data() as RoleDoc);
}

async function assertBranchesExist(
  tx: Transaction,
  companyId: string,
  scope: BranchScope,
): Promise<void> {
  if (scope === 'all') return;
  const refs = companyRefs(companyId);
  const snaps = await tx.getAll(...scope.map((id) => refs.branch(id)));
  const missing = snaps.filter((s) => !s.exists || s.get('status') !== 'active').map((s) => s.id);
  if (missing.length)
    throw invalid('unknown_branch', 'One or more branches do not exist or are inactive', {
      branchIds: missing,
    });
}

/** Rejects changes that would leave the company without an active Company Admin (D5). */
async function assertAdminRemains(
  tx: Transaction,
  companyId: string,
  uid: string,
  stillAdminAfterChange: boolean,
): Promise<void> {
  if (stillAdminAfterChange) return;
  const admins = await tx.get(
    companyRefs(companyId)
      .members.where('roleIds', 'array-contains', ADMIN_ROLE)
      .where('status', '==', 'active'),
  );
  const others = admins.docs.filter((d) => d.id !== uid);
  const targetIsAdmin = admins.docs.some((d) => d.id === uid);
  if (targetIsAdmin && others.length === 0) {
    throw failedPrecondition(
      'last_admin',
      'The company must keep at least one active Company Admin',
    );
  }
}

export const createInvitation = defineCommand({
  name: 'invitation.create',
  access: { kind: 'company', permission: 'company.members.invite' },
  async handler({ tx, caller, input, now }) {
    const refs = companyRefs(input.companyId);
    await loadRoles(tx, input.companyId, input.roleIds);
    await assertBranchesExist(tx, input.companyId, input.branchScope);
    const existing = await tx.get(
      refs.members.where('email', '==', input.email).where('status', '==', 'active'),
    );
    if (!existing.empty)
      throw conflict('already_member', 'This person is already an active member');
    const company = (await tx.get(refs.company)).data() as CompanyDoc;

    const token = newToken();
    const ref = db.collection('invitations').doc();
    const invitation: InvitationDoc = {
      companyId: input.companyId,
      companyName: company.tradingName,
      email: input.email,
      roleIds: input.roleIds,
      branchScope: input.branchScope,
      tokenHash: sha256(token),
      status: 'pending',
      expiresAt: Timestamp.fromMillis(now.toMillis() + INVITATION_TTL_DAYS * 86_400_000),
      invitedBy: caller.uid,
      createdAt: now,
      acceptedBy: null,
    };
    tx.set(ref, invitation);
    return {
      // The token is returned once to the inviter and only its hash is stored.
      result: {
        invitationId: ref.id,
        token,
        expiresAt: invitation.expiresAt.toDate().toISOString(),
      },
      audit: {
        target: { scope: 'company', companyId: input.companyId },
        entityType: 'invitation',
        entityId: ref.id,
        after: { email: input.email, roleIds: input.roleIds, branchScope: input.branchScope },
      },
    };
  },
});

export const revokeInvitation = defineCommand({
  name: 'invitation.revoke',
  access: { kind: 'company', permission: 'company.members.invite' },
  async handler({ tx, input }) {
    const ref = invitationRef(input.invitationId);
    const snap = await tx.get(ref);
    const inv = snap.data() as InvitationDoc | undefined;
    if (!inv || inv.companyId !== input.companyId)
      throw notFound('invitation_not_found', 'Invitation not found');
    if (inv.status !== 'pending')
      throw failedPrecondition('invitation_not_pending', 'This invitation is no longer pending');
    tx.update(ref, { status: 'revoked' });
    return {
      result: { invitationId: input.invitationId },
      audit: {
        target: { scope: 'company', companyId: input.companyId },
        entityType: 'invitation',
        entityId: input.invitationId,
        before: { status: 'pending' },
        after: { status: 'revoked' },
      },
    };
  },
});

export const acceptInvitation = defineCommand({
  name: 'invitation.accept',
  access: { kind: 'authenticated', requireVerifiedEmail: true },
  async handler({ tx, caller, input, now }) {
    const ref = invitationRef(input.invitationId);
    const inv = (await tx.get(ref)).data() as InvitationDoc | undefined;
    // Same error for unknown id and wrong token so ids cannot be probed.
    if (!inv || !safeEqualHex(inv.tokenHash, sha256(input.token))) {
      throw notFound('invitation_not_found', 'This invitation link is not valid');
    }
    if (inv.status !== 'pending')
      throw failedPrecondition(
        'invitation_not_pending',
        'This invitation has already been used or revoked',
      );
    if (inv.expiresAt.toMillis() < now.toMillis())
      throw failedPrecondition('invitation_expired', 'This invitation has expired');
    if (!caller.email || caller.email !== inv.email) {
      throw denied(
        'invitation_email_mismatch',
        'This invitation was sent to a different email address',
      );
    }

    const refs = companyRefs(inv.companyId);
    const company = (await tx.get(refs.company)).data() as CompanyDoc | undefined;
    if (!company || company.status !== 'active')
      throw failedPrecondition('company_inactive', 'This company is not active');
    const existingSnap = await tx.get(refs.member(caller.uid));
    const existing = existingSnap.data() as MemberDoc | undefined;
    if (existing?.status === 'active')
      throw conflict('already_member', 'You are already a member of this company');
    if (existing?.status === 'suspended') {
      throw failedPrecondition(
        'member_suspended',
        'Your membership is suspended. Ask an administrator to restore it',
      );
    }
    const roleSnaps = await tx.getAll(...inv.roleIds.map((id) => refs.role(id)));
    const roles = roleSnaps.filter((s) => s.exists);
    if (roles.length === 0)
      throw failedPrecondition(
        'invitation_roles_missing',
        'The roles on this invitation no longer exist',
      );

    const member: MemberDoc = {
      uid: caller.uid,
      email: caller.email,
      displayName: caller.displayName ?? caller.email,
      status: 'active',
      roleIds: roles.map((s) => s.id),
      permissions: [...effectivePermissions(roles.map((s) => s.data() as RoleDoc))].sort(),
      branchScope: inv.branchScope,
      joinedAt: now,
      invitedBy: inv.invitedBy,
      updatedAt: now,
      updatedBy: caller.uid,
    };
    tx.set(refs.member(caller.uid), member);
    tx.set(membershipMirror(caller.uid, inv.companyId), {
      companyName: company.tradingName,
      status: 'active',
      roleIds: member.roleIds,
      updatedAt: now,
    });
    tx.set(db.doc(`users/${caller.uid}`), { email: caller.email }, { merge: true });
    tx.update(ref, { status: 'accepted', acceptedBy: caller.uid });
    return {
      result: { companyId: inv.companyId },
      audit: {
        target: { scope: 'company', companyId: inv.companyId },
        entityType: 'member',
        entityId: caller.uid,
        before: existing ? { status: existing.status } : null,
        after: {
          roleIds: member.roleIds,
          branchScope: member.branchScope,
          invitationId: input.invitationId,
        },
      },
    };
  },
});

export const updateMember = defineCommand({
  name: 'member.update',
  access: { kind: 'company', permission: 'company.members.manage' },
  async handler({ tx, caller, input, now }) {
    const refs = companyRefs(input.companyId);
    const snap = await tx.get(refs.member(input.uid));
    const member = snap.data() as MemberDoc | undefined;
    if (!member || member.status === 'removed')
      throw notFound('member_not_found', 'Member not found');
    const roleIds = input.roleIds ?? member.roleIds;
    const roles = await loadRoles(tx, input.companyId, roleIds);
    if (input.branchScope) await assertBranchesExist(tx, input.companyId, input.branchScope);
    await assertAdminRemains(
      tx,
      input.companyId,
      input.uid,
      roleIds.includes(ADMIN_ROLE) && member.status === 'active',
    );

    const patch = {
      roleIds,
      permissions: [...effectivePermissions(roles)].sort(),
      branchScope: input.branchScope ?? member.branchScope,
    };
    tx.update(refs.member(input.uid), { ...patch, updatedAt: now, updatedBy: caller.uid });
    tx.set(
      membershipMirror(input.uid, input.companyId),
      { roleIds, updatedAt: now },
      { merge: true },
    );
    return {
      result: { uid: input.uid },
      audit: {
        target: { scope: 'company', companyId: input.companyId },
        entityType: 'member',
        entityId: input.uid,
        before: { roleIds: member.roleIds, branchScope: member.branchScope },
        after: { roleIds: patch.roleIds, branchScope: patch.branchScope },
      },
    };
  },
});

export const setMemberStatus = defineCommand({
  name: 'member.setStatus',
  access: { kind: 'company', permission: 'company.members.manage' },
  async handler({ tx, caller, input, now }) {
    if (input.uid === caller.uid) {
      throw new CommandError(
        'failed-precondition',
        'cannot_change_own_status',
        'Another administrator must change your status',
      );
    }
    const refs = companyRefs(input.companyId);
    const member = (await tx.get(refs.member(input.uid))).data() as MemberDoc | undefined;
    if (!member) throw notFound('member_not_found', 'Member not found');
    if (member.status === input.status)
      throw failedPrecondition('no_change', `Member is already ${input.status}`);
    if (member.status === 'removed') {
      throw failedPrecondition('member_removed', 'Removed members must be invited again');
    }
    await assertAdminRemains(tx, input.companyId, input.uid, input.status === 'active');

    tx.update(refs.member(input.uid), {
      status: input.status,
      updatedAt: now,
      updatedBy: caller.uid,
    });
    tx.set(
      membershipMirror(input.uid, input.companyId),
      { status: input.status, updatedAt: now },
      { merge: true },
    );
    return {
      result: { uid: input.uid, status: input.status },
      audit: {
        target: { scope: 'company', companyId: input.companyId },
        entityType: 'member',
        entityId: input.uid,
        before: { status: member.status },
        after: { status: input.status },
        reason: input.reason,
      },
    };
  },
});
