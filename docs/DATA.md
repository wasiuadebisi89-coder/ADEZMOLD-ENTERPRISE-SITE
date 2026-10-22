# Lead data: schema, protection and retention

All lead data lives in Cloud Firestore and is written only by the server
(`/api/*`, Firebase Admin SDK). The browser has no Firestore access at all:
`firestore.rules` denies every read and write from client SDKs.

## Collections

| Collection | Key | Purpose |
| --- | --- | --- |
| `leads` | lead reference, e.g. `ADZ-2610-7KQ3M` | One document per lead (consultation request or checklist request) |
| `leads/{ref}/activity` | auto | Status history and, from Stage 6, internal notes |
| `consents` | auto | Privacy acknowledgement and marketing consent, separate from the lead |
| `submissions` | client submission id | Makes retries idempotent (same submission → same lead) |
| `dedupe` | SHA-256 hash | Same contact + same form (+ same service) on the same day → same lead |
| `rateLimits` | hashed IP + time window | Abuse protection counters. Raw IP addresses are never stored |

### `leads/{reference}`

```
kind            'consultation' | 'checklist'
reference       same as the document id; shown to the visitor
status          'new' → contacted → qualified → consultation-scheduled → proposal-sent → won | lost → follow-up
contact         { fullName, email|null, phone|null (+234…), preferredContact }
business        { name, type, size }
inquiry         consultation: { service, challenge, recordsState, timeframe, additionalInfo|null }
                checklist:    { resource: 'produce-business-health-checklist' }
attribution     { source, utm_source, utm_medium, utm_campaign, utm_content, utm_term,
                  referrerHost, landingPath, formPath }
marketingConsent  boolean summary; the full record is in `consents`
email           one entry per message (checklistDelivery | acknowledgement, internalAlert):
                { state: 'pending' | 'sent' | 'failed' | 'not-configured' | 'skipped-no-email',
                  providerId?, error?, at }   'sent' = accepted by Resend, not proof of inbox delivery
downloads, lastDownloadAt   checklist PDF downloads via signed links
pipeline        { owner, followUpAt, proposalValue, wonValue, outcome } (managed in Stage 6)
createdAt, updatedAt   server timestamps
retainUntil     createdAt + LEAD_RETENTION_MONTHS (default 24)
```

### `consents/{id}`

```
leadId, kind, email, phone, privacyAck (true), privacyNoticeVersion,
marketing (boolean), method 'web-form', formPath, recordedAt
```

## Integrity safeguards

- Same validation rules in browser and server (`src/lib/validation.js`); the server is authoritative.
- Every lead write (lead, first activity entry, consent, submission marker, dedupe marker) happens in **one Firestore transaction**: either all of it is saved or none of it.
- Server timestamps, not client clocks.
- Unknown option values, oversized fields and extra attribution fields are rejected or dropped.
- Honeypot field and per-IP rate limits (5 per 10 minutes, 20 per day, per form).

## Retention and deletion

- **Housekeeping records** (`submissions`, `dedupe`, `rateLimits`) carry an `expiresAt` field.
  In the Firebase console go to Firestore → **Time-to-live (TTL)**, and add a policy on
  `expiresAt` for each of these three collections so they are removed automatically.
- **Leads** carry `retainUntil`. They are *not* deleted automatically: a lead that became a
  client may need to be kept. Review leads past `retainUntil` (the lead register in Stage 6
  will list them) and delete or anonymise those no longer needed.
- **Deletion request from a person:** delete their `leads/{ref}` document with its `activity`
  subcollection, and their `consents` records. Stage 6 adds a button for this.
- Data minimisation: no ID numbers, bank details or financial records are collected; the
  consultation form asks visitors not to include them.

The retention period (24 months) is a working default, not legal advice. Confirm it as
part of the Nigeria Data Protection Act 2023 review in Stage 7.

## Backups

Firestore's managed backups and exports need a paid (Blaze) plan. On the free Spark plan:

- Run `node scripts/backup-firestore.mjs` (with the same three `FIREBASE_*` variables set locally)
  to save a JSON copy of all lead data to `backups/`. Keep that folder **off GitHub**
  (it is in `.gitignore`), encrypted, and on a device only authorised staff can access.
- Do this weekly and before any major change.
- If you later move to Blaze, switch on scheduled backups in the console instead.
