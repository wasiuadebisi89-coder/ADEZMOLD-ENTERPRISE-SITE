# BMS — Accounting policies (Phase 0)

Status: **Draft for review.** Items marked **DECISION** need the owner's confirmation
(#1 and #4 confirmed 2026-10-23);
the value shown is the proposed safe default, not a fact. No tax rate is hard-coded:
tax codes and rates are entered per company by an authorised user.

Reference framework (DECISION 1, **confirmed**): **IFRS for SMEs** principles, configurable per
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
  (DECISION 4, **confirmed: 3 days**) require approval: a `ledger.backdate` request for
  that date, raised by the person posting and approved by someone else; it is used once. Future-dated postings beyond today are
  rejected.
- Year-end close transfers income and expense balances to retained earnings via a system
  journal (Phase 7).

## 3. Double entry and immutability

- Every posted journal balances, has ≥ 2 lines, uses active postable accounts.
- Posted journals and documents are never edited or deleted. Corrections: full reversal
  (mirror journal dated in an open period, linked both ways) and, if needed, a new
  correcting entry.
- Control accounts (AR, AP, inventory, GRNI) accept postings only from their subledger
  modules, never from manual journals or the general opening-balance journal.
- Reversals are dated on or after the original, in an open period. Only manual and opening
  journals are reversed from the ledger; module postings are reversed through their source
  document. A reversal cannot itself be reversed (post a new journal instead).

## 4. Inventory

- Perpetual inventory system.
- Costing method per company, chosen before the first stock posting and then locked
  (DECISION 5, **confirmed**: moving weighted average by default; FIFO available).
- Cost is tracked per product and location. Weighted average re-averages on every addition;
  FIFO issues the oldest layer first. Values are rounded to the minor unit per movement, and
  an issue that empties a location takes its exact remaining value.
- Negative stock is not allowed. A posting that would take any line below zero is refused
  and the request stays pending.
- Inventory is measured at cost; cost includes purchase price net of trade discounts plus
  **eligible** landed costs (§6). Recoverable taxes are excluded from cost.
- Write-downs to net realisable value: manual adjustment with approval (not automated).
- Stock adjustments and count variances post to 5200 Inventory adjustments against 1300
  Inventory. Every adjustment, count and opening-stock entry needs approval by a second
  person with the approve permission (DECISION 6, **confirmed**). It is posted on the date
  it is approved, not the date it was raised.
- Found stock (an increase with no cost entered) is valued at the current average cost of
  that product and location; if there is no stock to average from, a cost must be entered.
- Stock counts record the system quantity when the count is entered; the posted difference
  is counted minus that snapshot.
- Opening stock is valued at the cost entered and credited to 3300 Opening balance equity.

## 5. Purchases

- Goods are received first: Dr 1300 Inventory / Cr 2150 **GRNI** (goods received not
  invoiced) at the unit cost entered on the receipt. There are no purchase orders yet, so the
  receipt cost is what the buyer expects to be invoiced.
- The supplier's invoice is matched to receipt lines. For each line it releases GRNI at the
  received cost (cumulatively, so partial invoices never release more than was received) and
  credits 2100 Trade payables with the invoiced amount.
- A difference between the invoiced amount and the received cost goes to stock for the share
  of those goods still on hand and to 5100 Cost of goods sold for the rest. "Still on hand"
  is exact under FIFO (what remains of that receipt's cost layer); under weighted average it is
  the smaller of the invoiced quantity and the quantity now at the receipt's location. Stock
  value never goes below zero; anything beyond goes to cost of sales.
- Invoice lines for services and other costs debit the account chosen (any active, non-control
  posting account).
- **Input tax** is recorded only as the amount the supplier shows on the invoice, debited to
  1400 Input tax recoverable. Nothing is calculated, and no rates are set (DECISION 9).
- A supplier invoice number is unique per supplier (ignoring case and spaces).
- Due date: the invoice date plus the supplier's payment terms, unless one is entered.
- Supplier payment: Dr 2100 Trade payables for the amount allocated to invoices, Dr 1350
  Advances to suppliers for any remainder, Cr the cash or bank account paid from. An advance
  can be applied to invoices later (Dr Trade payables / Cr Advances, dated the day it is
  applied). Payments are posted directly; see DECISION 16.
- Supplier return, goods not yet invoiced: Dr GRNI at the received cost / Cr Inventory at the
  costing method's current cost; the difference goes to 5300 Purchase price variance.
- Supplier return, goods already invoiced: Dr Trade payables at the invoiced price (reducing
  what is owed on that invoice) / Cr Inventory at current cost; the difference goes to 5300.
  A credit larger than what is still owed on the invoice is refused until supplier refunds
  exist.
- Supplier opening balances: each unpaid invoice from before go-live is recorded as Dr 3300
  Opening balance equity / Cr Trade payables.

## 6. Landed costs

- A charge on a supplier invoice (from the goods' supplier or another, such as a freight
  forwarder) can be added to the cost of one goods receipt instead of being expensed. The
  buyer chooses this per charge; charges such as outward delivery should be entered as
  expenses.
- The charge is spread over the receipt's lines by value (default) or by quantity. Weight is
  not supported yet. Parts always sum exactly to the charge.
- Each line's share goes to stock for the part of that line still on hand and to cost of sales
  for the rest, as for price differences (§5).

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

- Phase 2 builds the general-ledger part: one opening journal per company (reversible, then
  re-enterable), with the difference posted to the account whose role is opening balance
  equity.
- Opening-balance batch at a cut-over date: GL balances, AR and AP per open invoice, stock
  quantities and costs per product/location, fixed assets with accumulated depreciation.
- Batch must balance; any difference must be explicitly posted to an "Opening balance
  equity" account and is reported. Subledger totals must match their control accounts
  before the batch can post.
