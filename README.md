# Adezmold Business Consulting — website

Lead-acquisition website for Adezmold Business Consulting, implemented from the
approved Stitch design. React + Vite + Tailwind CSS 4, hosted on Vercel, with
Firebase (Firestore + Auth, free Spark plan) for leads in later stages.

## Run locally

```bash
npm install
npm run dev            # http://localhost:5173
npm run build          # production build in dist/
npm run preview        # serve the build on http://localhost:4173
npx playwright install chromium   # once
npm run test:e2e       # run while `npm run preview` is serving
```

## Where things live

| Path | What it is |
| --- | --- |
| `src/config/site.js` | Contact details, social links, feature flags, image URLs. `null` = not yet provided (hidden on the site). |
| `src/content/` | Services and the 25-point checklist text |
| `src/index.css` | Stitch design tokens (`@theme`) and the design's custom effects |
| `src/lib/router.jsx` | Small History-API router (clean URLs for LinkedIn sharing) |
| `src/pages/`, `src/components/` | Pages and shared layout |
| `vercel.json` | SPA rewrites and security headers |
| `tests/e2e/` | Source checks + Playwright browser tests |

## Build stages

1. Inspection & plan — done
2. Foundation + homepage — done
3. Services, About, Checklist landing, Consultation form
4. Backend: Vercel functions, Firestore schema & rules
5. Checklist PDF + email delivery
6. Admin lead register
7. SEO, privacy notice (NDPA 2023), accessibility, deployment docs

## Before launch (content owner)

- Provide the domain email (`site.contact.email`) and LinkedIn URLs.
- Replace the Stitch preview images (hot-linked, may expire) with your own photos in `public/`.
- Confirm service durations (14-day health check, 45-minute discovery session, step timelines).
- Case studies stay hidden (`features.caseStudies`) until verified results with client permission exist.
