# Deployment

Two Firebase projects, both in **europe-west1** (DECISION 12):

| Alias        | Project id (proposed)        | Plan                                  | Deploys                                 |
| ------------ | ---------------------------- | ------------------------------------- | --------------------------------------- |
| `staging`    | `adezmold-bms-staging`       | Blaze with a budget alert, now        | Automatically after CI passes on `main` |
| `production` | `adezmold-bms-prod`          | Created and moved to Blaze at go-live | By hand, after approval in GitHub       |

Why Blaze for staging (DECISION 13): every write in the product goes through the `api` Cloud
Function, and the free Spark plan cannot deploy Cloud Functions or managed Firestore backups.
Blaze still includes the free monthly quota; a small staging project normally stays inside it.

Project ids are global. If one is taken, pick another and change it in `.firebaserc`.

2026-10-29: billing would not link to a new project, so the owner chose to use an existing
project already on Blaze, `gen-lang-client-0555602350` (created by Google AI Studio), as
staging. Its Gemini API keys are unaffected. Section 1 still applies, except creating the
project and upgrading it.

2026-10-30: that project also hosted the owner's separate CCS App. The BMS deploys replaced its
Hosting site and its Firestore and Storage rules, and CCS users could not log in. The owner
rolled those back by hand. **BMS must only deploy to a project that runs nothing else.** The
deploy workflow now refuses `gen-lang-client-0555602350`, and the staging alias points at
`adezmold-bms-staging` again, to be created as in section 1.

Nothing here has been run against a real project yet: the steps below are for the owner, who
holds the Google account. Section 7 lists what to check once they have been done.

## 1. Create the staging project

1. Go to <https://console.firebase.google.com>, **Create a project**, name it
   `adezmold-bms-staging` (check the id shown under the name). Google Analytics is not needed.
2. **Upgrade** (bottom left) to the **Blaze** plan and link a billing account.
3. Set a budget alert straight away: Google Cloud console → **Billing → Budgets & alerts →
   Create budget**, scope it to this project, amount **$5 per month** (or the naira equivalent),
   alerts at 50 %, 90 % and 100 %. A budget sends emails; it does not stop spending. The
   function's `MAX_INSTANCES` (3 on staging) and the per-user rate limit keep runaway use small.
4. **Build → Authentication → Get started → Email/Password: enable**. Under **Settings →
   Authorized domains** the project's `web.app` and `firebaseapp.com` domains are already listed.
5. **Build → Firestore Database**: leave it; the setup script creates it in europe-west1.
   (If you create it in the console instead, choose **europe-west1** and **production mode**.
   The location cannot be changed later.)
6. **Build → Storage → Get started**, production mode. Choose **europe-west1** under "All
   locations". The no-cost list only offers US locations; staging (2026-10-29) uses US East,
   which is acceptable while no files are stored, but production should use europe-west1.
7. **Project settings → General → Your apps → Web app (</>)**, nickname `bms-web`, also set up
   Hosting. Keep the config values shown (apiKey, authDomain, projectId, storageBucket, appId)
   for step 4. They are public by design and are not secrets.

## 2. Production (later)

Repeat section 1 for `adezmold-bms-prod` when going live, with a budget that suits real use.
Until then nothing deploys to production: the workflow only deploys there when started by
hand.

## 3. Run the setup script

Open **Cloud Shell** from the Google Cloud console (it has `gcloud` signed in), clone the
repository and run:

```sh
git clone https://github.com/wasiuadebisi89-coder/ADEZMOLD-ENTERPRISE-SITE.git
cd ADEZMOLD-ENTERPRISE-SITE
ops/setup-project.sh gen-lang-client-0555602350 wasiuadebisi89-coder/ADEZMOLD-ENTERPRISE-SITE you@example.com
```

It can be run again safely. It:

- enables the APIs the product uses;
- creates the Firestore database in europe-west1 (if not there yet) with **point-in-time
  recovery** (7 days) and **delete protection**;
- adds **backup schedules**: daily kept 14 days, weekly on Sunday kept 14 weeks;
- creates the `bms-deploy` service account with the roles needed to deploy, and lets only
  this GitHub repository use it through **Workload Identity Federation** (no key file is
  ever created);
- creates the log-based metrics and alert policies in `ops/alerts/`, emailing the address
  given (OPERATIONS.md §3).

At the end it prints two values for the next step.

## 4. Connect GitHub

In the repository: **Settings → Environments → New environment** `staging` (and later
`production`, with **Required reviewers** set to yourself). In each environment add these
**variables** (not secrets; none of them is secret):

| Variable                         | Value                                      |
| -------------------------------- | ------------------------------------------ |
| `FIREBASE_PROJECT_ID`            | from the web app config                    |
| `FIREBASE_API_KEY`               | from the web app config                    |
| `FIREBASE_AUTH_DOMAIN`           | from the web app config                    |
| `FIREBASE_STORAGE_BUCKET`        | from the web app config                    |
| `FIREBASE_APP_ID`                | from the web app config                    |
| `APPCHECK_SITE_KEY`              | reCAPTCHA Enterprise key (§5), empty first |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | printed by the setup script                |
| `GCP_DEPLOY_SERVICE_ACCOUNT`     | printed by the setup script                |

Then **Settings → Secrets and variables → Actions → Variables → New repository variable**
`DEPLOY_ENABLED` = `true`. From the next push to `main` whose CI passes, `.github/workflows/
deploy.yml` deploys rules, indexes, Storage rules, the `api` function and the web app to
staging. **Actions → Deploy → Run workflow** deploys by hand, to staging or production.

## 5. App Check

App Check makes the API accept calls only from the real web app.

1. Firebase console → **App Check → Apps → bms-web → reCAPTCHA Enterprise**, create a key
   for the hosting domains, save.
2. Put the site key in the environment variable `APPCHECK_SITE_KEY` and deploy.
3. Watch **App Check → APIs → Cloud Functions** for a day; when verified requests are
   close to 100 %, set `ENFORCE_APP_CHECK=true` in `functions/env/.env.staging` and deploy.

Production starts with `ENFORCE_APP_CHECK=true` (`functions/env/.env.production`), so do steps
1–2 for production before its first deploy.

## 6. Per-project function settings

`functions/env/.env.staging` and `.env.production` hold the function's settings
(`ENFORCE_APP_CHECK`, `RATE_LIMIT_PER_MINUTE`, `MAX_INSTANCES`). They are not secrets. A
secret the functions need later goes in Secret Manager (`firebase functions:secrets:set`),
never in these files or in the repository.

## 7. After the first deploy

Check, and note the date and result in PROGRESS.md:

- [ ] `https://<project>.web.app` opens the sign-in page; sign up, verify the email, create a
      company, post a journal and see it in the trial balance.
- [ ] Response headers include the Content-Security-Policy meta tag in the page and
      `Strict-Transport-Security`, `X-Frame-Options`, `Permissions-Policy` from Hosting
      (browser dev tools → Network → the document).
- [ ] Logs Explorer shows `jsonPayload.event="command"` lines for those actions.
- [ ] Firestore → **Disaster recovery** shows both backup schedules and PITR enabled.
- [ ] The recovery drill in OPERATIONS.md §5 has been run once on staging.
- [ ] The budget alert email address is right.
