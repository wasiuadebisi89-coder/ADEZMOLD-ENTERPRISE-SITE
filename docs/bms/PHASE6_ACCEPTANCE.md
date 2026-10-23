# Phase 6 acceptance tests — returns, refunds and bank reconciliation

Each item is covered by an automated test. Domain rules are unit-tested in
`packages/domain/src/sales.test.ts` ("return share"); integration tests run the real command
pipeline against the Firestore and Auth emulators (`tests/integration/phase6.test.ts`); rules
tests run against `firestore.rules` (`tests/rules/firestore.rules.test.ts`, "returns, refunds
and bank reconciliation (Phase 6)"); end-to-end tests drive the web app
(`tests/e2e/phase6.spec.ts`).

## R1 Returns on credit sales

- R1.1 A return (`CN-…`) puts the goods back at the cost they were sold at, reverses the
  returned share of revenue and tax, and reduces what the customer owes on that sale. One
  audit entry is written and the journal names the credit note.
- R1.2 Returns never exceed what was sold less what was already returned; partial returns
  add up exactly to the sale line once everything is back.
- R1.3 Retrying the same request does not return twice.
- R1.4 Opening-balance invoices cannot be returned.

## R2 Customer credit

- R2.1 Credit beyond what is owed on the sale is kept as a customer advance.
- R2.2 A refund (`RF-…`) pays back part or all of an unused credit note or receipt, never more
  than is left, and only from a cash or bank account.
- R2.3 Unused credit can be applied to the customer's other invoices; refunds and
  applications together never exceed the credit.

## R3 Walk-in returns

- R3.1 A walk-in return pays the customer back at once from the account chosen; revenue, cash
  and stock return to where they were before the sale.
- R3.2 A customer's credit cannot be paid out on the return itself; it stays on their
  account until refunded.

## R4 Damaged goods

- R4.1 Damaged goods go to an active quarantine location at the sale's branch, at their sold
  cost; a store location is refused.

## R5 Approvals

- R5.1 A sales officer's return waits for a manager: nothing moves until it is approved;
  sales officers and accountants cannot approve it; once approved it posts that day; a
  decided return cannot be decided again; a rejected one moves nothing.
- R5.2 A pending return is re-checked when approved, so goods returned meanwhile cannot come
  back twice.
- R5.3 A sales officer's refund waits for a manager; nobody approves their own refund.

## R6 Ledger in step

- R6.1 After a mix of sales, returns and refunds, customer balances equal Trade receivables,
  their advances equal Customer advances, and stock value equals Inventory.

## R7 Bank reconciliation

- R7.1 Entries ticked must add up, with those cleared before, to the statement balance; each
  entry is cleared once; statements go forward in date; only `ledger.bank.reconcile` holders
  can reconcile.
- R7.2 Only cash and bank accounts, and only entries on that account, can be reconciled.

## R8 Access and web

- R8.1 Clients cannot write returns, refunds or reconciliation records; sales officers read
  only the returns and refunds they raised; bank records are for ledger readers.
- R8.2 Web: credit sale → return → lower amount owed and the return on the stock card;
  walk-in damaged return paid back; customer credit part refunded; bank reconciliation
  finished when the difference is zero; no accessibility violations; the return screen fits a
  phone screen.
