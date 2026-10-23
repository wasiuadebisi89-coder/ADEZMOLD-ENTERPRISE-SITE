# Phase 5 acceptance tests — customers and sales

Each item is covered by an automated test. Domain rules are unit-tested in
`packages/domain/src/sales.test.ts`; integration tests run the real command pipeline against
the Firestore and Auth emulators (`tests/integration/phase5.test.ts`); rules tests run against
`firestore.rules` (`tests/rules/firestore.rules.test.ts`, "sales records (Phase 5)"); end-to-end
tests drive the web app (`tests/e2e/phase5.spec.ts`).

## S1 Tax codes and customers

- S1.1 No tax rate is preset. Tax codes are entered by someone with `ledger.accounts.manage`;
  rates are stored in basis points (7.5% = 750) and codes are unique.
- S1.2 Only `sales.customers.manage` (Admin, Manager, Accountant) can create or change
  customers; sales officers cannot.

## S2 Sales at the till

- S2.1 A sale (`SI-…`) posts Dr cash or bank / Cr Revenue (net) / Cr Output tax, and Dr Cost
  of goods sold / Cr Inventory at the costing method's cost, and takes the goods out of the
  chosen store.
- S2.2 Payment can be split across cash and bank accounts.
- S2.3 Tax is calculated and rounded per line. With tax-inclusive prices the tax is taken out
  of the price; exclusive is the default.
- S2.4 A walk-in sale must be paid in full; overpayment is refused (change is not recorded).
- S2.5 Selling more than is in stock, or from a quarantine location, is refused.
- S2.6 Retrying the same request does not sell twice.

## S3 Prices and discounts

- S3.1 Only `sales.priceOverride` can change the price or give a discount; both prices are
  kept on the line.
- S3.2 A product with no selling price needs a price entered by someone allowed to.

## S4 Credit sales and limits

- S4.1 A credit sale within the limit leaves the amount owed on the customer, due after their
  payment terms.
- S4.2 A sale over the limit is refused unless the seller holds `sales.creditLimit.override`
  or a manager approved a `sales.creditOverride` request covering the amount (used once).
- S4.3 A limit of 0 means cash only; advances count against the balance.

## S5 Customer receipts

- S5.1 A receipt (`CR-…`) settles the allocated invoices and keeps the rest as a customer
  advance, which can be applied to invoices later.
- S5.2 Allocations to another customer's invoices are refused.

## S6 Opening balances, branch scope and access

- S6.1 A customer opening balance posts Dr Trade receivables / Cr Opening balance equity.
- S6.2 Sales officers can only sell from stores in their branches.
- S6.3 After a mixed run, customer balances equal Trade receivables and advances equal
  Customer advances.
- S6.4 Clients cannot write any sales record. Sales officers see stock availability, tax codes
  and customers but not stock values, and only their own sales and receipts.
- S6.5 Web: tax code → walk-in sale with change → credit sale → payment with an advance →
  customer balance and stock card, with no accessibility violations; a cash-only customer is
  warned before the sale; the sale screen fits a phone screen.
