# Known limitations

Updated at the end of each phase. Items here are deliberate scope cuts or open risks, not bugs.

## Phase 1

- **Invitation emails are not sent.** The admin copies a single-use link (shown once). Sending
  email needs a provider decision (e.g. Firebase Trigger Email extension, SendGrid, Postmark).
- **Single-admin companies cannot reopen a closed period.** Requests cannot be self-approved
  (OPEN_DECISIONS #11), so a second user with `settings.periods.reopen.approve` is required.
- **Branch scope is stored and validated but not yet enforced on any command**, because no
  Phase 1 command acts on a single branch. Enforcement is added to the command framework with
  the first branch-scoped command (stock, Phase 3), with tests.
- **No production deployment yet.** Firebase projects (`bms-staging`, `bms-prod`), region,
  App Check site key and billing are owner actions (OPEN_DECISIONS #12–13).
- **Platform Super Admin** is granted by a script with service-account access; that script and
  the support UI are Phase 8 items. The `platform.supportRead` command and its audit log exist.
- **Web bundle** is about 270 kB gzipped (mostly the Firebase SDK). Route-level code splitting
  is in place; further splitting is a Phase 8 performance task.
- **Rate limiting** of commands relies on Firebase Auth and App Check for now; per-user
  quotas are a Phase 8 item.
- **Composite indexes** in `firestore.indexes.json` are verified by the emulator only;
  production index builds happen on first deploy.
