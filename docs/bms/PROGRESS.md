# Progress log

## 2026-10-23 — Phase 0 drafted

- Repo adezmold-enterprise-site inspected (placeholder site only); Phase 0 documents drafted: ARCHITECTURE, DATA_MODEL,
  ACCOUNTING_POLICIES, ROLES, PHASE1_ACCEPTANCE, OPEN_DECISIONS, ADRs 0001–0006.
- No code written, no tests run yet.
- Next: owner review, then Phase 1.

## 2026-10-23 — Phase 1 implemented (pending review)

Owner approved the repository, the move of the existing site to `apps/site/`, and proceeding
on the proposed policy defaults.

**Built**

- pnpm workspace; exact-pinned dependencies; `pnpm-lock.yaml` committed.
- `packages/domain`: integer money (bigint), half-away-from-zero rounding, exact allocation,
  fiscal year planning, `assertPostingAllowed`, period transition rules, permission catalogue
  and six system role templates.
- `packages/schemas`: Zod schemas for all 18 commands, shared by web and functions.
- `functions`: single callable `api`; pipeline = Auth user check (disabled / revoked
  sessions) → Zod validation → membership + permission check → idempotency record →
  handler → audit entry, all in one Firestore transaction.
- Commands: company create/update settings, branch create/update, role create/update/delete,
  invitation create/revoke/accept, member update/status, period status, fiscal year create,
  approval request/decide, platform support read, sign out everywhere.
- `firestore.rules` and `storage.rules`: deny by default, clients read-only.
- Web app: sign up, email verification, sign in, password reset, company list and creation,
  invitation acceptance, responsive shell, overview, users and invitations, roles, branches,
  financial periods with reopen approvals, settings, audit log.
- GitHub Actions CI: format, lint, typecheck, unit, build, emulator tests, Playwright, gitleaks.

**Verified (run locally on 2026-10-23, Node 22.22.0, Firebase emulators from firebase-tools 15.34.1)**

| Check                                          | Result                               |
| ---------------------------------------------- | ------------------------------------ |
| `pnpm format:check`, `pnpm lint`               | clean                                |
| `pnpm typecheck` (all 5 packages)              | clean                                |
| `pnpm build` (functions bundle, web)           | succeeds                             |
| `pnpm test:unit`                               | 54 passed                            |
| `pnpm test:emulator` (rules + integration)     | 71 passed (43 rules, 28 integration) |
| `pnpm test:e2e` (Playwright, desktop + mobile) | 6 passed                             |

GitHub Actions has not run yet; the first run happens on the Phase 1 pull request.

**Acceptance coverage (PHASE1_ACCEPTANCE.md)**: A1–A5, B1–B5, C1–C7, D1–D6, E1–E3, E5, E6,
F1–F6, G1–G3, H1–H2, I1–I3 covered by automated tests. E4 is partly covered (branch scope
validated and stored; enforcement arrives with the first branch-scoped command, see
KNOWN_LIMITATIONS.md). I4/I5 are configured in CI and need the first CI run to confirm.

**Bugs found by tests and fixed**: empty optional fields were sent as `null` by the callable
encoding and rejected by the server schema; an empty trading name failed client validation;
live lists could briefly show a partial list from the local cache (for example 1 of 12
periods), so screens now wait for the server's first answer.

**Next**: owner review of Phase 1 and the open policy decisions, then Phase 2 (chart of
accounts, posting engine, journals, opening balances).

## 2026-10-23 — Phase 1 merged; Phase 2 ledger implemented (pending review)

Owner merged Phase 0 and Phase 1 (all four CI jobs green) and confirmed OPEN_DECISIONS #1
(IFRS for SMEs) and #4 (3-day backdating window), then asked to proceed with Phase 2.

**Built**

- `packages/domain`: ledger rules (`assertValidJournal`, `reverseLines`,
  `openingBalanceDifference`, `trialBalance`), account types and roles, control-account rule,
  and the draft trading chart of accounts (CHART_OF_ACCOUNTS.md).
- Posting engine (`functions/src/lib/posting.ts`): one path for every journal. It checks
  branch scope, accounts, balance, period status, the backdating window and approvals, then
  writes the journal, its ledger entries, the number series, first-posting locks (currency,
  financial-year start) and consumes the approval, all in the command's transaction.
