/**
 * Chart of accounts templates. OPEN_DECISIONS #14: this trading template is a draft for the
 * owner's review; companies can rename, add and deactivate accounts after it is applied.
 * Headings (`isPostable: false`) group accounts for reports and take no postings.
 */
import type { AccountSubtype, AccountType } from './ledger.js';

export interface TemplateAccount {
  code: string;
  name: string;
  type: AccountType;
  subtype: AccountSubtype;
  isPostable: boolean;
  /** Code of the heading this account sits under. */
  parentCode: string | null;
}

export interface ChartTemplate {
  id: string;
  name: string;
  version: number;
  accounts: readonly TemplateAccount[];
}

const h = (code: string, name: string, type: AccountType, parentCode: string | null = null) =>
  ({ code, name, type, subtype: 'general', isPostable: false, parentCode }) as const;
const a = (
  code: string,
  name: string,
  type: AccountType,
  parentCode: string,
  subtype: AccountSubtype = 'general',
) => ({ code, name, type, subtype, isPostable: true, parentCode }) as const;

export const TRADING_TEMPLATE: ChartTemplate = {
  id: 'trading',
  name: 'Trading company',
  version: 1,
  accounts: [
    h('1000', 'Assets', 'asset'),
    h('1100', 'Cash and bank', 'asset', '1000'),
    a('1110', 'Cash on hand', 'asset', '1100', 'cash'),
    a('1120', 'Bank current account', 'asset', '1100', 'bank'),
    a('1200', 'Trade receivables', 'asset', '1000', 'receivable'),
    a('1250', 'Other receivables and prepayments', 'asset', '1000'),
    a('1300', 'Inventory', 'asset', '1000', 'inventory'),
    a('1350', 'Advances to suppliers', 'asset', '1000', 'supplierAdvance'),
    a('1400', 'Input tax recoverable', 'asset', '1000', 'inputTax'),
    h('1500', 'Property, plant and equipment', 'asset', '1000'),
    a('1510', 'Furniture and fittings', 'asset', '1500', 'fixedAsset'),
    a('1520', 'Motor vehicles', 'asset', '1500', 'fixedAsset'),
    a('1530', 'Office equipment', 'asset', '1500', 'fixedAsset'),
    a('1590', 'Accumulated depreciation', 'asset', '1500', 'accumDepreciation'),

    h('2000', 'Liabilities', 'liability'),
    a('2100', 'Trade payables', 'liability', '2000', 'payable'),
    a('2150', 'Goods received not invoiced', 'liability', '2000', 'grni'),
    a('2200', 'Output tax payable', 'liability', '2000', 'outputTax'),
    a('2250', 'Customer advances and credits', 'liability', '2000', 'customerAdvance'),
    a('2300', 'Accruals and other payables', 'liability', '2000'),
    a('2400', 'Loans and borrowings', 'liability', '2000'),

    h('3000', 'Equity', 'equity'),
    a('3100', 'Share capital', 'equity', '3000'),
    a('3200', 'Retained earnings', 'equity', '3000', 'retainedEarnings'),
    a('3300', 'Opening balance equity', 'equity', '3000', 'openingBalanceEquity'),

    h('4000', 'Income', 'income'),
    a('4100', 'Sales revenue', 'income', '4000', 'revenue'),
    a('4200', 'Service revenue', 'income', '4000', 'serviceRevenue'),
    a('4900', 'Other income', 'income', '4000'),

    h('5000', 'Cost of sales', 'expense'),
    a('5100', 'Cost of goods sold', 'expense', '5000', 'cogs'),
    a('5200', 'Inventory adjustments', 'expense', '5000', 'inventoryAdjustment'),
    a('5300', 'Purchase price variance', 'expense', '5000', 'purchasePriceVariance'),
    a('5400', 'Direct service costs', 'expense', '5000', 'directServiceCost'),

    h('6000', 'Operating expenses', 'expense'),
    a('6100', 'Salaries and wages', 'expense', '6000'),
    a('6200', 'Rent', 'expense', '6000'),
    a('6300', 'Utilities', 'expense', '6000'),
    a('6400', 'Transport and delivery', 'expense', '6000'),
    a('6500', 'Repairs and maintenance', 'expense', '6000'),
    a('6600', 'Depreciation', 'expense', '6000', 'depreciation'),
    a('6700', 'Bank charges', 'expense', '6000'),
    a('6900', 'Other expenses', 'expense', '6000'),
  ],
};

export const CHART_TEMPLATES: Readonly<Record<string, ChartTemplate>> = {
  [TRADING_TEMPLATE.id]: TRADING_TEMPLATE,
};

/** Template accounts that posting services look up by role, keyed by subtype. */
export const SYSTEM_ACCOUNT_SUBTYPES: readonly AccountSubtype[] = [
  'retainedEarnings',
  'openingBalanceEquity',
];
