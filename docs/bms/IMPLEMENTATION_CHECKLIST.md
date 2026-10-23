# Implementation checklist

Legend: [ ] not started · [~] in progress · [x] done and verified in CI

## Phase 0 — Architecture

- [x] Repository inspection (placeholder site at 8f08dce; move to apps/site proposed)
- [x] Architecture, module boundaries, command pipeline
- [x] Data model and numeric representation
- [x] Accounting policies draft with open decisions
- [x] Default role matrix
- [x] Phase 1 acceptance tests
- [x] Owner review of Phase 0 (approved and merged 2026-10-23; decisions #1 and #4 confirmed, others still on defaults)

## Phase 1 — Shell, auth, tenancy, roles, settings, periods, CI

- [x] pnpm monorepo, TS strict, ESLint, Prettier, exact-pinned deps, lockfile
- [x] Firebase config + emulators (auth, firestore, functions, storage, hosting)
- [x] packages/domain: money, rounding, allocation, permissions catalogue, period rules
- [x] packages/schemas: company, branch, member, invitation, role, period, approval schemas
- [x] Command framework: auth → validate → tenant → authz → idempotency → txn → audit
- [x] 18 commands: `company.*`, `branch.*`, `role.*`, `invitation.*`, `member.*`, `period.setStatus`, `fiscalYear.create`, `approval.*`, `platform.supportRead`, `session.revokeAll`
- [x] firestore.rules + storage.rules (deny by default, read-only clients)
- [x] Rules tests (C1–C4, C6, C7, G2), integration tests (A, B, C5, D, E, F, G), unit tests (E1, E2, F4, F5, H)
- [x] Web: auth screens, company list/switcher, responsive shell, users, roles, branches, periods, settings, audit log
- [x] Playwright end-to-end + axe accessibility checks
- [x] GitHub Actions CI and gitleaks (green on PR #2, merged 2026-10-23)
- [x] PROGRESS.md updated with test evidence

## Phase 2 — Ledger

- [x] Chart of accounts + trading template (confirmed, CHART_OF_ACCOUNTS.md); role lookup by account subtype instead of a separate mappings document
- [x] Posting engine (journal + ledger entries), reversals, manual journals, backdating approvals
- [x] General-ledger opening balances (one journal). Durable, chunked batches arrive with the subledgers that need them (Phases 3–5)
- [x] Trial balance from ledger-entry sums. Period-close snapshots deferred (KNOWN_LIMITATIONS.md)

Green in CI on PR #3 and merged.

## Phase 3 — Catalogue and inventory

- [x] Locations (store and quarantine per branch), categories, products
- [x] Stock balances, movements and FIFO cost layers; moving weighted average or FIFO, locked after the first stock posting
- [x] Stock adjustments, counts and opening stock, each approved by a second person and posted to the ledger in the same transaction
- [x] Products, stock card and adjustment screens; costing method in Settings
- [ ] Location transfers, unit conversions, barcodes (later phases, KNOWN_LIMITATIONS.md)

Green in CI on PR #4 and merged.

## Phase 4 — Suppliers and purchasing

- [x] Suppliers with payment terms, balances and advances; supplier opening balances
- [x] Goods receipts into stock against GRNI
- [x] Supplier invoices matched to receipts, with price differences split between stock and cost of sales; expense lines; entered input tax
- [x] Landed costs spread over a receipt by value or quantity
- [x] Supplier payments with allocation, advances and later application
- [x] Returns to suppliers, before or after invoicing
- [x] Screens for all of the above; one shared stock engine for every stock movement
- [ ] Purchase orders, supplier refunds, debit notes, weight-based landed costs (later)

Green in CI on PR #5 and merged.

## Phase 5 — Customers and sales

- [~] Tax codes per company, no rate preset; prices including or excluding tax by company setting; tax per line
- [~] Customers with payment terms, credit limits, balances and advances; customer opening balances
- [~] Sales at the till and on credit in one document, with part payment, change, walk-in customers and stock taken out at cost
- [~] Credit limits enforced, with a manager's single-use approval or the override permission
- [~] Price changes and discounts limited to `sales.priceOverride`
- [~] Customer receipts with allocation, advances and later application
- [~] Stock availability (quantities only) for sales staff; sales officers see only their own sales
- [~] Screens for all of the above, and credit requests on the Approvals page
- [ ] Sales returns, credit notes and refunds (Phase 6); receipts printing to thermal printers, barcode scanning, shifts and cash-up (later)

`[~]` = verified locally; becomes `[x]` once green in CI on the Phase 5 pull request.

## Phases 6–9

- [ ] 6 Sales returns, credit notes, refunds, approvals, reconciliations
- [ ] 7 Reports, financial statements, fixed assets
- [ ] 8 Security review, load/concurrency tests, monitoring, backups, recovery drill, deploy
- [ ] 9 Services and production modules
