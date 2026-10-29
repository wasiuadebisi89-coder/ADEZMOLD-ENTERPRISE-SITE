#!/usr/bin/env bash
# One-off setup of a Firebase project for the BMS (docs/bms/DEPLOYMENT.md §3). Run it yourself in
# Cloud Shell or with gcloud signed in as a project owner, after the project is on the Blaze plan:
#
#   ops/setup-project.sh <project-id> <github-owner/repo> <alert-email>
#
# It is safe to run again: steps that already exist are skipped. It creates no keys; the deploy
# workflow signs in through Workload Identity Federation.
set -euo pipefail

PROJECT="${1:?project id}"
REPO="${2:?github owner/repo}"
ALERT_EMAIL="${3:?alert email}"
REGION=europe-west1
SA="bms-deploy@${PROJECT}.iam.gserviceaccount.com"
POOL=github
PROVIDER=github-actions

g() { gcloud --project "$PROJECT" --quiet "$@"; }
exists() { "$@" >/dev/null 2>&1; }
# Retries a command a few times: a database that was just created refuses changes for a minute
# or so ("ABORTED: There are concurrent database changes").
retry() {
  local attempt
  for attempt in 1 2 3 4 5 6; do
    if "$@"; then return 0; fi
    [ "$attempt" -lt 6 ] || return 1
    echo "   ...not ready yet, trying again in 30 seconds"
    sleep 30
  done
}

echo "== APIs"
g services enable firestore.googleapis.com cloudfunctions.googleapis.com run.googleapis.com \
  cloudbuild.googleapis.com artifactregistry.googleapis.com eventarc.googleapis.com \
  firebasehosting.googleapis.com firebaserules.googleapis.com firebasestorage.googleapis.com \
  identitytoolkit.googleapis.com iamcredentials.googleapis.com logging.googleapis.com \
  monitoring.googleapis.com firebaseappcheck.googleapis.com recaptchaenterprise.googleapis.com

echo "== Firestore (default) database in $REGION, with point-in-time recovery"
if ! exists g firestore databases describe --database='(default)'; then
  g firestore databases create --database='(default)' --location="$REGION" --type=firestore-native
fi
retry g firestore databases update --database='(default)' --enable-pitr --delete-protection

echo "== Backups: daily kept 14 days, weekly (Sunday) kept 14 weeks"
schedules="$(g firestore backups schedules list --database='(default)' --format=json || true)"
if ! grep -q dailyRecurrence <<<"$schedules"; then
  retry g firestore backups schedules create --database='(default)' --recurrence=daily --retention=14d
fi
if ! grep -q weeklyRecurrence <<<"$schedules"; then
  retry g firestore backups schedules create --database='(default)' --recurrence=weekly \
    --day-of-week=SUN --retention=98d
fi

echo "== Deploy service account and GitHub Workload Identity Federation"
NUMBER="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"
if ! exists g iam service-accounts describe "$SA"; then
  g iam service-accounts create bms-deploy --display-name="BMS deploy (GitHub Actions)"
fi
for role in roles/firebase.admin roles/cloudfunctions.admin roles/run.admin \
  roles/artifactregistry.admin roles/cloudbuild.builds.editor roles/iam.serviceAccountUser \
  roles/serviceusage.serviceUsageConsumer roles/datastore.indexAdmin roles/firebaserules.admin; do
  g projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$SA" --role="$role" \
    --condition=None >/dev/null
done
if ! exists g iam workload-identity-pools describe "$POOL" --location=global; then
  g iam workload-identity-pools create "$POOL" --location=global --display-name="GitHub"
fi
if ! exists g iam workload-identity-pools providers describe "$PROVIDER" \
  --location=global --workload-identity-pool="$POOL"; then
  g iam workload-identity-pools providers create-oidc "$PROVIDER" --location=global \
    --workload-identity-pool="$POOL" --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
    --attribute-condition="assertion.repository == '${REPO}'"
fi
g iam service-accounts add-iam-policy-binding "$SA" --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/${NUMBER}/locations/global/workloadIdentityPools/${POOL}/attribute.repository/${REPO}" \
  >/dev/null

echo "== Log-based metrics and alerts"
if ! exists g logging metrics describe bms_command_errors; then
  g logging metrics create bms_command_errors \
    --description="BMS commands that failed with an unexpected error" \
    --log-filter='resource.type="cloud_run_revision" AND jsonPayload.event="command_error"'
fi
if ! exists g logging metrics describe bms_rate_limited; then
  g logging metrics create bms_rate_limited \
    --description="BMS commands refused by the per-user rate limit" \
    --log-filter='resource.type="cloud_run_revision" AND jsonPayload.message="Rate limited"'
fi
CHANNEL="$(g beta monitoring channels list --filter="labels.email_address=\"$ALERT_EMAIL\"" \
  --format='value(name)' | head -1)"
if [[ -z "$CHANNEL" ]]; then
  CHANNEL="$(g beta monitoring channels create --display-name="BMS alerts" --type=email \
    --channel-labels="email_address=$ALERT_EMAIL" --format='value(name)')"
fi
existing="$(g monitoring policies list --format='value(displayName)' || true)"
for policy in ops/alerts/*.json; do
  name="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["displayName"])' "$policy")"
  if ! grep -qxF "$name" <<<"$existing"; then
    g monitoring policies create --policy-from-file="$policy" --notification-channels="$CHANNEL"
  fi
done

cat <<DONE

Done. Set these GitHub environment variables for this project (DEPLOYMENT.md §4):
  GCP_WORKLOAD_IDENTITY_PROVIDER = projects/${NUMBER}/locations/global/workloadIdentityPools/${POOL}/providers/${PROVIDER}
  GCP_DEPLOY_SERVICE_ACCOUNT     = ${SA}
DONE
