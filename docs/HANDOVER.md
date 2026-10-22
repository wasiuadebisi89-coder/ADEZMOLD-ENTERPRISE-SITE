# Handover report — Adezmold Business Consulting website

Built in seven reviewed stages from the approved Stitch design and the production
implementation brief. This report follows section 16 of that brief. Status as of 22 October 2026.

## 1. What was implemented

**Public website** (React + Vite + Tailwind CSS 4, Stitch design tokens carried over 1:1)
- Homepage: hero, leakage estimator (visitor chooses the loss rate; labelled illustrative),
  service cards, challenges vs. controls, 4-step method, checklist banner, final call to action.
- Services page: problem, audience, scope, process and limits for each of the three services;
  each links to the consultation form with the service preselected. No prices.
- About page: overview, philosophy ("visible, organised and scalable"), method, expertise,
  founder, contact.
- Free checklist landing page and form; consultation request form with every field in the brief.
- Privacy notice for the Nigeria Data Protection Act 2023 and GAID 2025, with a consent banner
  for lead-source attribution and a way to change that choice later.
- Responsive phone layout (bottom navigation, as in Stitch) and desktop layout (header navigation).
- Unverified content from the draft was removed: invented case studies, Lagos address, placeholder
  email, "Q2 2025 audits", "senior partners", "fiduciary", "forensic", "certifications".

**Lead capture and delivery**
- `POST /api/consultation`, `POST /api/checklist` (Vercel functions): server-side validation
  shared with the browser, honeypot, per-IP rate limits, origin and size checks, idempotent
  retries, same-day duplicate protection, unique `ADZ-YYMM-XXXXX` references.
- Checklist PDF (3 pages, generated from the same content as the site) served only through
  signed 7-day download links (`GET /api/checklist-download`).
- Emails through Resend: checklist link, consultation acknowledgement, internal lead alert.
  Written and tested; **switched off until the domain and API key are set**.

**Lead register** (`/admin`, staff only)
- Firebase Auth sign-in checked on the server; HttpOnly, Secure, SameSite=Strict session cookie
  (8 h) verified with revocation on every request; no public sign-up.
- Roles: `staff` (view, update, notes) and `admin` (also CSV export and deletion).
- List with stage counts, search and filters (type, source, service, follow-up due, retention due);
  lead detail with call/WhatsApp/email, pipeline stages, owner, follow-up date, proposal and won
  values, outcome, internal notes and full change history; edit-conflict protection.

**SEO and sharing**: per-page HTML with title, description, canonical, Open Graph and Twitter tags
(LinkedIn previews work without JavaScript), social preview image, favicon, robots.txt, sitemap,
accurate structured data (no ratings), real 404s, admin pages kept out of search.

**Performance and privacy**: fonts and icons self-hosted (no Google Fonts requests); admin code in
a separate bundle; no tracking cookies, pixels or third-party analytics.

## 2. Main files

| Area | Files |
| --- | --- |
| Pages and layout | `src/pages/*`, `src/components/*`, `src/index.css` |
| Content and settings | `src/config/site.js`, `src/content/*` |
| Browser logic | `src/lib/router.jsx`, `validation.js`, `attribution.js`, `submit.js`, `usePageMeta.js` |
| Lead register UI | `src/admin/*` |
| API functions | `api/consultation.js`, `api/checklist.js`, `api/checklist-download.js`, `api/admin.js` |
| Server logic | `server/handler.js`, `leads.js`, `store.js`, `delivery.js`, `download.js`, `tokens.js`, `admin.js`, `auth.js`, `email/*`, `firebase-app.js`, `firestore.js`, `config.js` |
| Build tools | `vite.config.js`, `scripts/seo-plugin.mjs`, `build-checklist-pdf.mjs`, `build-icons.mjs`, `build-brand-images.mjs` |
| Operations | `scripts/manage-staff.mjs`, `scripts/backup-firestore.mjs`, `scripts/local-server.mjs` |
| Config | `vercel.json`, `firebase.json`, `firestore.rules`, `firestore.indexes.json`, `.env.example`, `.github/workflows/ci.yml` |
| Docs | `README.md`, `docs/DEPLOYMENT.md`, `docs/DATA.md`, `docs/LAUNCH-CHECKLIST.md`, this file |