- Commands (24 in total): `chart.applyTemplate`, `account.create`, `account.update`,
  `journal.post`, `journal.reverse`, `openingBalance.post`; `approval.request` and
  `approval.decide` now also handle `ledger.backdate`.
- New companies get the trading chart automatically.
- Rules: accounts readable with `ledger.accounts.read`; journals and ledger entries with
  `ledger.journal.read` or `reports.financial.read`; number series server-only; no client
  writes. Indexes for balance sums and backdating requests.
- Web: chart of accounts (tree, add, edit, deactivate), journals list, new journal with live
  totals and out-of-balance warning, journal detail with reversal, opening balances with the
  equity difference shown, trial balance as at any date, approvals page for backdating and
  reopen requests.

**Verified (run locally on 2026-10-23, Node 22.22.0, firebase-tools 15.34.1)**

| Check                                          | Result                                        |
| ---------------------------------------------- | --------------------------------------------- |
| `pnpm format:check`, `pnpm lint`               | clean                                         |
| `pnpm typecheck` (all 5 packages)              | clean                                         |
| `pnpm build`                                   | succeeds                                      |
| `pnpm test:unit`                               | 81 passed                                     |
| `pnpm test:emulator` (rules + integration)     | 105 passed (58 rules, 47 integration; 34 new) |
| `pnpm test:e2e` (Playwright, desktop + mobile) | 8 passed                                      |

CI runs on the Phase 2 pull request.

**Acceptance coverage (PHASE2_ACCEPTANCE.md)**: L1–L6 covered by automated tests.

**Bug found by tests and fixed**: on a phone, the journal-lines table pushed the page 158 px
wider than the screen, because its screen-reader-only header escaped the scroll container.
Scroll containers are now positioned so the page never scrolls sideways.

**Next**: owner review of the chart of accounts (OPEN_DECISIONS #14), then Phase 3
(catalogue, inventory, costing, adjustments), which needs decisions #5 (costing method) and
#6 (adjustment approvals).

## 2026-10-23 — Phase 2 merged; Phase 3 inventory implemented

Owner merged Phase 2 (CI green), confirmed OPEN_DECISIONS #14 (trading chart), #5 (moving
weighted average, FIFO optional) and #6 (every stock adjustment approved by a second person),
and asked to proceed with Phase 3.

**Built**

- `packages/domain`: quantities in milli-units, unit costs in minor units × 10⁴, the unit
  list, quantity and cost parsing, weighted-average receive/issue, FIFO issue across layers.
- Commands (32 in total): `location.create/update`, `category.create/update`,
  `product.create/update`, `stockAdjustment.create`, `stockAdjustment.decide`;
  `company.updateSettings` now sets the costing method until it is locked.
- Stock adjustments of three kinds (adjustment `ADJ`, count `CNT`, opening stock `OST`). On
  approval, one transaction writes stock balances, movements, cost layers, the journal
  (through the same posting engine as Phase 2, origin `system`), the costing-method lock and
  the audit entry.
- Rules: products and categories readable with `inventory.products.read`; locations by any
  member; balances, movements and adjustments with stock access; cost layers server-only;
  no client writes. Indexes for layers, movements and balances.
- Web: products with on-hand and value, product dialog and categories, stock card per
  product, adjustments list, new adjustment form, approve/reject, costing method in Settings.

**Verified (run locally on 2026-10-23, Node 22.22.0, firebase-tools 15.34.1)**

| Check                                          | Result                                        |
| ---------------------------------------------- | --------------------------------------------- |
| `pnpm format:check`, `pnpm lint`               | clean                                         |
| `pnpm typecheck` (all 5 packages)              | clean                                         |
| `pnpm test:unit`                               | 93 passed                                     |
| `pnpm test:emulator` (rules + integration)     | 134 passed (75 rules, 59 integration; 29 new) |
| `pnpm test:e2e` (Playwright, desktop + mobile) | 10 passed                                     |

CI runs on the Phase 3 pull request.

**Acceptance coverage (PHASE3_ACCEPTANCE.md)**: I1–I8 covered by automated tests.

**Next**: Phase 4 (suppliers, purchases, goods received, supplier invoices and payments,
supplier returns, landed costs).

## 2026-10-23 — Phase 3 merged; Phase 4 purchasing implemented (pending CI)

