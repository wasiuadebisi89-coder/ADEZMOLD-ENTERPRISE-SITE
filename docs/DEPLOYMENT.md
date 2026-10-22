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
3. Settings → Node.js version **22.x** (also declared in `package.json`).
4. Deploy, then on the deployed site submit one test request on each form and confirm a
   `leads` document appears in the Firestore console. Delete those test leads afterwards.

## 3. Domain and HTTPS

Vercel → Settings → **Domains** → add the domain and follow the DNS instructions at your
registrar. Vercel issues and renews the HTTPS certificate automatically. Then set
`ALLOWED_ORIGINS` to `https://yourdomain,https://www.yourdomain` and redeploy.

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
npm run preview & npm run test:e2e     # front-end browser tests
```

## Rollback

Vercel keeps every deployment. Project → **Deployments** → pick the last good one →
**Promote to Production**. Firestore data is not affected by a rollback.
