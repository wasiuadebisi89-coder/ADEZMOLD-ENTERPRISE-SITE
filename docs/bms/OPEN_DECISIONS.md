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
| 7   | Customer credit limit               | **Confirmed:** block over the limit (0 = cash only) unless a manager approves                               | Phase 5                |
| 8   | Tax rounding                        | **Confirmed:** per line, to the minor unit                                                                  | Phase 5                |
| 9   | Prices tax-inclusive or exclusive   | **Confirmed:** chosen per company, exclusive by default; rates entered per company, none seeded             | Phase 5                |
| 10  | Depreciation first-month convention | **Confirmed:** full month if available for use by the 15th, otherwise from the next month                   | Phase 7                |
| 11  | Role matrix and self-approval       | As in ROLES.md; no self-approval                                                                            | Phase 1                |
| 12  | Firebase region                     | africa-south1 (Johannesburg) if all services needed are available there, otherwise europe-west1 — to verify | Phase 1 deploy         |
| 13  | Firebase projects / billing         | Owner creates `bms-staging` and `bms-prod` (Blaze plan needed for Functions)                                | Phase 1 deploy         |
| 14  | Default chart of accounts template  | **Confirmed:** trading chart in CHART_OF_ACCOUNTS.md                                                        | Phase 2                |
| 15  | Sign-in methods                     | Email/password + verification; Google sign-in later                                                         | Phase 1                |
| 16  | Supplier payment approval           | **Confirmed:** none; anyone with `purchasing.payment.post` pays directly (Accountant, Manager, Admin)       | Phase 4                |
| 17  | Return and refund approvals         | **Confirmed:** sales officers' returns and refunds wait for a manager; others post directly                 | Phase 6                |
| 18  | Time limit on returns               | **Confirmed:** none; the approver applies any shop policy                                                   | Phase 6                |

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
- 2026-10-23: the owner confirmed #16 (supplier payments need no second approval) and, after
  asking for help, accepted the recommendations for Phase 5:
  - #7: each customer has a credit limit; 0 means cash only. A sale that would take the
    customer over it is refused unless a manager approves (an approval request used once, or
    a user holding `sales.creditLimit.override`, which Managers and Admins have).
  - #8: tax is worked out and rounded on each line, half away from zero, so lines add up to
    the total.
  - #9: each company chooses whether sale prices include tax; new companies start with prices
    before tax. No tax rate is preset. Nigeria's standard VAT rate is entered by the company
    or its accountant, because some goods are exempt or zero-rated.
- 2026-10-23: the owner accepted the recommendations for Phases 6 and 7:
  - #17: sales officers raise returns and refunds for a manager to approve; Managers post
    returns directly, and Accountants, Managers and Admins post refunds directly.
  - #18: returns have no time limit; whoever approves applies any shop policy.
  - #10: depreciation is charged for a full month when an asset is available for use on or
    before the 15th, and starts the next month otherwise. The same rule applies on disposal:
    an asset disposed of on or before the 15th is not charged for that month.
