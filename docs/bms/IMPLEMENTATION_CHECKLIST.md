# Implementation checklist

Legend: [ ] not started · [~] in progress · [x] done and verified in CI

## Phase 0 — Architecture
- [x] Repository inspection (placeholder site at 8f08dce; move to apps/site proposed)
- [x] Architecture, module boundaries, command pipeline
- [x] Data model and numeric representation
- [x] Accounting policies draft with open decisions
- [x] Default role matrix
- [x] Phase 1 acceptance tests
- [ ] Owner review of Phase 0 and open decisions

## Phase 1 — Shell, auth, tenancy, roles, settings, periods, CI
- [ ] pnpm monorepo, TS strict, ESLint, Prettier, pinned deps, lockfile
- [ ] Firebase config + emulators (auth, firestore, functions, storage)
- [ ] packages/domain: money, quantity, rounding, permissions catalogue, period rules
- [ ] packages/schemas: company, branch, member, invitation, role, period schemas
- [ ] Command framework: auth → tenant → authz → validate → idempotency → txn → audit
- [ ] company.create, branch.*, member.*, invitation.*, role.*, period.*, settings.update
- [ ] firestore.rules + storage.rules (deny by default, read-only clients)
- [ ] Rules tests (C1–C7, G2), integration tests (A–G), unit tests (E1, E2, F4, F5, H)
- [ ] Web shell: auth screens, company switcher, responsive layout, settings screens
- [ ] Playwright smoke + accessibility checks
- [ ] GitHub Actions CI, gitleaks
- [ ] PROGRESS.md updated with test evidence

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