Owner merged Phase 3 (PR #4, all four CI checks green) and asked to proceed with Phase 4.

**Built**

- `packages/domain`: GRNI clearing (cumulative, never over-releases), price-difference split
  between stock and cost of sales, landed-cost spreading by value or quantity, allocation
  checks.
- Shared stock engine (`functions/src/lib/stock.ts`) used by every stock movement; stock
  adjustments were moved onto it with their Phase 3 tests unchanged and passing.
- Commands (40 in total): `supplier.create/update`, `goodsReceipt.post`,
  `purchaseInvoice.post`, `supplierOpeningBalance.post`, `supplierPayment.post`,
  `supplierPayment.allocate`, `supplierReturn.post`. New permission
  `purchasing.suppliers.manage` (Admin, Manager, Accountant).
- Rules: purchasing records readable with `purchasing.read`; supplier invoice-number keys
  server-only; no client writes. Indexes for supplier documents, open receipts and open
  invoices.
- Web: suppliers list and page (balances, invoices, receipts, payments, returns, opening
  balance), purchases hub with tabs, receive goods, record invoice (match receipts, add
  charges, landed costs, input tax), pay supplier (allocate oldest first, advances), apply an
  advance, return goods; stock card links to purchasing documents.

**Verified (run locally on 2026-10-23, Node 22.22.0, firebase-tools 15.34.1)**

| Check                                          | Result                                        |
| ---------------------------------------------- | --------------------------------------------- |
| `pnpm format:check`, `pnpm lint`               | clean                                         |
| `pnpm typecheck` (all 5 packages)              | clean                                         |
| `pnpm build`                                   | succeeds                                      |
| `pnpm test:unit`                               | 102 passed                                    |
| `pnpm test:emulator` (rules + integration)     | 170 passed (94 rules, 76 integration; 36 new) |
| `pnpm test:e2e` (Playwright, desktop + mobile) | 13 passed                                     |

CI runs on the Phase 4 pull request.

**Acceptance coverage (PHASE4_ACCEPTANCE.md)**: P1–P8 covered by automated tests.

**Needs the owner**: OPEN_DECISIONS #16 (supplier payments post without a second approval).

**Next**: Phase 5 (customers, POS, cash and credit sales, receipts, allocations), which needs
decisions #7 (credit limits), #8 (tax rounding) and #9 (tax-inclusive prices and rates).

## Phase 5 — customers and sales (2026-10-23)

Owner merged Phase 4 (PR #5), confirmed decisions #7, #8, #9 and #16, and asked to proceed.

**Built**

- `packages/domain`: per-line sales maths (discounts, tax-exclusive and tax-inclusive prices,
  rounding to the minor unit), tax rate parsing in basis points, credit-limit check.
- Commands (48 in total): `taxCode.create/update`, `customer.create/update`,
  `salesInvoice.post`, `customerOpeningBalance.post`, `customerReceipt.post`,
  `customerReceipt.allocate`; new approval `sales.creditOverride`. New permissions
  `sales.customers.manage` and `sales.creditLimit.override`. Company setting for
  tax-inclusive prices.
- Stock availability (quantities only) kept per product and location so the till can show it
  without revealing stock values.
- Rules: sales officers read only their own sales and receipts; no client writes. New indexes.
- Web: till (walk-in by default, availability, change, part payment, credit-limit notice and
  request), sales hub, sale page with print, customers list and page, receive payment, apply
  an advance, tax codes, price setting.

**Verified (run locally on 2026-10-23, Node 22.22.0, firebase-tools 15.34.1)**

| Check                                          | Result              |
| ---------------------------------------------- | ------------------- |
| `pnpm format:check`, `pnpm lint`               | clean               |
| `pnpm typecheck` (all 5 packages)              | clean               |
| `pnpm build`                                   | succeeds            |
| `pnpm test:unit`                               | 114 passed          |
| `pnpm test:emulator` (rules + integration)     | 209 passed (39 new) |
| `pnpm test:e2e` (Playwright, desktop + mobile) | 16 passed           |

CI runs on the Phase 5 pull request.

**Acceptance coverage (PHASE5_ACCEPTANCE.md)**: S1–S6 covered by automated tests.

**Next**: Phase 6 (returns, credit notes, refunds), which also gives a way to undo a wrong
sale.
