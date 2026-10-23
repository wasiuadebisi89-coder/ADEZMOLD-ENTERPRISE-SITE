# Open decisions for the owner

Each has a proposed safe default. Phase 1 can proceed on the defaults; items marked
**before Phase 2/3** must be confirmed before that phase posts any figures.

| # | Decision | Proposed default | Needed by |
|---|---|---|---|
| 1 | Accounting framework reference | IFRS for SMEs | Phase 2 |
| 2 | Pilot base currency | NGN (one currency per company) | Phase 1 (default only) |
| 3 | Fiscal year start | January, monthly periods | Phase 1 (default only) |
| 4 | Backdating window without approval | 3 days | Phase 2 |
| 5 | Default inventory costing | Moving weighted average; FIFO optional, locked after first stock posting | Phase 3 |
| 6 | Stock adjustment approvals | All adjustments need approval initially | Phase 3 |
| 7 | Customer credit limit | Warn, not block | Phase 5 |
| 8 | Tax rounding | Per line | Phase 5 |
| 9 | Prices tax-inclusive or exclusive | Exclusive; rates entered per company, none seeded | Phase 5 |
| 10 | Depreciation first-month convention | Full month if available for use by the 15th | Phase 7 |
| 11 | Role matrix and self-approval | As in ROLES.md; no self-approval | Phase 1 |
| 12 | Firebase region | africa-south1 (Johannesburg) if all services needed are available there, otherwise europe-west1 — to verify | Phase 1 deploy |
| 13 | Firebase projects / billing | Owner creates `bms-staging` and `bms-prod` (Blaze plan needed for Functions) | Phase 1 deploy |
| 14 | Default chart of accounts template | A trading-company template drafted in Phase 2 for your review | Phase 2 |
| 15 | Sign-in methods | Email/password + verification; Google sign-in later | Phase 1 |
