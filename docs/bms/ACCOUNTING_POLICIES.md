# BMS — Accounting policies (Phase 0)

Status: **Draft for review.** Items marked **DECISION** need the owner's confirmation
(#1, #4–#9, #14 and #16 confirmed 2026-10-23; #17 and #18 proposed for Phase 6);
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

- One document, the sales invoice (`SI-…`), records every sale. Goods leave the chosen store
  location when it is posted, and revenue is recognised then: control passes at the till for
  walk-in sales and on delivery for credit sales, which happen together in this version.
- Line amount = quantity × price, rounded to the minor unit. A line discount is an amount
  off the line and reduces revenue (revenue is recorded net); there is no discount expense.
- The price is the product's selling price. A different price or any discount needs
  `sales.priceOverride` (Admin, Manager); both prices are kept on the line.
- Journal: Dr the cash or bank accounts for money taken at the sale, Dr 1200 Trade
  receivables for the rest, Cr 4100 Revenue (net), Cr 2200 Output tax; Dr 5100 Cost of goods
  sold / Cr 1300 Inventory at the costing method's cost. Paying part at the sale is one
  document, not a credit sale plus a receipt.
- A walk-in sale (no customer) must be paid in full. Money received above the total is change
  and is not recorded.
- Credit limit (DECISION 7, **confirmed**): a sale leaving an amount on credit is refused when
  the customer's balance, plus that amount, less their advances, would exceed their limit. A
  limit of 0 means cash only. It is allowed when the seller holds `sales.creditLimit.override`
  (recorded on the invoice and in the audit log), or with an approved `sales.creditOverride`
  request by the seller for that customer, covering at least that amount, used once.
- Due date: the sale date plus the customer's payment terms, unless one is entered.
- Customer receipt (`CR-…`): Dr Cash/Bank / Cr AR for the amount allocated to invoices, Cr
  2250 Customer advances for the rest. An advance can be applied to invoices later (Dr
  Customer advances / Cr AR, dated the day it is applied).
- Customer opening balances: each unpaid invoice from before go-live is Dr AR / Cr 3300
  Opening balance equity, posted by someone with `ledger.journal.post`.

## 8. Returns, credit notes and refunds

- A return (credit note, `CN-…`) is raised against a posted sale. Each line names the sale line
  and the quantity coming back, which cannot exceed what was sold less what was already
  returned. A reason is required; each line is marked as resalable or damaged. Opening-balance
  invoices cannot be returned.
- Goods go back at the cost they were sold at, not today's cost: the returned share of the
  sale line's cost of goods sold. Resalable goods go back to the store they were sold from;
  damaged goods to a quarantine location at the same branch, for a later approved write-off.
  Dr 1300 Inventory / Cr 5100 Cost of goods sold.
- The credit is the returned share of the line's revenue and tax (quantity returned ÷
  quantity sold, worked on the running total so partial returns add up exactly to the line):
  Dr 4100 Revenue, Dr 2200 Output tax. It first reduces what is still owed on that sale (Cr 1200
  Trade receivables). Any rest is held for the customer as a credit (Cr 2250 Customer advances)
  that can be applied to other invoices or paid back. A walk-in sale has no account to hold it,
  so the rest is paid back at once from the cash or bank account chosen.
- A refund (`RF-…`) pays back money a customer holds with us, from a specific unallocated
  receipt or credit note, up to what is left on it: Dr 2250 Customer advances / Cr Cash or
  Bank, dated the day it is posted.
- Approvals (DECISION 17, proposed): someone with `sales.return.post` (Managers, Admins) posts a
  return directly, and someone with `sales.refund.post` (Accountants, Managers, Admins) posts a
  refund directly. Sales officers raise them for approval; a manager approves and they post on
  the day of approval, re-checked against the sale as it is then. Nobody approves their own
  request, and every step is in the audit log.
- Returns have no time limit (DECISION 18, proposed); a company that wants one applies it as a
  policy for whoever approves.

## 9. Rounding

- Line totals rounded half-away-from-zero to minor units; document totals sum rounded
  lines; tax computed and rounded per line (DECISION 8, **confirmed**).
- Inventory value rounding residue from WAC goes to the last movement that empties the
  balance, so value reaches exactly zero when quantity reaches zero.

## 10. Tax

- Tax codes (code, name, rate) are configured per company by someone with
  `ledger.accounts.manage`. No rate is seeded. Output tax posts to the account with the Output
  tax role (2200). Companies not registered for VAT simply have no tax codes.
- Prices include or exclude tax per company (DECISION 9, **confirmed**: exclusive by
  default). Exclusive: tax = net × rate. Inclusive: tax = gross × rate ÷ (1 + rate), and net =
  gross − tax. Each sale records which applied and the rate used on each line, so changing a
  rate never changes posted sales.
- Input tax on purchases is still typed from the supplier's invoice (§5).

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

## 13. Bank reconciliation

- Each cash or bank account is reconciled to statements in date order. The ledger entries that
  appear on the statement are ticked off; with everything reconciled before, they must add up
  exactly to the statement's closing balance, or the reconciliation cannot be finished.
- Each ledger entry can be cleared once. Nothing is posted by reconciling: bank charges,
  interest or receipts on the statement that are not in the books are recorded first (a manual
  journal or the relevant document), then ticked.
- The first reconciliation of an account starts from zero, so it includes every entry up to
  the first statement, opening balance included.
