import type { Permission } from '@bms/domain';

/**
 * In-app help, written from the BMS User Guide. Each topic is shown only to members whose
 * permissions cover it (company admins see every topic). Topics describe how to use screens;
 * they must never describe how the system is secured or hosted (a unit test checks this).
 *
 * Text may use **bold** for button and field names.
 */
export interface HelpTopic {
  id: string;
  title: string;
  /** Pages (paths under /c/:companyId/) this topic belongs to; '' is the Overview. */
  pages: readonly string[];
  /** Shown to members holding any of these. Omitted: every member. */
  anyOf?: readonly Permission[];
  /** Extra words people might search with. */
  keywords?: string;
  summary: string;
  steps?: readonly string[];
  tips?: readonly string[];
  /** Page to open from the topic, relative to the company. */
  link?: { to: string; label: string };
}

const LEDGER_READ: Permission[] = ['ledger.journal.read', 'reports.financial.read'];

export const HELP_TOPICS: readonly HelpTopic[] = [
  // ---------- Getting around ----------
  {
    id: 'find-your-way',
    title: 'Find your way around BMS',
    pages: [''],
    keywords: 'menu navigation switch company sign out phone layout where',
    summary:
      'The left-hand menu lists every area your role can use. On a phone, open it with the menu button at the top left.',
    steps: [
      'Click the company name at the top of the menu to switch to another company.',
      'Each area opens on a list. Click a row to open its detail page.',
      'Action buttons such as **New…**, **Print**, **Receipt** and **WhatsApp** sit at the top right of a page.',
      'Click your email at the bottom of the menu for **Sign out**.',
    ],
    tips: [
      'If you can’t see a menu item or button, your role doesn’t include it. Ask your Company Admin.',
    ],
  },
  {
    id: 'key-rules',
    title: 'Rules worth knowing from day one',
    pages: [''],
    keywords: 'naira ngn vat backdate weighted average overdraft posted final approval two people',
    summary: 'A few rules apply everywhere in BMS.',
    steps: [
      'All amounts are in Naira (NGN).',
      'You can date a transaction up to 3 days in the past (the company can change this). Older dates need a backdating request.',
      'Posted documents never change. Mistakes are corrected with a reversal, a return or a credit note.',
      'BMS refuses any payment that would take a cash or bank account below zero. Record the money coming in first.',
      'Sensitive steps (reopening a month, backdating, credit limit overrides, returns and refunds raised by sales staff) need a second person to approve. Nobody approves their own request.',
    ],
  },
  {
    id: 'backdating',
    title: 'Post a transaction with an older date',
    pages: [''],
    keywords: 'backdate backdating past date old date window request',
    summary:
      'If you choose a date older than the backdating window, BMS shows a notice instead of posting.',
    steps: [
      'Enter a reason in the notice and click **Send request**.',
      'Ask a colleague who can approve to open **Approvals** and accept it.',
      'Once approved, post that one transaction with the older date.',
    ],
  },
  {
    id: 'approvals',
    title: 'Approve or reject a request',
    pages: ['approvals'],
    anyOf: ['approvals.read'],
    keywords: 'approve reject pending waiting second person request',
    summary:
      'Requests that need a second person wait under Approvals: reopening months, backdating, credit limit overrides, and returns and refunds raised by sales staff.',
    steps: [
      'Open **Approvals** and click the request.',
      'Read the reason, then click **Approve** or **Reject** (with a note).',
    ],
    tips: ['Stock adjustments raised by store staff are approved from the adjustment itself.'],
    link: { to: 'approvals', label: 'Open Approvals' },
  },
  {
    id: 'waiting-approver',
    title: 'It says “Waiting for another approver”',
    pages: [''],
    keywords: 'waiting approver pending stuck request not approved',
    summary:
      'A second user must approve your request. Ask a manager or admin to open Approvals. You cannot approve your own request.',
  },
  {
    id: 'install-app',
    title: 'Install BMS on your phone or computer',
    pages: [''],
    keywords: 'install app download phone android iphone home screen',
    summary: 'BMS can be added to your phone or computer like an app.',
    steps: [
      'Click **Install app** in the menu.',
      'Follow the steps shown for your device (Android, iPhone or computer).',
    ],
  },
  {
    id: 'forgot-password',
    title: 'I forgot my password',
    pages: [''],
    keywords: 'password forgot reset sign in login cannot',
    summary:
      'On the sign-in screen click **Forgot password**, enter your email and follow the link sent to you. Check Spam if it doesn’t arrive.',
  },

  // ---------- Company setup ----------
  {
    id: 'settings',
    title: 'Change company settings',
    pages: ['settings'],
    anyOf: ['company.settings.update'],
    keywords: 'settings costing fifo weighted tax inclusive exclusive prices backdating window',
    summary: 'Settings holds how BMS works for your company.',
    steps: [
      'Open **Settings** and check the names, time zone and financial year start month.',
      '**Stock costing method:** leave on weighted average unless your accountant asks for FIFO. It locks after the first stock posting.',
      '**Sale prices:** choose **Before tax** (tax is added) or **Include tax** if shelf prices already include VAT.',
      '**Backdating window (days):** 3 by default.',
      'Save.',
    ],
    link: { to: 'settings', label: 'Open Settings' },
  },
  {
    id: 'document-details',
    title: 'Put my address, phone and RC on receipts',
    pages: ['settings'],
    anyOf: ['company.settings.update'],
    keywords: 'address phone email rc tin receipt invoice header details on documents',
    summary:
      'The **Details on documents** card in Settings holds what is printed at the top of receipts, invoices and reports.',
    steps: [
      'Open **Settings** and scroll to **Details on documents**.',
      'Fill in **Address**, **Phone**, **Email**, **RC number** and **TIN**.',
      'Click **Save details**. The next receipt or report you print shows them.',
    ],
    link: { to: 'settings', label: 'Open Settings' },
  },
  {
    id: 'periods',
    title: 'Open, soft-close or close a month',
    pages: ['periods'],
    anyOf: ['settings.periods.read'],
    keywords: 'financial period month close soft close open reopen next year',
    summary:
      'Each month is **Open** (anyone with rights can post), **Soft-closed** (only accountants and admins can post) or **Closed** (no postings).',
    steps: [
      'Open **Financial periods**.',
      'Soft-close a month once its sales and purchases are in; close it after the accountant’s review.',
      'Reopening a closed month needs a request approved by another user.',
      'Near the end of a year, click **Add next financial year**.',
    ],
    link: { to: 'periods', label: 'Open Financial periods' },
  },
  {
    id: 'year-end',
    title: 'Close the financial year',
    pages: ['periods'],
    anyOf: ['settings.periods.close'],
    keywords: 'year end close retained earnings closing journal',
    summary:
      'Year-end close moves every income and expense balance to Retained earnings in one journal.',
    steps: [
      'Make sure the year has ended and every month is closed or soft-closed. The last month must not be fully closed yet.',
      'In **Financial periods**, click **Close the year**.',
      'Close the last month, and click **Add next financial year** if needed.',
      'If a late adjustment changes the year’s profit, reopen the month (with approval), post it, and use **Close the year again**.',
    ],
    link: { to: 'periods', label: 'Open Financial periods' },
  },
  {
    id: 'chart-of-accounts',
    title: 'Set up or add to the chart of accounts',
    pages: ['accounts'],
    anyOf: ['ledger.accounts.manage'],
    keywords: 'chart of accounts new account template heading expense type ledger',
    summary: 'The chart of accounts is the list of “buckets” every transaction posts to.',
    steps: [
      'Open **Chart of accounts** and click **Use the trading template** for a ready-made chart.',
      'Click **New account**, choose **Heading** or **Account**, and enter a code, name, type and the heading it sits under.',
      'Deactivate accounts you won’t use instead of deleting them.',
    ],
    tips: [
      'Add expense accounts (for example “Generator fuel”) here so they appear on the Expenses page.',
      'An account’s code, type and role are fixed once it exists.',
    ],
    link: { to: 'accounts', label: 'Open Chart of accounts' },
  },
  {
    id: 'chart-of-accounts-read',
    title: 'Understand the chart of accounts',
    pages: ['accounts'],
    anyOf: ['ledger.accounts.read'],
    keywords: 'debit credit bucket account balance meaning',
    summary:
      'Every naira the business has, owes, earns or spends sits in an account. Each transaction takes value from one account (credit) and puts it into another (debit), and both sides are always equal.',
    tips: [
      'Most users never write journals by hand: sales, purchases, expenses and payments post their own.',
    ],
  },
  {
    id: 'bank-accounts',
    title: 'Add a bank account',
    pages: ['bank-accounts'],
    anyOf: ['ledger.accounts.manage'],
    keywords: 'bank account new add gtbank account number',
    summary:
      'Bank accounts appear wherever money moves: payments, receipts, the till and reconciliation.',
    steps: [
      'Open **Bank accounts** and click **New bank account**.',
      'Enter the **Bank**, **Account name** and **Account number**.',
      'Enter a ledger **Code** and **Name** and choose the heading (usually Cash and bank).',
      'Save. An account showing **Details missing** needs its bank name and number added with **Edit**.',
    ],
    link: { to: 'bank-accounts', label: 'Open Bank accounts' },
  },
  {
    id: 'tax-codes',
    title: 'Add a VAT rate',
    pages: ['tax-codes'],
    anyOf: ['company.settings.update'],
    keywords: 'vat tax code rate percent',
    summary:
      'No tax rate is set up for you. If you are VAT-registered, click **New** under Tax codes and enter a code, name and the **Rate (%)** your tax adviser confirmed. If you are not registered, leave it empty.',
    link: { to: 'tax-codes', label: 'Open Tax codes' },
  },
  {
    id: 'branches',
    title: 'Add a branch',
    pages: ['branches'],
    anyOf: ['company.branches.manage'],
    keywords: 'branch shop office warehouse new address',
    summary: 'Each shop, office or warehouse is a branch with its own stock.',
    steps: [
      'Open **Branches** and click **New branch**.',
      'Enter a **Code**, **Name** and **Address** (printed on that branch’s receipts).',
      'Save. The branch gets a **Store** and a **Quarantine** location automatically.',
    ],
    link: { to: 'branches', label: 'Open Branches' },
  },
  {
    id: 'stock-locations',
    title: 'Add or rename a stock location',
    pages: ['branches'],
    anyOf: ['company.branches.manage'],
    keywords: 'location store quarantine warehouse shop floor rename deactivate',
    summary: 'The **Stock locations** list sits below the branches.',
    steps: [
      'Click **New location**.',
      'Choose the **Branch**, enter a **Name** and choose the **Type**: Store (sellable) or Quarantine (damaged or returned). The type can’t be changed later.',
      'Use **Rename** to change a name, and **Deactivate** to stop using it.',
    ],
    link: { to: 'branches', label: 'Open Branches' },
  },
  {
    id: 'invite-user',
    title: 'Add a colleague',
    pages: ['members'],
    anyOf: ['company.members.invite'],
    keywords: 'invite user colleague staff add member link',
    summary: 'Each person gets their own login.',
    steps: [
      'Open **Users** and click **Invite a user**.',
      'Enter their **Email**, choose their roles and the branches they may work in.',
      'Click **Copy invitation link** and send it to them (WhatsApp or email). It is shown once and works once.',
      'They open the link and sign up or sign in with that same email.',
    ],
    link: { to: 'members', label: 'Open Users' },
  },
  {
    id: 'suspend-user',
    title: 'Remove a user who has left',
    pages: ['members'],
    anyOf: ['company.members.manage'],
    keywords: 'suspend remove user leave staff left access',
    summary:
      'Open **Users**, find the person and **Suspend** or remove them. They lose access immediately.',
    link: { to: 'members', label: 'Open Users' },
  },
  {
    id: 'roles',
    title: 'Create a custom role',
    pages: ['roles'],
    anyOf: ['company.roles.manage'],
    keywords: 'role custom permissions manager sales officer store officer accountant auditor',
    summary: 'Built-in roles can’t be edited, but you can make your own.',
    steps: [
      'Open **Roles** and create a new role.',
      'Pick a built-in role under **Start from**.',
      'Tick or untick what the role may do, and save.',
    ],
    tips: ['Keep at least two users who can approve, so requests never get stuck.'],
    link: { to: 'roles', label: 'Open Roles' },
  },
  {
    id: 'opening-balances',
    title: 'Enter opening balances',
    pages: ['opening-balances', 'accounts'],
    anyOf: ['ledger.journal.post', 'ledger.accounts.manage'],
    keywords: 'opening balance cut over start trial balance previous system',
    summary:
      'Bring in your position on the day you start using BMS. Everything balances against Opening balance equity.',
    steps: [
      'Ledger balances: **Chart of accounts → Opening balances**, choose the date and branch, enter each balance.',
      'Customers who owe you: open the customer → **Opening balance**, one entry per unpaid invoice.',
      'Suppliers you owe: open the supplier → **Opening balance**.',
      'Stock: **Stock adjustments → New**, type **Opening stock**.',
      'Equipment: **Fixed assets → Add fixed asset → Bring in asset**.',
    ],
    tips: ['When everything is entered, your trial balance should match your accountant’s.'],
  },

  // ---------- Accounting ----------
  {
    id: 'new-journal',
    title: 'Post a manual journal',
    pages: ['journals'],
    anyOf: ['ledger.journal.post'],
    keywords: 'journal manual entry accrual bank charges transfer cash banked',
    summary:
      'Use manual journals only for things no other screen records, such as bank charges, transfers between your own accounts or accruals.',
    steps: [
      'Open **Journals** and click **New journal**.',
      'Enter the date, branch, description and an optional reference.',
      'Add lines with an account and a debit or credit. Debits must equal credits.',
      'Click **Post**.',
    ],
    link: { to: 'journals/new', label: 'New journal' },
  },
  {
    id: 'reverse-journal',
    title: 'Correct a posted journal',
    pages: ['journals'],
    anyOf: ['ledger.journal.reverse'],
    keywords: 'reverse mistake correct wrong journal undo',
    summary:
      'Posted journals can’t be edited. Open the journal and click **Reverse**, then post the correct journal.',
  },
  {
    id: 'journals-list',
    title: 'See every posting',
    pages: ['journals'],
    anyOf: ['ledger.journal.read'],
    keywords: 'journals list postings ledger entries',
    summary:
      'Journals lists every posting in the ledger, whichever screen made it. Click one to see its lines and source.',
    link: { to: 'journals', label: 'Open Journals' },
  },
  {
    id: 'trial-balance',
    title: 'Run the trial balance',
    pages: ['trial-balance'],
    anyOf: ['reports.financial.read'],
    keywords: 'trial balance tb debit credit totals',
    summary:
      'Shows each account’s debit or credit balance at the date you choose. Click **Print or save PDF** for an A4 copy.',
    link: { to: 'trial-balance', label: 'Open Trial balance' },
  },
  {
    id: 'day-book',
    title: 'Check today’s transactions',
    pages: ['day-book'],
    anyOf: LEDGER_READ,
    keywords: 'day book daily today transactions vouchers end of day',
    summary: 'The day book lists every entry posted on a day or over a date range.',
    steps: [
      'Open **Day book** and choose a day, or a from and to date.',
      'Filter by voucher type if you need to.',
      'Set **View** to **With accounts** to see each entry’s debit and credit lines.',
      'Click an entry to open its document. **Print or save PDF** gives an A4 copy.',
    ],
    link: { to: 'day-book', label: 'Open Day book' },
  },
  {
    id: 'audit-log',
    title: 'See who did what',
    pages: ['audit'],
    anyOf: ['company.audit.read'],
    keywords: 'audit log history who changed user activity',
    summary: 'The audit log records every action with the user, time and details.',
    link: { to: 'audit', label: 'Open Audit log' },
  },
  {
    id: 'bank-reconciliation',
    title: 'Reconcile a bank account',
    pages: ['bank-reconciliation'],
    anyOf: ['ledger.bank.reconcile'],
    keywords: 'bank reconciliation statement match tick closing balance',
    summary: 'Do this monthly for each bank account when you have the statement.',
    steps: [
      'Choose the **Account**, the **Statement date** and the **Closing balance on the statement**.',
      'Tick each entry that appears on the statement.',
      'Record anything on the statement not yet in BMS (bank charges, interest, transfers), then tick it.',
      'When the difference is zero, finish the reconciliation.',
    ],
    link: { to: 'bank-reconciliation', label: 'Open Bank reconciliation' },
  },

  // ---------- Stock ----------
  {
    id: 'new-product',
    title: 'Add a product or service',
    pages: ['products'],
    anyOf: ['inventory.products.manage'],
    keywords: 'product item new sku price unit service stock item reorder',
    summary: 'Products are what you buy, stock and sell.',
    steps: [
      'Open **Products** and click **New product**.',
      'Choose the **Kind**: **Stock item** or **Service** (sold, never stocked).',
      'Enter the **SKU**, **Name**, **Unit**, selling price, and optional **Category** and **Reorder level**.',
      'Save. Quantities come from opening stock or purchases.',
    ],
    tips: ['Use **Edit** to change the name, price, category, reorder level or unit later.'],
    link: { to: 'products', label: 'Open Products' },
  },
  {
    id: 'categories',
    title: 'Add or rename a product category',
    pages: ['products'],
    anyOf: ['inventory.products.manage'],
    keywords: 'category group rename deactivate',
    summary:
      'In **Products**, click **Categories**, then **New category**. In the same window, **Rename** fixes a name and **Deactivate** hides a category from new products.',
    link: { to: 'products', label: 'Open Products' },
  },
  {
    id: 'stock-card',
    title: 'See a product’s stock and movements',
    pages: ['products'],
    anyOf: ['inventory.products.read'],
    keywords: 'stock card on hand quantity movement history location search product',
    summary:
      'The Products list shows quantity on hand and stock value. Open a product to see **Stock by location** and every movement in and out.',
    link: { to: 'products', label: 'Open Products' },
  },
  {
    id: 'stock-adjustment',
    title: 'Count stock or write off damaged goods',
    pages: ['stock-adjustments'],
    anyOf: ['inventory.adjustment.create', 'inventory.count.create'],
    keywords: 'stock adjustment count damaged lost theft expired opening stock write off',
    summary: 'Every stock change outside buying and selling goes through a stock adjustment.',
    steps: [
      'Open **Stock adjustments** and click **New**.',
      'Choose the type: **Opening stock**, **Count** (enter what you counted) or **Adjustment** (found or lost).',
      'Choose the location, give a reason and add product lines.',
      'Save.',
    ],
    tips: [
      'Admins and managers: it posts at once. Store officers: it waits for a manager or admin to approve.',
    ],
    link: { to: 'stock-adjustments/new', label: 'New stock adjustment' },
  },
  {
    id: 'approve-adjustment',
    title: 'Approve a stock adjustment',
    pages: ['stock-adjustments'],
    anyOf: ['inventory.adjustment.approve', 'inventory.count.approve'],
    keywords: 'approve adjustment count store officer pending stock',
    summary:
      'Open the waiting adjustment from **Stock adjustments** and click **Approve and post**. The posting is dated the day of approval.',
    link: { to: 'stock-adjustments', label: 'Open Stock adjustments' },
  },
  {
    id: 'stock-not-changed',
    title: 'My stock didn’t change after an adjustment',
    pages: ['stock-adjustments'],
    anyOf: ['inventory.adjustment.create', 'inventory.count.create'],
    keywords: 'stock not changed adjustment pending waiting',
    summary:
      'If a store officer raised it, it is waiting for a manager or admin to approve it. Nothing changes until then.',
  },

  // ---------- Purchasing ----------
  {
    id: 'receive-goods',
    title: 'Record goods arriving from a supplier',
    pages: ['purchases'],
    anyOf: ['purchasing.receipt.post'],
    keywords: 'receive goods delivery grn goods received supplier stock in',
    summary: 'Stock goes up when you record goods received.',
    steps: [
      'Open **Purchases** and click **Receive goods**.',
      'Choose the supplier, date, location and delivery note number.',
      'Add each product, quantity and unit cost, then post.',
    ],
    link: { to: 'purchases/receipts/new', label: 'Receive goods' },
  },
  {
    id: 'supplier-invoice',
    title: 'Record a supplier’s bill',
    pages: ['purchases'],
    anyOf: ['purchasing.invoice.post'],
    keywords: 'supplier invoice bill record owe payable',
    summary: 'Recording the invoice makes the amount owed to the supplier.',
    steps: [
      'Open **Purchases** and click **Record invoice**.',
      'Enter the supplier’s invoice number, date and due date.',
      'Tick the goods received it covers, and add other charges and input tax shown on it.',
      'Post.',
    ],
    link: { to: 'purchases/invoices/new', label: 'Record invoice' },
  },
  {
    id: 'pay-supplier',
    title: 'Pay a supplier',
    pages: ['purchases', 'suppliers'],
    anyOf: ['purchasing.payment.post'],
    keywords: 'pay supplier payment advance allocate',
    summary: 'Payments are allocated to unpaid invoices; anything left is kept as an advance.',
    steps: [
      'Open **Purchases** and click **Pay supplier**.',
      'Choose the supplier, the cash or bank account it is paid from and the amount.',
      'Allocate it to unpaid invoices and post.',
    ],
    tips: ['BMS refuses a payment the account cannot cover. Record money coming in first.'],
    link: { to: 'purchases/payments/new', label: 'Pay supplier' },
  },
  {
    id: 'supplier-return',
    title: 'Return goods to a supplier',
    pages: ['purchases'],
    anyOf: ['purchasing.receipt.post', 'purchasing.invoice.post'],
    keywords: 'return supplier send back goods',
    summary:
      'Open **Purchases** and click **Return goods**. Goods not yet invoiced reduce what you will be invoiced for; invoiced goods are credited against their invoice.',
    link: { to: 'purchases/returns/new', label: 'Return goods' },
  },
  {
    id: 'suppliers',
    title: 'Add a supplier',
    pages: ['suppliers'],
    anyOf: ['purchasing.suppliers.manage'],
    keywords: 'supplier new vendor add phone terms',
    summary:
      'Open **Suppliers**, click **New supplier** and enter a code, name, phone, payment terms and optional tax ID. Always enter the phone number so WhatsApp statements work.',
    link: { to: 'suppliers', label: 'Open Suppliers' },
  },
  {
    id: 'supplier-statement',
    title: 'Send a supplier a statement on WhatsApp',
    pages: ['suppliers'],
    anyOf: ['purchasing.read'],
    keywords: 'supplier statement whatsapp owe confirm',
    summary:
      'Open the supplier and click **WhatsApp**. BMS types what you owe them; check the number and press Send in WhatsApp yourself.',
  },

  // ---------- Expenses ----------
  {
    id: 'record-expense',
    title: 'Pay for fuel, repairs or supplies',
    pages: ['expenses'],
    anyOf: ['purchasing.payment.post', 'purchasing.invoice.post'],
    keywords: 'expense fuel diesel repair supplies office spend cost',
    summary: 'Use Expenses for things the company uses up. BMS posts the journal for you.',
    steps: [
      'Open **Expenses** and click **Record expense**.',
      'Under **What was it for?**, choose the expense type, a description and the amount.',
      'Under **How was it paid?**, choose **Paid now** (pick the account) or **On credit** (pick the supplier).',
      'Enter the date and branch, then click **Post expense**.',
    ],
    tips: [
      'Equipment or vehicles used for more than a year go under Fixed assets, not Expenses.',
      'If no expense type fits, ask your accountant to add an expense account.',
    ],
    link: { to: 'expenses/new', label: 'Record expense' },
  },

  // ---------- Sales ----------
  {
    id: 'new-sale',
    title: 'Make a sale',
    pages: ['sales/new', 'sales'],
    anyOf: ['sales.invoice.post'],
    keywords: 'sell sale till pos walk-in cash customer invoice checkout',
    summary: 'The till records the sale, payment and stock in one step.',
    steps: [
      'Click **New sale** in the menu.',
      'Choose the customer, or **Walk-in customer (pays now)**.',
      'Choose where to **Sell from**, then add products, quantities, discount and tax code.',
      'Enter the **Amount received** and the account it is **Received into**. Leave it at 0 to sell on credit.',
      'Post the sale, then click **Receipt**, **Print** or **WhatsApp**.',
    ],
    link: { to: 'sales/new', label: 'New sale' },
  },
  {
    id: 'credit-limit',
    title: 'A customer is over their credit limit',
    pages: ['sales/new', 'customers'],
    anyOf: ['sales.invoice.post'],
    keywords: 'credit limit over exceed override customer owe',
    summary:
      'A sale that would take a customer over their credit limit needs a manager’s approval for that amount, once. Request the override and a manager approves it under Approvals.',
  },
  {
    id: 'receive-payment',
    title: 'Receive money a customer owes',
    pages: ['sales', 'customers'],
    anyOf: ['sales.receipt.post'],
    keywords: 'receive payment customer pay debt collect receipt allocate',
    summary: 'Payments are allocated to unpaid invoices; anything left is kept as an advance.',
    steps: [
      'Open **Sales** and click **Receive payment**.',
      'Choose the customer, the amount and the account it was received into.',
      'Allocate it to unpaid invoices and post.',
    ],
    link: { to: 'sales/receipts/new', label: 'Receive payment' },
  },
  {
    id: 'sales-list',
    title: 'Find a sale',
    pages: ['sales'],
    anyOf: ['sales.read', 'sales.readOwn'],
    keywords: 'find sale invoice list search reprint',
    summary:
      'Open **Sales** to see invoices, payments received, returns and refunds. Click one to open it and reprint its receipt.',
    tips: ['Sales officers see only their own sales.'],
    link: { to: 'sales', label: 'Open Sales' },
  },
  {
    id: 'quotation',
    title: 'Give a customer a quotation',
    pages: ['quotations'],
    anyOf: ['sales.quotation.manage'],
    keywords: 'quotation quote offer proforma estimate',
    summary:
      'Open **Quotations** and click **New**. Add a validity date and lines, then mark it sent, accepted or declined. A sent or accepted quotation becomes an invoice in one step.',
    link: { to: 'quotations/new', label: 'New quotation' },
  },
  {
    id: 'customers',
    title: 'Add a customer',
    pages: ['customers'],
    anyOf: ['sales.customers.manage'],
    keywords: 'customer new add credit limit terms phone',
    summary:
      'Open **Customers**, click **New customer** and enter a code, name, phone, payment terms and **Credit limit** (0 means cash only). Walk-in customers who pay at once need no record.',
    link: { to: 'customers', label: 'Open Customers' },
  },
  {
    id: 'payment-reminder',
    title: 'Remind a customer to pay',
    pages: ['customers', 'reports'],
    anyOf: ['sales.read', 'sales.readOwn'],
    keywords: 'remind reminder whatsapp owe debt overdue',
    summary:
      'Open the customer and click **WhatsApp** to send a reminder listing each unpaid invoice, with your bank details if you choose. You press Send in WhatsApp yourself.',
  },
  {
    id: 'customer-return',
    title: 'Take back goods from a customer',
    pages: ['sales'],
    anyOf: ['sales.return.create', 'sales.return.post'],
    keywords: 'return goods customer credit note damaged quarantine',
    summary: 'A return reduces the customer’s balance with a credit note.',
    steps: [
      'Open the invoice under **Sales** and click **Return goods**.',
      'Enter the quantity returned and its condition: **Can be sold again** or **Damaged** (goes to Quarantine).',
      'Give a reason and post. If the customer should get money back, choose **Pay back from**.',
    ],
    tips: ['Sales officers see **Ask for approval**: a manager approves it before anything moves.'],
  },
  {
    id: 'refund',
    title: 'Refund a customer',
    pages: ['customers', 'sales'],
    anyOf: ['sales.refund.post', 'sales.refund.request'],
    keywords: 'refund money back customer credit overpayment',
    summary:
      'Open the customer, enter the **Amount to pay back** and the **Pay from** account. Refunds raised by sales officers wait for a manager’s approval.',
  },

  // ---------- Services, projects, production, assets ----------
  {
    id: 'projects',
    title: 'Track a project or job',
    pages: ['projects'],
    anyOf: ['projects.manage'],
    keywords: 'project job contract margin profit tag',
    summary:
      'Create a project for each job (optionally linked to a customer) and tag sales, supplier invoices and journals with it. The project page shows its revenue, costs and margin.',
    link: { to: 'projects', label: 'Open Projects' },
  },
  {
    id: 'production',
    title: 'Make products from materials',
    pages: ['production'],
    anyOf: ['production.manage'],
    keywords: 'production bill of materials bom manufacture order issue materials finished goods',
    summary: 'Production turns materials into finished goods at their actual cost.',
    steps: [
      'Define a **Bill of materials** (finished product and its components).',
      'Create a **Production order** with the quantity and store.',
      '**Issue materials** to the order, and **Add direct costs** such as labour.',
      '**Complete the order** with the quantity made and any loss.',
    ],
    link: { to: 'production', label: 'Open Production' },
  },
  {
    id: 'fixed-asset',
    title: 'Record equipment or a vehicle',
    pages: ['fixed-assets'],
    anyOf: ['assets.manage'],
    keywords: 'fixed asset equipment vehicle generator furniture buy disposal sell',
    summary: 'Things the business uses for more than a year are fixed assets.',
    steps: [
      'Open **Fixed assets** and click **Add fixed asset**.',
      'Choose **Post purchase** (new) or **Bring in asset** (owned before BMS).',
      'Enter cost, residual value, useful life, accounts and the date it was in use from.',
      'To sell or scrap it, open the asset and record its disposal.',
    ],
    link: { to: 'fixed-assets/new', label: 'Add fixed asset' },
  },
  {
    id: 'depreciation',
    title: 'Run monthly depreciation',
    pages: ['fixed-assets'],
    anyOf: ['assets.depreciation.post'],
    keywords: 'depreciation monthly run month end',
    summary:
      'At each month end click **Run depreciation** in Fixed assets, choose the branch and month. One journal charges every active asset; missed months are caught up and no month is charged twice.',
    link: { to: 'fixed-assets', label: 'Open Fixed assets' },
  },

  // ---------- Reports, printing ----------
  {
    id: 'financial-reports',
    title: 'See profit or the balance sheet',
    pages: ['reports'],
    anyOf: ['reports.financial.read'],
    keywords: 'profit loss p&l balance sheet report income',
    summary:
      'Open **Reports**, choose **Profit and loss** (from and to dates) or **Balance sheet** (as at date). Click **Print or save PDF** for an A4 copy.',
    link: { to: 'reports', label: 'Open Reports' },
  },
  {
    id: 'ageing-reports',
    title: 'See who owes you and whom you owe',
    pages: ['reports'],
    anyOf: ['reports.financial.read', 'sales.read', 'purchasing.read'],
    keywords: 'receivables payables ageing debtors creditors overdue',
    summary:
      'In **Reports**, **Receivables ageing** shows what each customer owes by how overdue it is; **Payables ageing** shows what you owe each supplier.',
    link: { to: 'reports', label: 'Open Reports' },
  },
  {
    id: 'stock-valuation',
    title: 'See the value of stock',
    pages: ['reports'],
    anyOf: ['reports.stock.read'],
    keywords: 'stock valuation value inventory worth quantity average cost',
    summary:
      'In **Reports**, choose **Stock valuation**, set the date and location. It shows quantity, average cost and value per product.',
    link: { to: 'reports', label: 'Open Reports' },
  },
  {
    id: 'save-pdf',
    title: 'Save a report as PDF',
    pages: ['reports', 'trial-balance', 'day-book'],
    anyOf: ['reports.financial.read', 'reports.stock.read', 'sales.read', 'purchasing.read'],
    keywords: 'pdf print save email report a4',
    summary:
      'Click **Print or save PDF**, then choose **Save as PDF** as the destination in the print dialog. The file name is filled in for you.',
  },
  {
    id: 'print-receipt',
    title: 'Print or share a receipt',
    pages: ['sales', 'purchases', 'expenses'],
    keywords: 'receipt print thermal 58mm 80mm bluetooth printer whatsapp share reprint',
    summary:
      'Sales, payments, goods received, supplier invoices, supplier payments and expenses have **Receipt** and **WhatsApp** buttons.',
    steps: [
      'Open the document and click **Receipt**.',
      'Choose **58 mm** or **80 mm** paper. BMS remembers your choice on that device.',
      'Click **Print**, or **Connect Bluetooth printer** the first time to pair a portable printer.',
      'Or click **WhatsApp**, check the number and message, and press Send in WhatsApp.',
    ],
    tips: ['Bluetooth printing needs Chrome or Edge on Android or a computer, not iPhone.'],
  },
  {
    id: 'whatsapp-no-number',
    title: 'WhatsApp opens without a number',
    pages: ['customers', 'suppliers'],
    keywords: 'whatsapp number missing phone',
    summary:
      'Add the phone number to the customer or supplier record, or type it in the box before opening WhatsApp.',
  },

  // ---------- Routines and troubleshooting ----------
  {
    id: 'daily-routine',
    title: 'What to do every day',
    pages: [''],
    keywords: 'daily routine end of day closing cash count',
    summary: 'A short routine keeps the books right.',
    steps: [
      'Record every sale, payment, purchase and expense on the day it happens.',
      'Check **Approvals** for anything waiting for you.',
      'At closing, run the **Day book** for today and count the cash against the cash account.',
    ],
  },
  {
    id: 'month-end',
    title: 'Month-end checklist',
    pages: ['periods', ''],
    anyOf: ['settings.periods.close'],
    keywords: 'month end close routine checklist',
    summary: 'Before closing a month:',
    steps: [
      'Make sure all sales, purchases, expenses, receipts and payments are posted.',
      'Do the stock count if due and approve waiting adjustments.',
      'Reconcile every bank account and run depreciation.',
      'Review the trial balance, profit and loss and ageing reports.',
      'Soft-close the month, then close it once the accountant is satisfied.',
    ],
  },
  {
    id: 'cant-post-date',
    title: 'I can’t post to a date',
    pages: [''],
    keywords: 'cannot post date closed month error',
    summary:
      'The month may be closed, or the date is beyond the backdating window. Send a backdating request, or ask an accountant to check Financial periods.',
  },
  {
    id: 'overdraw',
    title: 'A payment was refused for overdrawing the account',
    pages: ['purchases', 'expenses'],
    keywords: 'overdraw overdraft refused insufficient balance cash bank negative',
    summary:
      'The cash or bank account doesn’t hold enough in BMS. Record the money received, or the transfer in, first, then post the payment.',
  },
  {
    id: 'fix-mistake',
    title: 'A posted document has a mistake',
    pages: [''],
    keywords: 'mistake wrong error edit change posted correct undo delete',
    summary:
      'Posted documents can’t be edited or deleted. Return the goods, raise a credit note or reverse the journal, then post it correctly.',
  },
  {
    id: 'missing-menu',
    title: 'I can’t see a menu item or button',
    pages: [''],
    keywords: 'missing menu button hidden cannot see access',
    summary: 'Your role doesn’t include it. Ask your Company Admin.',
  },
];
