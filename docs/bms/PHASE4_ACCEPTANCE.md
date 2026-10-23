# Phase 4 acceptance tests — suppliers and purchasing

Each item is covered by an automated test. Domain rules are unit-tested in
`packages/domain/src/purchasing.test.ts`; integration tests run the real command pipeline
against the Firestore and Auth emulators (`tests/integration/phase4.test.ts`); rules tests run
against `firestore.rules` (`tests/rules/firestore.rules.test.ts`, "purchasing records");
end-to-end tests drive the web app (`tests/e2e/phase4.spec.ts`).

## P1 Suppliers

- P1.1 Supplier codes are unique; only `purchasing.suppliers.manage` (Admin, Manager,
  Accountant) can create or change suppliers.
- P1.2 An inactive supplier cannot deliver goods or be invoiced.

## P2 Goods receipts

- P2.1 A receipt (`GRN-…`) puts stock in at the entered cost (weighted average or a new FIFO
  layer), posts Dr Inventory / Cr GRNI, writes stock movements and one audit entry, and
  locks the costing method.
- P2.2 Receipts need `purchasing.receipt.post` and a location inside the member's branch
  scope.

## P3 Supplier invoices

- P3.1 An invoice (`PI-…`) clears GRNI at the received cost for the quantity invoiced and
  owes the supplier the invoiced amount; the receipt shows partly invoiced, then complete.
- P3.2 Invoicing more than was received, or a supplier invoice number already recorded for
  that supplier (ignoring case and spaces), is refused and nothing is written.
- P3.3 A price difference goes to stock for goods still on hand and to cost of sales for the
  rest, under weighted average and under FIFO (where only that receipt's layer is revalued).

## P4 Expenses, tax and landed costs

- P4.1 Expense lines debit the chosen account; control accounts are refused.
- P4.2 Input tax is posted as entered to Input tax recoverable.
- P4.3 A landed cost spreads over the receipt's lines by value or quantity, parts summing
  exactly, and raises stock value.

## P5 Payments

- P5.1 A payment (`SP-…`) settles the allocated invoices, keeps any remainder as a supplier
  advance, and credits the cash or bank account chosen; other accounts are refused.
- P5.2 Allocating more than an invoice owes, or more than the payment, is refused.
- P5.3 An advance can be applied to invoices later; the invoice shows paid.
- P5.4 Payments need `purchasing.payment.post`.

## P6 Returns

- P6.1 Returning goods not yet invoiced (`SR-…`) releases GRNI at the received cost, takes
  stock out at current cost, and posts the difference to purchase price variance.
- P6.2 Returning invoiced goods credits the invoiced price against that invoice and the
  supplier's balance; returning more than was invoiced is refused.
- P6.3 A credit larger than what is still owed on the invoice is refused and nothing moves.

## P7 Opening balances and branch scope

- P7.1 A supplier opening balance posts Dr Opening balance equity / Cr Trade payables and
  raises the supplier's balance.
- P7.2 Staff limited to one branch cannot receive at another.

## P8 Invariants and access

- P8.1 After a mixed run, supplier balances equal Trade payables, advances equal Advances to
  suppliers, uninvoiced receipt value equals GRNI, and stock value equals Inventory.
- P8.2 Clients cannot write any purchasing record; supplier invoice-number keys are
  server-only; sales officers and other companies cannot read purchasing records; auditors
  can.
- P8.3 Web: supplier → receipt → matched invoice with an expense charge → payment with an
  advance → supplier balance and stock card, with no accessibility violations; a return of
  goods not yet invoiced; the invoice form fits a phone screen.
