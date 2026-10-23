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
