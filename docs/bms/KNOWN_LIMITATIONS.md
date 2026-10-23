# Known limitations

Updated at the end of each phase. Items here are deliberate scope cuts or open risks, not bugs.

## Phase 1

- **Invitation emails are not sent.** The admin copies a single-use link (shown once). Sending
  email needs a provider decision (e.g. Firebase Trigger Email extension, SendGrid, Postmark).
- **Single-admin companies cannot reopen a closed period.** Requests cannot be self-approved
  (OPEN_DECISIONS #11), so a second user with `settings.periods.reopen.approve` is required.
- **Branch scope** is enforced on postings since Phase 2 (`branch_not_allowed`). Reads are not
  yet filtered by branch: a member who can read the ledger sees all branches.
- **No production deployment yet.** Firebase projects (`bms-staging`, `bms-prod`), region,
  App Check site key and billing are owner actions (OPEN_DECISIONS #12–13).
- **Platform Super Admin** is granted by a script with service-account access; that script and
  the support UI are Phase 8 items. The `platform.supportRead` command and its audit log exist.
- **Web bundle** is about 270 kB gzipped (mostly the Firebase SDK). Route-level code splitting
  is in place; further splitting is a Phase 8 performance task.
- **Rate limiting** of commands relies on Firebase Auth and App Check for now; per-user
  quotas are a Phase 8 item.
- **Composite indexes** in `firestore.indexes.json` are verified by the emulator only;
  production index builds happen on first deploy.

## Phase 2

- **Account code, type and role cannot be changed after creation**; create a new account and
  deactivate the old one instead.
- **Opening balances cover general-ledger accounts only.** Customer, supplier and stock
  opening balances (and the check that they equal their control accounts) come with those
  modules, as durable chunked batches.
- **No period-close snapshots yet.** The trial balance sums ledger entries on demand, one
  aggregation query per account with postings. That is fine for early volumes; snapshots at
  period close (ADR-0004) are added when reports in Phase 7 need them.
- **Journal numbering uses one counter document per series**, which Firestore limits to about
  one write per second. That is ample for manual journals; high-volume module postings
  (POS, Phase 5) will need a sharded or per-branch series.
- **Reversals require every account on the journal to still be active.** Reactivate an
  account before reversing a journal that uses it.
- **Reversal approval** (`ledger.journal.reverse.approve`) exists in the permission catalogue
  but is not required: anyone with `ledger.journal.reverse` reverses directly. Requiring a
  second person is a policy choice for the owner.
- **The journals list shows the latest 100.** Search, filters and paging come with reports.
- **A single-admin company cannot backdate beyond the window**, because requests cannot be
  self-approved.

## Phase 3

- **Sales officers cannot see stock values.** Since Phase 5 they see quantities on the sale
  screen through `stockAvailability`; values still need `reports.stock.read`.
- **No transfers between locations yet.** Moving stock to quarantine or another branch is
  done today as a decrease at one location and an increase at the other.
- **Adjustments are dated on approval.** The posting date is the approver's business date;
  backdated adjustments are not offered.
- **One counter document per number series** (ADJ, CNT, OST), as for journals.
- **A stock adjustment holds up to 200 lines** and posts in one transaction. Large full-store
  counts will need durable, chunked batches.
- **No unit conversions, product types, barcodes, tax codes or per-category accounts yet.**
  Every product uses one unit from a fixed list, and all stock uses 1300 Inventory.
- **No negative-stock override.** Negative stock is always refused.
- **Self-approval is never allowed**, so a single-person company cannot post stock
  adjustments until a second person with approval rights joins.

## Phase 4

- **No purchase orders.** The receipt's unit cost stands in for the agreed price; there is no
  three-way match against an order.
- **Supplier payments need no second approval** (OPEN_DECISIONS #16). The
  `purchasing.payment.approve` permission exists for when an approval step is wanted.
- **Input tax is typed, not computed.** Tax codes exist since Phase 5 but apply to sales only.
- **A supplier return credit cannot exceed what is still owed on its invoice.** Refunds from
  suppliers and debit balances on a supplier come later.
- **Landed costs spread by value or quantity only**, over a single receipt per charge line.
  Weight-based spreading needs product weights.
- **Invoices and receipts must be at the same branch**, and returns are taken from a location
  at the receipt's branch.
- **Lists show the latest 100 documents**, and a supplier page shows the latest 100 of each
  kind. Search, filters, ageing and statements come with reports in Phase 7.
- **No editing or voiding of posted purchase documents.** A wrong receipt is corrected with a
  return; a wrong invoice amount with a manual journal or, later, a debit note.
- **Weighted average "on hand"** for price differences is an approximation: the smaller of
  the invoiced quantity and the quantity now at the location (ACCOUNTING_POLICIES §5).

## Phase 5

- **A sale cannot be voided.** Since Phase 6 a wrong sale is corrected with a return of every
  line (and a refund if money was taken); manual journals cannot touch receivables or
  inventory.
- **One revenue account.** Every sale credits the account with the Revenue role; revenue by
  product line needs per-category accounts (CHART_OF_ACCOUNTS question 1). Branch is on every
  ledger line, so revenue by branch already works.
- **One tax code per line, sales only.** No compound taxes, withholding tax, exempt/zero-rated
  reporting or tax returns yet; input tax on purchases is still typed.
- **Number series** (SI, CR) and the system journal series are single counter documents,
  about one write per second each. That suits a few tills; busy multi-till shops will need
  sharded or per-branch series before go-live.
- **No till sessions.** There is no opening float, cash-up, receipt printer or barcode
  scanner support; the sale page prints with the browser.
- **The sale screen loses an unsaved cart on reload**, including while waiting for a credit
  approval. The approval itself is kept and can be used once the cart is re-entered.
- **Sales officers allocate receipts only to invoices they recorded**, because they read only
  their own sales. Anything else stays as an advance for an accountant to apply.
- **A product without a selling price** can be sold only by someone with
  `sales.priceOverride`.
- **Lists show the latest 100 documents.** Customer statements, ageing and sales reports come
  with Phase 7.
- **Changing a tax rate or the "prices include tax" setting** affects sales posted afterwards
  only; there is no effective date.

## Phase 6

- **Returns and refunds are dated the day they are posted** (or approved), not the day the
  goods came back. There is no backdating for them.
- **Approving a return re-checks the sale, not the stock count.** Goods are put back at the
  sold cost even if the shop's cost has changed since.
- **Store officers do not receive returned goods separately.** `sales.return.receiveGoods`
  exists but is not used: posting the return puts the goods back in stock.
- **Damaged goods stay in quarantine** until someone posts a stock adjustment to write them off
  (with the usual approval).
- **A return cannot change prices or be partial in value.** Price allowances without goods
  coming back need credit notes without stock, which come later.
- **Refunds come from one receipt or credit note at a time.** Paying back a customer's whole
  credit from several sources needs one refund each.
- **No supplier refunds or debit notes yet**, and no return time limit (DECISION 18).
- **Bank reconciliation is manual.** There is no statement import or matching; the page looks
  at the latest 1,000 entries on the account, and one reconciliation clears at most 400.
  A reconciliation cannot be undone, and entries posted to an already reconciled date are
  picked up by the next one.
- **Lists show the latest 100 returns and refunds.**

## Phase 7

- **Reports are worked out in the browser** from server-side sums per account (one query per
  account with postings). This is fine for a small business's chart; very large charts or
  many users running reports at once will need stored balances.
- **Ageing does not include advances or unused credits.** Ageing at a past date relies on
  settlement records, which start with this release; there is no older data to rebuild.
- **Stock valuation is at cost only** (no net realisable value write-down). At a past date it
  sums each product's stock movements, one query per product.
- **The year-end close needs the months closed first** and posts on the branch chosen first in
  the list. It cannot be reversed; corrections are posted to the year and the year closed again.
- **Statements are not split by branch** and have no comparative period, export or print
  layout yet.
- **Fixed assets:** straight line only; the useful life and residual value cannot be changed
  after the asset is registered; no revaluation, impairment, partial disposal or asset
  categories. Asset purchases are posted against cash, bank or a general liability or equity
  account, not through supplier invoices. A depreciation run covers one branch and at most
  400 assets. A disposal cannot be dated before months already charged.
- **Fixed asset accounts are not control accounts**, so a manual journal can still post to
  them. The register page compares itself with the ledger and shows any difference.

## Phase 8

- **Not deployed yet.** The deploy workflow, setup script and alerts are written but have not
  run against a real project; the owner creates the projects (DEPLOYMENT.md). The recovery
  drill and a staging load test wait for that.
- **One company posts a few documents a second at most**, because each posting updates the
  company's number series document (LOAD_TESTING.md).
- **The rate limit is per function instance**, held in memory.
- **Backups cover Firestore only**, for 14 weeks; Auth users and Storage files are not backed
  up by the schedule (OPERATIONS.md §4).
- No independent penetration test yet.

## Phase 9

- **Companies created before Phase 9 lack the new accounts.** Selling a service needs a
  Service revenue account (subtype Service revenue), and production needs a Work in progress
  account (subtype Work in progress). An admin adds them under Chart of accounts; until then
  those commands are refused with a message naming the missing account.
- **Quotations have no expiry job.** "Valid until" is shown, but an out-of-date quotation is
  not closed automatically and can still be invoiced while sent or accepted.
- **One invoice per quotation**, for the whole quotation; partial invoicing is not supported.
- **Projects have no budget, timesheets or percentage-of-completion revenue.** Unbilled work
  is accrued by journal (DECISION 19).
- **A production order is completed once**, for its whole output; partial completions, by-
  products and multi-level bills (a bill using another bill's output in the same order) are
  not supported. Sub-assemblies are made on their own orders first.
- **No standard costs or overhead absorption** (DECISION 21); indirect production overheads
  stay in expenses unless charged to an order as a direct cost.
- **Production orders are not tagged to projects**, and production postings are dated today
  only (no backdating).
