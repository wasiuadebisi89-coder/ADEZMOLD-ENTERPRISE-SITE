import type { CommandName } from '@bms/schemas';
import type { AnyCommand } from './lib/command.js';
import { createBranch, updateBranch } from './commands/branch.js';
import { createCompany, updateCompanySettings } from './commands/company.js';
import { acceptInvitation, createInvitation, revokeInvitation, setMemberStatus, updateMember } from './commands/member.js';
import { createFiscalYear, decideApproval, requestApproval, setPeriodStatus } from './commands/period.js';
import { platformSupportRead, revokeAllSessions } from './commands/platform.js';
import { createRole, deleteRole, updateRole } from './commands/role.js';

/** Every command the API accepts. Keyed by name so a missing command fails type-checking. */
export const COMMANDS: Record<CommandName, AnyCommand> = {
  'company.create': createCompany,
  'company.updateSettings': updateCompanySettings,
  'branch.create': createBranch,
  'branch.update': updateBranch,
  'role.create': createRole,
  'role.update': updateRole,
  'role.delete': deleteRole,
  'invitation.create': createInvitation,
  'invitation.revoke': revokeInvitation,
  'invitation.accept': acceptInvitation,
  'member.update': updateMember,
  'member.setStatus': setMemberStatus,
  'period.setStatus': setPeriodStatus,
  'fiscalYear.create': createFiscalYear,
  'approval.request': requestApproval,
  'approval.decide': decideApproval,
  'platform.supportRead': platformSupportRead,
  'session.revokeAll': revokeAllSessions,
};
