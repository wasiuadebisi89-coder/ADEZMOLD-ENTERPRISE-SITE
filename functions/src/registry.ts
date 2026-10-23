import type { CommandName } from '@bms/schemas';
import type { AnyCommand } from './lib/command.js';
import { createBranch, updateBranch } from './commands/branch.js';
import { createCompany, updateCompanySettings } from './commands/company.js';
import {
  createCategory,
  createLocation,
  createProduct,
  createStockAdjustment,
  decideStockAdjustment,
  updateCategory,
  updateLocation,
  updateProduct,
} from './commands/inventory.js';
import {
  applyChartTemplate,
  createAccount,
  postJournal,
  postOpeningBalance,
  reverseJournal,
  updateAccount,
} from './commands/ledger.js';
import {
  acceptInvitation,
  createInvitation,
  revokeInvitation,
  setMemberStatus,
  updateMember,
} from './commands/member.js';
import {
  createFiscalYear,
  decideApproval,
  requestApproval,
  setPeriodStatus,
} from './commands/period.js';
import {
  allocateSupplierPayment,
  createSupplier,
  postGoodsReceipt,
  postPurchaseInvoice,
  postSupplierOpeningBalance,
  postSupplierPayment,
  postSupplierReturn,
  updateSupplier,
} from './commands/purchasing.js';
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
  'chart.applyTemplate': applyChartTemplate,
  'account.create': createAccount,
  'account.update': updateAccount,
  'journal.post': postJournal,
  'journal.reverse': reverseJournal,
  'openingBalance.post': postOpeningBalance,
  'category.create': createCategory,
  'category.update': updateCategory,
  'product.create': createProduct,
  'product.update': updateProduct,
  'location.create': createLocation,
  'location.update': updateLocation,
  'stockAdjustment.create': createStockAdjustment,
  'stockAdjustment.decide': decideStockAdjustment,
  'supplier.create': createSupplier,
  'supplier.update': updateSupplier,
  'goodsReceipt.post': postGoodsReceipt,
  'purchaseInvoice.post': postPurchaseInvoice,
  'supplierOpeningBalance.post': postSupplierOpeningBalance,
  'supplierPayment.post': postSupplierPayment,
  'supplierPayment.allocate': allocateSupplierPayment,
  'supplierReturn.post': postSupplierReturn,
  'platform.supportRead': platformSupportRead,
  'session.revokeAll': revokeAllSessions,
};