## 3. Database and security

- Firestore collections: `leads` (+ `activity`), `consents`, `submissions`, `dedupe`, `rateLimits`,
  `adminAudit`. Schema, retention and backups: `docs/DATA.md`.
- `firestore.rules` deny all browser access; only the server (Admin SDK) reads or writes.
- Lead creation is one transaction (lead, first history entry, consent record, idempotency marker).
- Consent records are separate from leads and store the privacy-notice version shown.
- IP addresses are hashed for rate limiting, never stored. Logs contain no personal data.
- Staff actions (sign-in, edits, notes, exports, deletions) are recorded in `adminAudit`.
- Security headers via `vercel.json`; CSV export protected against spreadsheet formula injection.

## 4. Tests and actual results

Run on the final build in the development sandbox (22 Oct 2026):

| Suite | Command | Result |
| --- | --- | --- |
| Server, API, delivery, admin, browser journeys, SEO, accessibility | `npm run test:server` | **66 passed**, 0 failed (11 emulator tests skipped here; they run in their own commands) |
| Staff sign-in, roles, sessions (Firebase Auth emulator) | `npm run test:auth-emulator` | **5 passed**, 0 failed |
| Front-end browser tests | `npm run test:e2e` | **38 passed**, 0 failed |
| Firestore transactions, rules, register operations (Firestore emulator) | `npm run test:emulator` | **Not run**: the emulator download is blocked in the sandbox. Runs in CI. |
| Production dependency audit | `npm audit --omit=dev` | 0 vulnerabilities |

Highlights: full no-mock journey (LinkedIn visitor → checklist → PDF download → consultation →
lead stored with source); axe-core WCAG 2.1 AA audit of every page at phone and desktop sizes plus
consent banner, form errors and the lead register, all with 0 violations after fixes; security
checks were mutation-tested (breaking role and session checks made tests fail).

## 5. Environment variables (values never committed)

`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_WEB_API_KEY`,
`RATE_LIMIT_SALT`, `DOWNLOAD_TOKEN_SECRET`, `SITE_URL`, `ALLOWED_ORIGINS`, `LEAD_RETENTION_MONTHS`,
`PRIVACY_NOTICE_VERSION`, and for email: `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO`,
`LEAD_ALERT_TO`. Descriptions in `.env.example`.

## 6. Deployment

Vercel (site + functions) and Firebase Spark (Firestore + Auth). Step by step: `docs/DEPLOYMENT.md`.
Rollback: Vercel → Deployments → promote the previous deployment (data unaffected).

## 7. Outstanding configuration and manual steps

See `docs/LAUNCH-CHECKLIST.md`. Blocking items: domain; Vercel and Firebase setup; staff accounts;
replacing the hot-linked Stitch logo and hero image; the legal entity name; legal review of the
privacy notice; a live end-to-end test. **Email delivery is not operational** until Resend is set up.

## 8. Known limitations and recommended next steps

- The register filters the most recent 200 leads at a time; older leads are reached by search
  or CSV export. Fine for current volumes; add Firestore indexes if volume grows.
- No in-app password reset or multi-factor sign-in for staff (reset via Firebase console).
- No external error monitoring yet; Vercel function logs are structured. Consider Sentry later.
- Login and form rate limits use Firestore writes (within free-plan quotas at expected volumes).
- React was moved from 18 to 19 (the original repository was an unbuilt stub).
- Next steps: replace images; add the founder bio; publish real case studies with permission;
  connect the domain email; consider WhatsApp click-to-chat on the site.
