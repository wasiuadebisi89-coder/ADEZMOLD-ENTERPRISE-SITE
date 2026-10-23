# BMS — Architecture (Phase 0)

Status: **Draft for review** · Date: 2026-10-23

## 1. Repository inspection

Repository: `wasiuadebisi89-coder/adezmold-enterprise-site` (public), inspected 2026-10-23
at commit `8f08dce` ("Initial Adezmold enterprise platform release").

| File                                  | Content                                                          | Reuse                                    |
| ------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------- |
| `package.json`                        | Vite 5 + React 18 + Firebase 11, caret ranges, no lockfile       | Superseded by pinned workspace manifests |
| `src/App.jsx`                         | 5-line placeholder heading for the Commodity Control System site | Kept as the marketing site               |
| `firebase/firebase.config.example.js` | Firebase web config read from `VITE_*` env vars                  | Pattern reused in `apps/web`             |
| `.env.example`, `.gitignore`          | Firebase + GA variables; ignores `.env`                          | Kept and extended                        |
| `docs/DEPLOYMENT.md`, `README.md`     | Short site notes                                                 | Kept; BMS docs added alongside           |

There is no `index.html`, Vite config, lockfile, test or CI setup, so there is no working
build to preserve. Proposed change (needs owner approval before Phase 1): move the existing
site files unchanged into `apps/site/` and make the repository root a pnpm workspace that
hosts both the site and the BMS (`apps/web`, `functions`, `packages/*`). Nothing is
deleted; the move is recorded in ADR-0006.

**Visibility:** the repository is public, so all BMS source, rules and docs are publicly
readable. That is acceptable only because no secrets are ever committed (see §8), but a
private repository is still recommended for a commercial product.

## 2. Goals and non-goals

Goals for the platform core:

- Multi-tenant SaaS: one deployment, many companies, strict isolation.
- Trading business first (buy, stock, sell, return), with double-entry accounting from day one.
- Every financial or stock effect produced by a trusted server-side posting service.
- Core modules shaped so that services billing and production can be added later without
  rewriting company, permissions, parties, accounting or reporting.

Non-goals for Phases 1–8: multi-currency transactions, payroll, e-invoicing integrations,
bank feeds, offline POS. These are recorded in `KNOWN_LIMITATIONS.md` when relevant.

## 3. High-level shape

```
┌───────────────────────── Browser (React SPA) ─────────────────────────┐
│ apps/web   UI components · route screens · RHF+Zod forms · query hooks │
│            Reads: Firestore SDK (rules-guarded, read-only)             │
│            Writes: callable Cloud Functions (commands) only            │
└───────────────┬───────────────────────────────────┬───────────────────┘
                │ Firebase Auth ID token              │ Firestore reads
┌───────────────▼────────────────────┐   ┌────────────▼──────────────────┐
│ functions (Cloud Functions v2,     │   │ Cloud Firestore               │
│ Node 22, onCall + triggers)        │──▶│ companies/{companyId}/...     │
│  authz → validate → domain → post  │   │ security rules: deny by       │
│  idempotent commands, audit log    │   │ default; client writes denied │
└───────────────┬────────────────────┘   │ on all financial collections  │
                │                        └───────────────────────────────┘
        ┌───────▼────────┐  ┌──────────────────┐
        │ Cloud Storage   │  │ Cloud Scheduler   │ (depreciation runs,
        │ attachments     │  │ + Pub/Sub         │  reconciliation checks)
        └─────────────────┘  └──────────────────┘
```

### Monorepo layout (pnpm workspaces)

```
apps/web/                 React + Vite SPA
functions/                Cloud Functions (commands, triggers, schedulers)
packages/domain/          Pure TypeScript: money, quantities, posting rules,
                          costing, period logic, permission catalogue.
                          No Firebase imports. 100% unit-testable.
packages/schemas/         Zod schemas shared by web (forms) and functions
                          (authoritative validation). Types inferred from Zod.
packages/test-utils/      Emulator helpers, fixtures, seeded tenants
firestore.rules           Security rules
storage.rules             Storage rules
tests/rules/              Rules tests (@firebase/rules-unit-testing + emulator)
tests/integration/        Functions + Firestore emulator tests
tests/e2e/                Playwright against emulators
docs/                     Architecture, data model, policies, ADRs, progress log
```

