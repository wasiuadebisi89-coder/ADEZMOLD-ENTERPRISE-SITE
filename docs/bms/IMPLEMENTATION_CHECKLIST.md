# Implementation checklist

Legend: [ ] not started · [~] in progress · [x] done and verified in CI

## Phase 0 — Architecture

- [x] Repository inspection (placeholder site at 8f08dce; move to apps/site proposed)
- [x] Architecture, module boundaries, command pipeline
- [x] Data model and numeric representation
- [x] Accounting policies draft with open decisions
- [x] Default role matrix
- [x] Phase 1 acceptance tests
- [~] Owner review of Phase 0 and open decisions (repo and site move approved 2026-10-23; policy defaults still to confirm)

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
- [~] GitHub Actions CI and gitleaks (workflow written; first run happens on the PR)
- [x] PROGRESS.md updated with test evidence

## Phase 2 — Ledger

- [ ] Chart of accounts + template, account mappings
- [ ] Posting engine (journal + ledger entries), reversals, manual journals
- [ ] Opening-balance batch workflow (durable, chunked)
- [ ] Period close snapshots, trial balance foundation

## Phases 3–9

- [ ] 3 Catalogue, inventory, costing, adjustments
- [ ] 4 Suppliers, purchases, receipts, payments, supplier returns, landed costs
- [ ] 5 Customers, POS, cash/credit sales, receipts, allocations
- [ ] 6 Sales returns, credit notes, refunds, approvals, reconciliations
- [ ] 7 Reports, financial statements, fixed assets
- [ ] 8 Security review, load/concurrency tests, monitoring, backups, recovery drill, deploy
- [ ] 9 Services and production modules
