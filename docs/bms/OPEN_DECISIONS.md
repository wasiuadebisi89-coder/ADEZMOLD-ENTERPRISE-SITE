# Open decisions for the owner

Each has a proposed safe default. Phase 1 can proceed on the defaults; items marked
**before Phase 2/3** must be confirmed before that phase posts any figures.

| #   | Decision                            | Proposed default                                                                                            | Needed by              |
| --- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------- |
| 1   | Accounting framework reference      | **Confirmed:** IFRS for SMEs                                                                                | Phase 2                |
| 2   | Pilot base currency                 | NGN (one currency per company)                                                                              | Phase 1 (default only) |
| 3   | Fiscal year start                   | January, monthly periods                                                                                    | Phase 1 (default only) |
| 4   | Backdating window without approval  | **Confirmed:** 3 days                                                                                       | Phase 2                |
| 5   | Default inventory costing           | **Confirmed:** moving weighted average; FIFO optional, locked after first stock posting                     | Phase 3                |
| 6   | Stock adjustment approvals          | **Confirmed:** all adjustments need approval                                                                | Phase 3                |
| 7   | Customer credit limit               | Warn, not block                                                                                             | Phase 5                |
| 8   | Tax rounding                        | Per line                                                                                                    | Phase 5                |
| 9   | Prices tax-inclusive or exclusive   | Exclusive; rates entered per company, none seeded                                                           | Phase 5                |
| 10  | Depreciation first-month convention | Full month if available for use by the 15th                                                                 | Phase 7                |
| 11  | Role matrix and self-approval       | As in ROLES.md; no self-approval                                                                            | Phase 1                |
| 12  | Firebase region                     | africa-south1 (Johannesburg) if all services needed are available there, otherwise europe-west1 — to verify | Phase 1 deploy         |
| 13  | Firebase projects / billing         | Owner creates `bms-staging` and `bms-prod` (Blaze plan needed for Functions)                                | Phase 1 deploy         |
| 14  | Default chart of accounts template  | **Confirmed:** trading chart in CHART_OF_ACCOUNTS.md                                                        | Phase 2                |
| 15  | Sign-in methods                     | Email/password + verification; Google sign-in later                                                         | Phase 1                |
| 16  | Supplier payment approval           | None: anyone with `purchasing.payment.post` pays directly (Accountant, Manager, Admin)                      | Phase 4                |

## Confirmed decisions

- 2026-10-23: the owner asked us to go with the recommendation for #1 and #4.
  - #1: IFRS for SMEs is the reference framework. The Financial Reporting Council of Nigeria
    allows it for SMEs, and it is simpler than full IFRS. The owner's accountant should still
    confirm it fits the company's reporting obligations.
  - #4: postings dated up to 3 days before today need no approval. Older dates need an approved
    request. A company admin can change the window in Settings, and the change is audited.
- 2026-10-23: the owner confirmed #14 (the trading chart as drafted), #5 (moving weighted
  average by default, FIFO selectable until the first stock posting) and #6 (every stock
  adjustment needs a second person's approval).