Boundary rule: `apps/web` may import `schemas` and the read-only parts of `domain`
(formatting, permission names). Only `functions` imports posting services.

## 4. Module boundaries

| Module                | Owns                                                                                 | Phase                  |
| --------------------- | ------------------------------------------------------------------------------------ | ---------------------- |
| identity              | users, sessions, invitations, password recovery                                      | 1                      |
| tenancy               | companies, branches, memberships                                                     | 1                      |
| access                | roles, permissions, branch scopes, approvals                                         | 1 (approvals engine 6) |
| settings              | company settings, numbering series, financial periods                                | 1                      |
| audit                 | audit log, attachment metadata                                                       | 1                      |
| ledger                | chart of accounts, account mappings, journals, posting engine, opening balances      | 2                      |
| catalogue             | categories, products, units, conversions                                             | 3                      |
| inventory             | stock movements, cost layers, balances, adjustments, counts                          | 3                      |
| parties               | customers, suppliers (shared "party" model)                                          | 4–5                    |
| purchasing            | purchase invoices, goods receipts, supplier payments, supplier returns, landed costs | 4                      |
| sales                 | POS, invoices, receipts, allocations, returns, credit notes, refunds                 | 5–6                    |
| treasury              | cash & bank accounts, transfers, cash book, bank book                                | 4–7                    |
| reporting             | day book, GL, TB, P&L, balance sheet, ageing, statements, reconciliations            | 7                      |
| assets                | fixed asset register, depreciation runs, disposals                                   | 7                      |
| services / production | quotations, projects, BOM, production orders, WIP                                    | 9                      |

Each backend module exposes **commands** (`sales.postSale`, `ledger.reverseJournal`…) and
owns its collections. Modules call each other through domain service interfaces, never by
writing another module's documents directly; the posting engine is the single writer of
journals and stock movements.

## 5. Command pipeline (every write)

```
onCall(command) →
  1. authenticate        Firebase ID token required; disabled users rejected
  2. resolve tenant      companyId from request, then load members/{uid}; must be active
  3. authorize           permission check (role → permissions) + branch scope
  4. validate            Zod schema (packages/schemas); never trust client totals
  5. idempotency         commands/{idempotencyKey}: if completed → return stored result;
                         if same key + different payload hash → reject
  6. business rules      period open? backdate allowed? stock available? approval needed?
  7. post (transaction)  Firestore transaction: documents + journal + ledger entries +
                         stock movements + command record + audit entry, all-or-nothing
  8. respond             stored result (document id, number, journal id)
```

Server recomputes all totals, taxes, costs and account selections from authoritative data.
Client-supplied prices are accepted only where the user's permission allows price override,
and the override is audited.

## 6. Atomicity, idempotency and recovery

- Firestore transactions allow up to 500 writes. A posting is designed to fit one transaction:
  journal header with embedded lines, one ledger entry per line, stock movements, stock balance
  updates, the source document, the command record and an audit entry.
- Hard limits enforced by schema: ≤ 100 lines per sale/purchase document, ≤ 200 journal lines
  per manual journal. Larger inputs (opening balance imports, stock counts) use a
  **durable batch workflow**: a batch document moves through `draft → validated → posting →
posted | failed`, each chunk is posted in its own idempotent transaction keyed by
  `batchId:chunkNo`, and the batch is only marked `posted` once a reconciliation step confirms
  every chunk. Readers treat a batch that is not `posted` as not posted; reports exclude
  ledger entries whose `batchStatus != posted`.
- Every command carries a client-generated `idempotencyKey` (UUID v4). Retries return the
  stored result; double-clicks and network retries cannot double-post.
- Firestore transaction retries on contention are safe because the transaction body is pure
  with respect to external effects (no emails or external calls inside).

## 7. Balance strategy and hot-spot avoidance

A busy POS posts many sales to the same cash and revenue accounts, and Firestore sustains
roughly one write per second per document. We therefore do **not** keep a running balance
document per account updated on every posting (see ADR-0004):

