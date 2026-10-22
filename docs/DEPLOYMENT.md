# Deployment and setup

Hosting: **Vercel** (site + `/api` functions). Database: **Firebase Firestore** on the free Spark plan.
Nothing below has been run against your accounts yet; each step needs you to sign in.

## 1. Firebase project (once)

1. Go to <https://console.firebase.google.com> → **Add project** (e.g. `adezmold-site`).
   Google Analytics is not needed.
2. **Build → Firestore Database → Create database** → *Production mode*.
   Choose the location carefully; it cannot be changed later. Pick the nearest available
   region to Nigeria (if `africa-south1` (Johannesburg) is offered, it is closest).
3. Project settings → **Service accounts** → **Generate new private key**. A JSON file downloads.
   Treat it like a password: never email it, commit it, or paste it into chat tools.
4. Deploy the security rules from your computer:
   ```bash
   npx firebase login
   npx firebase use --add          # pick the project
   npm run deploy:rules
   ```
5. Firestore → **TTL**: add policies on field `expiresAt` for `submissions`, `dedupe`, `rateLimits`
   (see docs/DATA.md).

## 2. Vercel (once)

1. Import the GitHub repository at <https://vercel.com/new>. Framework preset: **Vite**.
   Build command `npm run build`, output directory `dist` (the defaults).
2. Settings → **Environment Variables** (Production and Preview), from `.env.example`:
   - `FIREBASE_PROJECT_ID` = `project_id` from the JSON key
   - `FIREBASE_CLIENT_EMAIL` = `client_email`
   - `FIREBASE_PRIVATE_KEY` = `private_key` (paste as-is, including `-----BEGIN…` and the `\n`s)
   - `RATE_LIMIT_SALT` = a long random string
   - `ALLOWED_ORIGINS` = your domain(s), once known
   - `DOWNLOAD_TOKEN_SECRET` = another long random string (signs checklist download links)
   - `FIREBASE_WEB_API_KEY` = the *Web API key* from Firebase Project settings → General
   - `SITE_URL` = `https://yourdomain` (used at build time for link previews and the sitemap)
3. Settings → Node.js version **22.x** (also declared in `package.json`).
4. Deploy, then on the deployed site submit one test request on each form and confirm a
   `leads` document appears in the Firestore console. Delete those test leads afterwards.

## 3. Domain and HTTPS

Vercel → Settings → **Domains** → add the domain and follow the DNS instructions at your
registrar. Vercel issues and renews the HTTPS certificate automatically. Then set
`SITE_URL` to `https://yourdomain` and `ALLOWED_ORIGINS` to `https://yourdomain,https://www.yourdomain`,
and redeploy so the link previews and sitemap use the real address.

## 4. Lead register access (staff accounts)

The lead register is at `/admin`. There is no sign-up page; access is granted by you.

1. Firebase console → **Authentication → Get started → Sign-in method** → enable **Email/Password**.
2. Authentication → **Settings → User actions**: untick **Enable create (sign-up)**, so nobody
   can create an account from outside, even with the public API key.
3. Authentication → **Users → Add user**: enter the staff member's email and a strong temporary
   password (12+ characters). Ask them to change it via "forgot password" later, or set it with them.
4. From your computer, with the three `FIREBASE_*` service-account variables set:
   ```bash
   npm run staff -- grant owner@yourdomain.com admin   # export + delete allowed
   npm run staff -- grant person@yourdomain.com staff  # view, update, notes
   npm run staff -- list
   npm run staff -- revoke person@yourdomain.com       # removes access, signs them out everywhere
   ```
5. Sign in at `https://yourdomain/admin`. Sessions last 8 hours.

Recommended later: multi-factor sign-in for admin accounts. It needs Firebase Authentication to be
upgraded to Identity Platform; check the current pricing and plan requirements before switching.

## 5. Email with Resend (when the domain is ready)

Until this is done the site still works: checklist visitors get an instant download
link on screen, every lead is saved, and each lead records its emails as `not-configured`.

1. Create an account at <https://resend.com> and **add your domain** (Domains → Add).
2. Add the DNS records Resend shows you (SPF/DKIM, usually TXT and MX/CNAME) at your
   domain registrar, then click **Verify**. This is what keeps emails out of spam.
3. API Keys → **Create API key** with *Sending access* only.
4. In Vercel, set `RESEND_API_KEY`, `EMAIL_FROM` (an address on the verified domain),
   `EMAIL_REPLY_TO`, `LEAD_ALERT_TO` and `SITE_URL`, then redeploy.
5. Test: request the checklist with your own email and send a consultation request.
   You should receive the checklist email, the acknowledgement, and two lead alerts.
   In Firestore, the lead's `email.*.state` fields should read `sent`.

"Sent" means Resend accepted the email. Check Resend's **Emails** log for actual delivery
or bounces. The free tier allows a limited number of emails per day; check Resend's
current limits when you sign up.

## Local development

```bash
npm install
npm run dev                 # front end only (forms will show "not sent" without an API)
npm run build && npm run serve:local   # site + real API handlers, in-memory store (no Firestore)
npx vercel dev              # full Vercel emulation with your env vars (needs `vercel login`)
```

## Tests

```bash
npx playwright install chromium        # once
npm run build
npm run test:server                    # API handler tests + full browser journey (no Firestore)
npm run test:emulator                  # Firestore transactions + security rules (needs Java 11+)
npm run test:auth-emulator             # staff sign-in, roles, session cookies (no Java needed)
npm run preview & npm run test:e2e     # front-end browser tests
```

## Rollback

Vercel keeps every deployment. Project → **Deployments** → pick the last good one →
**Promote to Production**. Firestore data is not affected by a rollback.
