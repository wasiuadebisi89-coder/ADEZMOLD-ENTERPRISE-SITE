# BMS — Accounting policies (Phase 0)

Status: **Draft for review.** Items marked **DECISION** need the owner's confirmation;
the value shown is the proposed safe default, not a fact. No tax rate is hard-coded:
tax codes and rates are entered per company by an authorised user.

Reference framework (DECISION 1): proposed **IFRS for SMEs** principles, configurable per
company. The software records policy choices per company so it can serve businesses on
other frameworks.

## 1. Entity and currency

- One base (functional) currency per company, chosen at registration and locked after the
  first posting. DECISION 2: proposed default currency for the pilot = **NGN**.
- Multi-currency transactions are out of scope until a later phase.

## 2. Financial periods

- Fiscal year start month configurable (DECISION 3: proposed January).
- Monthly periods. Status: `open → soft_closed → closed`.
  - `soft_closed`: only users with `settings.periods.postSoftClosed` (Accountant/Admin) may post.
  - `closed`: no postings. Reopening requires `settings.periods.reopen` **and** an approved
    approval request with a reason; it is audited.
- Backdating: postings with a date earlier than today minus `backdateWindowDays`
  (DECISION 4: proposed **3 days**) require approval. Future-dated postings beyond today are
  rejected.
- Year-end close transfers income and expense balances to retained earnings via a system
  journal (Phase 7).

## 3. Double entry and immutability

- Every posted journal balances, has ≥ 2 lines, uses active postable accounts.
- Posted journals and documents are never edited or deleted. Corrections: full reversal
  (mirror journal dated in an open period, linked both ways) and, if needed, a new
  correcting entry.
- Control accounts (AR, AP, inventory, GRNI) accept postings only from their subledger
  modules, never from manual journals.

## 4. Inventory

- Perpetual inventory system.
- Costing method per company, chosen before the first stock posting and then locked
  (DECISION 5: proposed default **weighted average (perpetual, moving)**; FIFO available).
- Negative stock not allowed by default (`allowNegativeStock=false`).
- Inventory is measured at cost; cost includes purchase price net of trade discounts plus
  **eligible** landed costs (§6). Recoverable taxes are excluded from cost.
- Write-downs to net realisable value: manual adjustment with approval (not automated).
- Stock adjustments and count variances post to an "Inventory adjustments" expense account
  and require approval above a configured threshold (DECISION 6: proposed — all
  adjustments require approval initially).

## 5. Purchases

- Purchase invoice and goods receipt can occur at different times:
  - Goods receipt first: Dr Inventory / Cr **GRNI** (goods received not invoiced) at order
    or expected cost.
  - Invoice later: Dr GRNI / Cr Accounts Payable; price differences between receipt and
    invoice go to inventory if stock is still on hand, otherwise to cost of sales
    (proportional split for partly-sold stock).
  - Invoice without stock (services, expenses): Dr Expense / Cr AP.
- Supplier payment: Dr AP / Cr Cash or Bank, allocated to invoices; unallocated payments
  are supplier advances (Dr Supplier advances, an asset).
- Supplier return: Dr AP (or Supplier receivable) / Cr Inventory at the cost carried for
  the returned goods; difference to supplier's credit price goes to a purchase price
  variance account.

## 6. Landed costs

- Only charges flagged as **capitalisable** on the charge type (e.g. freight-in, insurance
  in transit, non-recoverable import duties) are added to inventory.
- Other charges (e.g. outward delivery, general handling, storage after receipt) are expensed.
- Allocation basis per landed cost document: by value (default), by quantity or by weight.
- If goods are already partly sold when the charge is posted, the share relating to sold
  units goes to cost of sales.

## 7. Sales

- Revenue recognised when control passes: at POS completion for cash/walk-in sales, at
  delivery/invoice posting for credit sales.
- Line discounts reduce revenue (revenue is recorded net); no separate discount expense.
- Cash sale: Dr Cash/Bank, Cr Revenue, Cr Output tax (if any); Dr COGS, Cr Inventory.
- Credit sale: Dr AR instead of Cash. Partial payment at sale = credit sale + receipt.
- Customer receipt: Dr Cash/Bank / Cr AR, allocated oldest-first by default or manually;
  unallocated receipts are customer advances (liability).
- Credit limit: warn by default; block requires `sales.creditLimit.enforce` setting
  (DECISION 7).

## 8. Returns, credit notes and refunds

- A sales return references the original sale line, cannot exceed sold minus already
  returned quantity, captures reason and condition.
- Goods effect (at original COGS cost of the returned units):
  - Resalable → Dr Inventory (store) / Cr COGS.
  - Damaged / quarantined → Dr Inventory (quarantine location) / Cr COGS; later write-off
    by approved adjustment to an expense account.
- Financial effect: a **credit note** Dr Revenue (and output tax) / Cr AR. For cash sales
  the credit sits as a customer credit balance (AR in credit / customer advances).
- **Refund** is a separate document, approval-controlled: Dr AR (or customer advance) /
  Cr Cash/Bank, dated when money is actually paid. Cash/bank change only on the refund.

## 9. Rounding

- Line totals rounded half-away-from-zero to minor units; document totals sum rounded
  lines; tax computed per line (DECISION 8: per line vs per document).
- Inventory value rounding residue from WAC goes to the last movement that empties the
  balance, so value reaches exactly zero when quantity reaches zero.

## 10. Tax

- Tax codes (name, rate, recoverable flag, output/input accounts) are configured per company.
  No rate is seeded. Prices may be tax-inclusive or tax-exclusive per company
  (DECISION 9: proposed exclusive). Companies not registered for VAT simply have no
  tax codes.

## 11. Fixed assets

- Recognised at cost incl. directly attributable costs to bring to working condition.
- Straight-line method first. Monthly depreciation starts from the available-for-use date.
  DECISION 10: first month convention — proposed **full month if available for use on or
  before the 15th, otherwise from the next month**; alternatives: daily pro-rata or full
  month regardless.
- Residual value and useful life per asset, reviewed manually.
- Disposal: remove cost and accumulated depreciation, record proceeds, gain/loss to P&L.

## 12. Opening balances

- Opening-balance batch at a cut-over date: GL balances, AR and AP per open invoice, stock
  quantities and costs per product/location, fixed assets with accumulated depreciation.
- Batch must balance; any difference must be explicitly posted to an "Opening balance
  equity" account and is reported. Subledger totals must match their control accounts
  before the batch can post.
