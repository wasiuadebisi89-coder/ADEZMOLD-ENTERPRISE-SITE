# Security review (Phase 8, 2026-10-23)

A review of the code as merged through Phase 7 and the year-end close, done before the first
deployment. It was a reading of the code, rules and configuration plus the automated tests;
no external penetration test has been done. Findings fixed in this phase are marked **Fixed**.

## 1. Tenancy and access

- **Every write goes through one callable** (`api`), which checks the Firebase Auth user
  (disabled accounts and revoked sessions refused), validates the input with Zod, checks the
  membership and the command's permission, records the idempotency key and writes the audit
  entry, all in one transaction (ADR 0002). The registry test fails if a company command has
  no catalogued permission.
- **Firestore rules deny by default.** Clients can read only what their membership and
  permissions allow and can write nothing financial. The only client writes are a user's own
  display name and preferences, and Storage uploads of an attachment the server registered
  first (type and size limited). Rules tests cover cross-tenant reads, each collection's read
  permission and the closed collections.
- **Fixed:** the `preferences` map on a user's own profile had no size limit, so a user could
  fill their own document. It is now limited to 20 keys.
- Posted journals and ledger entries are immutable (no update path in commands or rules);
  corrections are reversing journals. The year-end close cannot be reversed by a manual
  reversal.
- Platform support access is a separate command with its own audit and no write path.

## 2. Dependencies

- `pnpm audit --prod` reported one high and one low advisory in `@grpc/grpc-js` 1.9.x, pulled
  in by the Firebase web SDK (GHSA-f596-whhp-79r4 and the related low one). The browser bundle
  does not use gRPC, so the app was not exposed, but **Fixed:** a pnpm override moves it to
  1.14.x and the audit is now clean.
- Dependencies are pinned exactly and the lockfile is committed; CI runs `--frozen-lockfile`.
- CI runs gitleaks over the full history on every pull request.

## 3. Browser hardening

- Hosting already sent `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`
  and HSTS.
- **Fixed:** added a **Content-Security-Policy** to deployed builds (`apps/web/csp.ts`):
  scripts only from the app itself and reCAPTCHA, connections only to Google APIs and the
  functions, no plugins, no `<base>` or form posts elsewhere. It is a meta tag so emulator
  builds, which talk to `127.0.0.1`, are not blocked; framing is covered by
  `X-Frame-Options`. Checked by loading a production build in Chromium: the sign-in page
  renders with no CSP violations.
- **Fixed:** added `Permissions-Policy` (camera, microphone, location, payment, USB off),
  `Cross-Origin-Opener-Policy`, long caching for hashed assets and `no-cache` for
  `index.html` so a deploy is picked up at once.
- React escapes output; the app has no `innerHTML`, `dangerouslySetInnerHTML` or `eval`.

## 4. Abuse and cost

- **Fixed:** a per-user limit of 300 commands a minute in each function instance
  (`functions/src/lib/rate-limit.ts`), refused with reason `rate_limited`, and
  `maxInstances` (staging 3, production 10). Together they bound how hard one account can
  drive the API and the bill.
- App Check is wired in the web app and the function; enforcement is a per-project setting,
  on for production from the first deploy and on for staging once the reCAPTCHA key is in
  place (DEPLOYMENT.md §5).
- Firebase Auth throttles sign-in attempts itself.

## 5. Secrets

- No credentials in the repository. The web config is public by design; function settings
  in `functions/env/` are not secrets. Deployments use **Workload Identity Federation**,
  restricted to this repository, so no service-account key exists to leak. Secrets the
  functions need later go in Secret Manager.

## 6. Accepted for now

- The rate limit is per instance and in memory: a determined attacker spread over many
  instances gets more, up to the instance cap.
- Reports read many ledger documents in the browser (KNOWN_LIMITATIONS, Phase 7); a member
  with report access can generate read cost.
- `style-src 'unsafe-inline'` is allowed for reCAPTCHA and component libraries.
- No independent penetration test yet; recommended before production holds real customers'
  data.
