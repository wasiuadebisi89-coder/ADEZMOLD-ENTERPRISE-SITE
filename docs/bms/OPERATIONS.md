# Operations: monitoring, alerts, backups and recovery

Applies to the staging and production projects set up as in DEPLOYMENT.md. Commands use
`gcloud` signed in to the project (Cloud Shell is simplest); replace `PROJECT`.

## 1. What to watch

| Signal                         | Where                                                                    |
| ------------------------------ | ------------------------------------------------------------------------ |
| Every command and its outcome  | Logs Explorer, `jsonPayload.event="command"`                             |
| Unexpected failures            | `jsonPayload.event="command_error"` (with the error and stack)           |
| Rate-limited callers           | `jsonPayload.message="Rate limited"`                                     |
| Function health, latency, 5xx  | Cloud Run → service `api` → Metrics                                      |
| Firestore reads, writes, usage | Firebase console → Firestore → Usage                                     |
| Cost                           | Billing → Reports; the budget alert (DEPLOYMENT.md §1)                   |
| Auth abuse                     | Firebase console → Authentication → Usage; Auth's own sign-in throttling |

Each command writes one structured log line: `name`, `uid`, `companyId`, `outcome` (`ok`,
`refused` with the `reason`, or `error`) and `durationMs`. Refusals are business rules doing
their job (for example `insufficient_stock`) and are not alerts. The audit log in Firestore
remains the record of who changed what; logs are for operating the service.

## 2. Limits that protect cost and availability

- `MAX_INSTANCES` caps how many function instances run (staging 3, production 10).
- `RATE_LIMIT_PER_MINUTE` (300) caps commands per user per instance per minute. It is held in
  memory, so it is a brake, not an exact quota.
- App Check (DEPLOYMENT.md §5) keeps scripted clients out once enforced.

## 3. Alerts

`ops/setup-project.sh` creates these from `ops/alerts/` and emails the address given:

| Alert                             | Fires when                                    | First step                                                           |
| --------------------------------- | --------------------------------------------- | -------------------------------------------------------------------- |
| BMS: unexpected command errors    | any `command_error` in 5 minutes              | Open the log line; the request saved nothing. Fix and redeploy.      |
| BMS: API server errors            | more than 5 responses 5xx in 5 minutes        | Cloud Run → `api` → Logs: timeouts, memory, crash on start.          |
| BMS: users hitting the rate limit | more than 20 rate-limited calls in 10 minutes | Find the `uid`; a stuck browser tab, or disable the user if abusive. |
| Budget (set in Billing)           | spend reaches 50 / 90 / 100 % of the budget   | Billing → Reports by service; check for a loop or abuse.             |

Add a phone or chat channel under Monitoring → Alerting → Notification channels if email is
not watched closely enough.

## 4. Backups

Set up by `ops/setup-project.sh` (Blaze plan needed):

- **Point-in-time recovery**: any minute of the last 7 days can be read back.
- **Daily backups** kept 14 days and **weekly backups** (Sunday) kept 14 weeks, managed by
  Firestore in the same location.
- **Delete protection** on the database.

Not covered: Auth users (export with `firebase auth:export` if a copy is wanted), Storage files
(no attachments are stored yet), and anything older than 14 weeks. For longer retention, add a
scheduled `gcloud firestore export` to a Cloud Storage bucket with a retention policy.

List them:

```sh
gcloud firestore backups schedules list --database='(default)' --project=PROJECT
gcloud firestore backups list --location=europe-west1 --project=PROJECT
```

## 5. Recovery

Firestore restores into a **new** database, never over the live one, so nothing is lost by
trying. The live app keeps running on `(default)` while the restored copy is checked.

**Drill (run on staging each quarter, and once before production goes live):**

1. Note the time, and the count of journals in one company (Firestore console, or the trial
   balance in the app).
2. Restore the latest daily backup:

   ```sh
   BACKUP=$(gcloud firestore backups list --location=europe-west1 --project=PROJECT \
     --format='value(name)' --sort-by=~snapshotTime --limit=1)
   gcloud firestore databases restore --source-backup="$BACKUP" \
     --destination-database=restore-drill --project=PROJECT
   ```

3. In the Firestore console switch to database `restore-drill`. Check that the company, its
   journals and ledger entries are there and that the journal count matches the backup's day.
4. Delete the copy: `gcloud firestore databases delete --database=restore-drill --project=PROJECT`.
5. Write the date, how long the restore took and the result in PROGRESS.md.

**A real incident** (bad data written, or data deleted):

1. Stop further damage: disable the user, or roll back the deploy (Hosting → release
   history → Rollback; redeploy the previous commit for functions).
2. Pick the restore point: a backup from before the problem, or a minute within the last
   7 days with point-in-time recovery
   (`gcloud firestore export gs://BUCKET/pitr --snapshot-time=2026-10-23T10:15:00Z`).
3. Restore to a new database as in the drill and compare.
4. Because posted entries are immutable, fix the books with **reversing and correcting
   journals** through the app wherever possible, using the restored copy as the reference.
   Copying documents back into `(default)` with an admin script is the last resort, needs
   the owner's approval, and must be recorded in the incident note.

The drill has **not been run yet**: there is no real project until the owner completes
DEPLOYMENT.md. It is on the checklist in DEPLOYMENT.md §7.
