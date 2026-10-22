# Launch checklist

Work through this top to bottom. Items in **A** block a public launch.

## A. Must be done before launch

- [ ] **Domain** bought and connected in Vercel (docs/DEPLOYMENT.md §3).
- [ ] **Vercel environment variables** set for Production (see `.env.example`):
      `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_WEB_API_KEY`,
      `RATE_LIMIT_SALT`, `DOWNLOAD_TOKEN_SECRET`, `SITE_URL`, `ALLOWED_ORIGINS`. Redeploy after setting them.
- [ ] **Firebase**: Firestore created, `npm run deploy:rules` run, TTL policies on `expiresAt` for
      `submissions`, `dedupe`, `rateLimits`, `adminAudit` (docs/DATA.md).
- [ ] **Staff access**: Email/Password sign-in on, **sign-up disabled**, accounts added, roles granted
      with `npm run staff -- grant …` (docs/DEPLOYMENT.md §4). Use strong, unique passwords.
- [ ] **Replace the Stitch preview images** (logo and hero photo) with your own files in `public/`
      and update `src/config/site.js`. They are hot-linked from Google's preview servers, which may
      stop serving them and which receive visitors' IP addresses.
- [ ] **Legal entity**: set `site.legalEntity` in `src/config/site.js` to the registered company name
      (and RC number) responsible for the data.
- [ ] **Privacy notice legal review**: have a lawyer or licensed Data Protection Compliance
      Organisation review `/privacy` against the Nigeria Data Protection Act 2023 and the GAID 2025,
      in particular the lawful bases, cross-border transfers to Vercel/Google/Resend, and the
      24-month retention period. Change the text and `PRIVACY_VERSION` if needed (a test keeps the
      server's consent version in step).
- [ ] **Live end-to-end test on the real domain**:
  - request the checklist → download works → lead appears in `/admin` with the right source;
  - send a consultation request → reference shown → lead in `/admin`;
  - move a lead through stages, add a note, export CSV (admin);
  - delete your test leads afterwards.
- [ ] **CI is green** on GitHub (Actions tab). It also runs the Firestore and Auth emulator suites
      that could not run in the build sandbox.

## B. Content to confirm (owner)

- [ ] Service descriptions, scope and "Good to know" limits (`src/content/services.js`).
- [ ] Timings from the design: 14-day Health Check, 45-minute discovery session, step durations.
- [ ] Founder bio and photo (`site.founder`).
- [ ] Domain email (`site.contact.email`) and LinkedIn profile/company URLs (`site.social`).
- [ ] Checklist wording (`src/content/checklist.js`). After edits run `npm run build:pdf` and commit the PDF.
- [ ] Case studies remain hidden until you have verified results with written client permission.

## C. When the domain email is ready

- [ ] Resend: verify the domain (DNS), create a sending-only API key, set `RESEND_API_KEY`,
      `EMAIL_FROM`, `EMAIL_REPLY_TO`, `LEAD_ALERT_TO` (docs/DEPLOYMENT.md §5). Test both forms.

## D. Manual accessibility checks (automated tests cover a subset)

- [ ] Use the site with TalkBack (Android) or VoiceOver (iPhone): forms, errors, success screens.
- [ ] Use it with a keyboard only on a laptop, including the lead register.
- [ ] Check at 200% browser zoom.

## E. After launch

- [ ] Google Search Console: add the domain, submit `https://yourdomain/sitemap.xml`.
- [ ] LinkedIn Post Inspector (linkedin.com/post-inspector): paste each page URL once so LinkedIn
      fetches the new preview.
- [ ] Use tagged links in LinkedIn posts so leads show their source, e.g.
      `https://yourdomain/checklist?utm_source=linkedin&utm_medium=social&utm_campaign=nov-cash-control`
      (only visitors who allow attribution are counted).
- [ ] Weekly: `node scripts/backup-firestore.mjs`, stored securely off GitHub (docs/DATA.md).
- [ ] Monthly: in `/admin`, tick **Retention review due** and delete leads you no longer need.
- [ ] Data protection: if the business comes to hold data on 2,500 or more people, check with an
      adviser whether it must register with the NDPC as a Data Controller of Major Importance
      (GAID 2025) and appoint a Data Protection Officer.
- [ ] Keep dependencies updated: `npm outdated`, `npm audit` monthly; CI fails on high-severity issues.
