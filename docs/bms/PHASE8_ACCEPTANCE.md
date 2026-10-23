# Phase 8 acceptance — security, load, monitoring, backups and deployment

Items marked **(automated)** have a test or a check in CI. Items marked **(owner)** need the
real Firebase projects and are verified by the owner after DEPLOYMENT.md; they are not
claimed as done until their result is written in PROGRESS.md.

## H1 Security

- H1.1 Security review written (SECURITY_REVIEW.md) and its fixes made.
- H1.2 `pnpm audit --prod` reports no known vulnerabilities. (automated, run locally)
- H1.3 Deployed builds carry a Content-Security-Policy; emulator builds do not. A production
  build loads with no CSP violations. (checked locally in Chromium)
- H1.4 A user's preferences are limited to 20 keys. (automated, rules test)
- H1.5 More than the allowed commands per user per minute are refused. (automated, unit test)

## H2 Load and concurrency

- H2.1 Concurrent postings get gap-free numbers and balanced books; simultaneous retries post
  once; concurrent sales never take stock below zero. (automated, LOAD_TESTING.md)
- H2.2 A load test against staging. (owner, after deployment)

## H3 Monitoring

- H3.1 Every command logs one structured line with its outcome and duration. (code)
- H3.2 Log-based metrics and alert policies for command errors, 5xx responses and rate
  limiting are created by `ops/setup-project.sh`. (owner)
- H3.3 A budget alert is set on each project. (owner)

## H4 Backups and recovery

- H4.1 Point-in-time recovery, daily and weekly backups and delete protection are set by
  `ops/setup-project.sh`. (owner)
- H4.2 The recovery drill in OPERATIONS.md §5 is run on staging and its result recorded.
  (owner)

## H5 Deployment

- H5.1 Firestore, Functions and Storage in europe-west1 (DECISION 12).
- H5.2 `staging` and `production` aliases; per-project function settings without secrets.
- H5.3 Staging deploys after CI passes on `main`; production only by hand with approval; both
  through Workload Identity Federation with no keys. Disabled until `DEPLOY_ENABLED=true`.
- H5.4 First deploy and its smoke checks (DEPLOYMENT.md §7). (owner)
