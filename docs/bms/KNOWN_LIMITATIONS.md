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

- **Sales officers cannot see stock quantities.** Stock levels need `reports.stock.read`;
  an availability view for the sales screen comes with POS in Phase 5.
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
- **Input tax is typed, not computed.** No tax codes or rates exist yet (OPEN_DECISIONS #9).
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