- `ledgerEntries` (one per journal line) are the source of truth.
- Balances are computed with Firestore `sum()` aggregation queries over `ledgerEntries`
  filtered by account and date range.
- On period close, a `periodBalances` snapshot per account is written and reused as the
  opening point for later queries, keeping aggregation ranges short.
- Stock balances per product and branch **are** maintained transactionally, because negative
  stock checks and weighted-average cost need a consistent read. Contention is per product,
  which suits SME volumes; a load test in Phase 8 confirms it.

## 8. Security architecture

- Firebase Auth (email/password + email verification; optional Google sign-in later).
- Authorization does **not** rely on custom claims for company roles (claims go stale and
  cannot express per-company roles cheaply). Rules read `companies/{c}/members/{uid}`.
- Custom claim `platformAdmin: true` only for Platform Super Admin; set by a script with
  service-account credentials, never by the app. Super admin actions go through dedicated
  `platform.*` commands which require a reason and write to `platformAuditLogs`.
- Firestore rules: deny by default; members may read company data according to permissions;
  **no client writes** to any company collection in Phase 1–8 except the user's own UI
  preferences. All mutations are commands.
- Storage: `companies/{companyId}/attachments/{attachmentId}`; upload via signed flow
  (command creates attachment record, rules allow upload only when that pending record
  exists for that uid, size ≤ 10 MB, allowed MIME types). Downloads require membership.
- Secrets in Google Secret Manager / Functions secrets; nothing secret in the repo.
  Firebase web config is public by design and kept in `.env` per environment.
- App Check (reCAPTCHA Enterprise) on callable functions in staging/production.
- Session handling: Firebase ID tokens (1 h) with refresh; sign-out revokes refresh tokens
  on "sign out everywhere"; disabled members are rejected at step 2 on the next command.

## 9. Environments

| Env        | Firebase project              | Purpose                              |
| ---------- | ----------------------------- | ------------------------------------ |
| local      | emulators only (`demo-bms`)   | development and all automated tests  |
| staging    | `bms-staging` (to be created) | pilot rehearsal, synthetic data only |
| production | `bms-prod` (to be created)    | controlled pilot                     |

Region: **needs decision** (see `OPEN_DECISIONS.md`). Code defaults to `europe-west1` through
`FUNCTIONS_REGION` / `VITE_FUNCTIONS_REGION` until it is confirmed.

## 10. Frontend architecture

- React 19 + TypeScript strict, Vite, React Router (data router). Server state comes from
  Firestore live listeners (`useDoc`, `useCollection`) and callable commands (`useAction`).
- UI: Tailwind CSS with small in-repo components on Radix primitives (dialog, menu, label)
  for keyboard and screen-reader support. A table library (TanStack Table) is planned for
  the large financial tables from Phase 2.
- Forms: React Hook Form + Zod resolvers using the shared schemas.
- Company context: URL-scoped (`/c/:companyId/...`) so links are tenant-explicit; the
  company switcher only lists active memberships. The URL is a hint, never authority.
- Money formatting through one `formatMoney(minor, currency, locale)` helper.

## 11. CI/CD

GitHub Actions on every PR: install (frozen lockfile) → lint (ESLint) → typecheck (tsc -b) →
unit tests (Vitest) → emulator tests (rules + integration) → build web and functions →
Playwright smoke against emulators. Deploys to staging on merge to `main` and to production
on a tagged release with manual approval (configured in Phase 8).

## 12. Extensibility for services and production

- `parties` is a shared model: one party may be both customer and supplier.
- Document lines carry `lineType` (`stock`, `service`, `nonStock`, `charge`) so service
  invoices reuse the sales pipeline.
- Inventory locations carry `locationType` (`store`, `quarantine`, `wip`, `finishedGoods`)
  and products carry `productType` (`stock`, `service`, `rawMaterial`, `finishedGood`), so
  production can move value from raw materials through WIP to finished goods with the same
  movement and costing engine.
- Account mappings are keyed by `transactionType`, so new modules add mapping keys instead
  of new posting code paths.
