# Phase 9 acceptance — services and production

Policies: ACCOUNTING_POLICIES.md §15 and §16, DECISIONS 19–22. Every item is covered by an
automated test named in brackets.

## V Services

- V1.1 A service item cannot be received, adjusted, counted or given a reorder level.
  (integration `services.test.ts` V1)
- V1.2 A sale of goods and services posts goods to 4100 with cost of sales, services to 4200
  with no cost, and no stock movement for the service. (V1)
- V1.3 A credit note for a service line reverses the service revenue with nothing returned to
  stock or quarantine. (V1)
- V2.1 Sales, purchase invoices and journals tagged with a project carry the tag on their
  ledger entries; untagged postings stay out of the project. (V2)
- V2.2 A completed project takes no new postings; a tagged journal can still be reversed and
  the project nets to zero. (V2)
- V2.3 A customer's project cannot be billed to another customer; project codes are unique;
  only `projects.manage` creates projects. (V2)
- V3.1 A quotation posts nothing and is numbered QT-000001; quoting another price or a
  discount needs `sales.priceOverride`. (V3)
- V3.2 A draft quotation cannot be invoiced; once sent, a sales officer invoices it at the
  quoted prices, and it is then marked invoiced and cannot be invoiced again. (V3)
- V3.3 Quotation statuses only move forward; a declined quotation or another customer's
  cannot be invoiced. (V3)
- V4 In the app: a service product, a project, a quotation sent and invoiced from the quote,
  the service badge on the sale and the project's margin; no accessibility violations.
  (e2e `phase9.spec.ts` S1)

## P Production

- P1.1 A bill lists stock components only, never the product itself or a service, each once;
  stopped bills cannot start orders. (integration `production.test.ts` P1)
- P2.1 Materials issued debit 1320 and credit 1300 at cost; unused materials come back at
  what they cost the order. (P2)
- P2.2 A direct cost debits 1320 and credits the chosen account; control and income accounts
  are refused; only `production.cost.post` charges costs. (P2)
- P2.3 Completing with normal and abnormal loss: finished goods receive cost less the abnormal
  share (700,000 × 5 ÷ 195 = 17,949 written off to 5200), WIP returns to zero. (P2)
- P2.4 Components not on the bill, more than is in stock, returning more than was issued and
  completing an order with no cost are refused; a closed order takes nothing more. (P2)
- P2.5 Cancelling an order with cost needs an expense account and writes the cost off. (P2)
- P3 Bills and orders are readable only with `production.read`; no client writes.
  (rules `firestore.rules.test.ts`)
- P4 In the app: a bill of materials, an order, materials issued at the suggested quantity,
  labour added, and completion at 3,500; no accessibility violations. (e2e P1)
