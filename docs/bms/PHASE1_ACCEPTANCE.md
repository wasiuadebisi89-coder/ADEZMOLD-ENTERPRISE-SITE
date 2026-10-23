# Phase 1 — Scope and acceptance tests

Scope: application shell, authentication, company registration, tenant isolation,
memberships and invitations, roles and permissions, company settings, branches,
financial periods, audit log, CI.

Out of scope for Phase 1: chart of accounts and all postings (Phase 2), attachments UI
(storage rules are written and tested now).

Test layer key: **U** unit (Vitest), **R** security rules (emulator), **I** integration
(functions + Firestore emulator), **E** end-to-end (Playwright + emulators).

## A. Authentication

| ID  | Test                                                                                    | Layer |
| --- | --------------------------------------------------------------------------------------- | ----- |
| A1  | Sign up with email/password sends verification; unverified user cannot create a company | I, E  |
| A2  | Sign in / sign out; protected routes redirect to sign-in when signed out                | E     |
| A3  | Password reset email flow works against the Auth emulator                               | E     |
| A4  | Disabled Auth user's next command is rejected with `unauthenticated`                    | I     |
| A5  | "Sign out everywhere" revokes refresh tokens; old token rejected after revocation check | I     |

## B. Company registration

| ID  | Test                                                                                                                                                                                          | Layer |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| B1  | `company.create` creates company, head-office branch, system roles, settings, current fiscal year and 12 periods, and an active Company Admin membership for the creator — in one transaction | I     |
| B2  | Retrying `company.create` with the same idempotency key returns the same company; no duplicate                                                                                                | I     |
| B3  | Same key with different payload is rejected                                                                                                                                                   | I     |
| B4  | Invalid input (missing legal name, unsupported currency, bad fiscal start month) rejected by Zod schema server-side even if UI is bypassed                                                    | U, I  |
| B5  | Base currency and costing method become read-only after lock flag is set                                                                                                                      | I     |

## C. Tenant isolation (security rules)

| ID  | Test                                                                                                                 | Layer |
| --- | -------------------------------------------------------------------------------------------------------------------- | ----- |
| C1  | Unauthenticated users cannot read any company document                                                               | R     |
| C2  | Member of company A cannot read any document under company B (company, members, roles, settings, periods, auditLogs) | R     |
| C3  | No authenticated client can write to `companies/**` (create, update, delete), including Company Admin                | R     |
| C4  | Suspended or removed member loses read access immediately                                                            | R     |
| C5  | Commands with a `companyId` the caller is not an active member of are rejected `permission-denied`                   | I     |
| C6  | Storage: member of A cannot read or upload under `companies/B/**`; uploads > 10 MB or disallowed MIME rejected       | R     |
| C7  | User can read/write only own `users/{uid}` profile preferences; cannot write `memberships` mirror                    | R     |

## D. Memberships and invitations

| ID  | Test                                                                                                         | Layer |
| --- | ------------------------------------------------------------------------------------------------------------ | ----- |
| D1  | Admin invites email with roles and branch scope; invitation token is single-use and expires (7 days)         | I     |
| D2  | Accepting an invitation with a different signed-in email is rejected                                         | I     |
| D3  | A user can belong to two companies with different roles; switcher lists both; permissions differ per company | I, E  |
| D4  | Admin suspends a member; that member's commands fail; audit log records actor, target, reason                | I     |
| D5  | The last active Company Admin cannot be removed, suspended or demoted                                        | I     |
| D6  | Non-admin cannot invite, change roles or suspend members                                                     | I     |

## E. Roles and permissions

| ID  | Test                                                                                                    | Layer |
| --- | ------------------------------------------------------------------------------------------------------- | ----- |
| E1  | Permission catalogue: every command declares a required permission; a test fails if a command lacks one | U     |
| E2  | System role templates match the documented matrix (`ROLES.md`)                                          | U     |
| E3  | Custom role creation copies a template; system roles cannot be deleted                                  | I     |
| E4  | Branch scope: user scoped to branch X is rejected on branch-Y-scoped commands                           | I     |
| E5  | UI hides actions the user lacks, but the server rejects them when called directly                       | I, E  |
| E6  | Auditor role is read-only across all modules                                                            | I     |

## F. Settings, branches, financial periods

| ID  | Test                                                                                                                                                           | Layer |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| F1  | Admin creates/edits/deactivates branches; head office cannot be deactivated                                                                                    | I     |
| F2  | Period close requires `settings.periods.close`; status moves open → soft_closed → closed                                                                       | I     |
| F3  | Reopening a closed period requires permission + an approved approval request + reason                                                                          | I     |
| F4  | Periods cannot be closed out of order (earlier open period blocks closing a later one)                                                                         | U, I  |
| F5  | Domain function `assertPostingAllowed(date, user)` covers: closed period, soft-closed without permission, backdate beyond window without approval, future date | U     |
| F6  | Creating the next fiscal year generates its periods; overlapping years rejected                                                                                | U, I  |

## G. Audit

| ID  | Test                                                                                            | Layer |
| --- | ----------------------------------------------------------------------------------------------- | ----- |
| G1  | Every Phase 1 command writes exactly one audit entry in the same transaction                    | I     |
| G2  | Audit entries are not writable or deletable by any client                                       | R     |
| G3  | Platform Super Admin support read of a company requires a reason and writes `platformAuditLogs` | I     |

## H. Money and domain foundations (used from Phase 2)

| ID  | Test                                                                                                                           | Layer |
| --- | ------------------------------------------------------------------------------------------------------------------------------ | ----- |
| H1  | Money parse/format round-trips (NGN, USD, 0-decimal currencies); rejects floats with > minor-unit precision                    | U     |
| H2  | Rounding half-away-from-zero, property-based tests (fast-check) on add/multiply/allocate; allocation sums exactly to the total | U     |

## I. Shell, UX and CI

| ID  | Test                                                                                                            | Layer |
| --- | --------------------------------------------------------------------------------------------------------------- | ----- |
| I1  | Responsive shell: sidebar on desktop, drawer on mobile (375 px), no horizontal scroll                           | E     |
| I2  | Keyboard navigation through sign-in, company creation and member invite; axe-core reports no serious violations | E     |
| I3  | Loading, empty, error states present on members, roles, branches, periods screens                               | E     |
| I4  | CI runs lint, typecheck, unit, rules, integration, build, Playwright smoke; PR blocked on failure               | CI    |
| I5  | `pnpm install --frozen-lockfile` succeeds; no secrets in repo (gitleaks scan)                                   | CI    |

**Phase 1 is complete when** every test above passes in CI, the demo flow
"sign up → create company → invite second user → second user accepts → admin closes a period"
works end to end against emulators, and docs/PROGRESS.md records results.
