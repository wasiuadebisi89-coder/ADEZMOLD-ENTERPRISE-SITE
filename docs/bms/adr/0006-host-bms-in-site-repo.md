# ADR-0006: Host the BMS in the adezmold-enterprise-site repository

Status: Proposed
Context: The owner chose wasiuadebisi89-coder/adezmold-enterprise-site. It holds a 5-line placeholder site with no build, lockfile, tests or CI.
Decision: Move the existing site files unchanged into apps/site/ and turn the root into a pnpm workspace containing apps/site, apps/web (BMS), functions and packages/*.
Consequences: Site and BMS share CI and versioned dependencies; the site keeps working as its own workspace. The repo is public, so secret hygiene (gitleaks in CI, env-only config) is mandatory.
