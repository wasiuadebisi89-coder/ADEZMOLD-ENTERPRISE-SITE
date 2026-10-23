import { defineCommand } from '../lib/command.js';
import { conflict, failedPrecondition, notFound } from '../lib/errors.js';
import { companyRefs, type BranchDoc } from '../lib/model.js';

export const createBranch = defineCommand({
  name: 'branch.create',
  access: { kind: 'company', permission: 'company.branches.manage' },
  async handler({ tx, caller, input, now }) {
    const ref = companyRefs(input.companyId).branch(input.code);
    if ((await tx.get(ref)).exists) {
      throw conflict('branch_code_taken', `Branch code ${input.code} is already used`);
    }
    const branch: BranchDoc = {
      code: input.code,
      name: input.name,
      address: input.address ?? '',
      status: 'active',
      isHeadOffice: false,
      updatedAt: now,
      updatedBy: caller.uid,
    };
    tx.set(ref, branch);
    return {
      result: { branchId: input.code },
      audit: {
        target: { scope: 'company', companyId: input.companyId },
        entityType: 'branch',
        entityId: input.code,
        after: { code: branch.code, name: branch.name, address: branch.address },
      },
    };
  },
});

export const updateBranch = defineCommand({
  name: 'branch.update',
  access: { kind: 'company', permission: 'company.branches.manage' },
  async handler({ tx, caller, input, now }) {
    const ref = companyRefs(input.companyId).branch(input.branchId);
    const snap = await tx.get(ref);
    if (!snap.exists) throw notFound('branch_not_found', 'Branch not found');
    const branch = snap.data() as BranchDoc;
    if (input.status === 'inactive' && branch.isHeadOffice) {
      throw failedPrecondition('head_office_required', 'The head office cannot be deactivated');
    }
    const patch: Partial<BranchDoc> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.address !== undefined) patch.address = input.address;
    if (input.status !== undefined) patch.status = input.status;
    tx.update(ref, { ...patch, updatedAt: now, updatedBy: caller.uid });
    return {
      result: { branchId: input.branchId },
      audit: {
        target: { scope: 'company', companyId: input.companyId },
        entityType: 'branch',
        entityId: input.branchId,
        before: { name: branch.name, address: branch.address, status: branch.status },
        after: patch,
      },
    };
  },
});
