# Open decisions for the owner

Each has a proposed safe default. Phase 1 can proceed on the defaults; items marked
**before Phase 2/3** must be confirmed before that phase posts any figures.

| #   | Decision                            | Proposed default                                                                                             | Needed by              |
| --- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------- |
| 1   | Accounting framework reference      | **Confirmed:** IFRS for SMEs                                                                                 | Phase 2                |
| 2   | Pilot base currency                 | NGN (one currency per company)                                                                               | Phase 1 (default only) |
| 3   | Fiscal year start                   | January, monthly periods                                                                                     | Phase 1 (default only) |
| 4   | Backdating window without approval  | **Confirmed:** 3 days                                                                                        | Phase 2                |
| 5   | Default inventory costing           | **Confirmed:** moving weighted average; FIFO optional, locked after first stock posting                      | Phase 3                |
| 6   | Stock adjustment approvals          | **Confirmed:** all adjustments need approval                                                                 | Phase 3                |
| 7   | Customer credit limit               | **Confirmed:** block over the limit (0 = cash only) unless a manager approves                                | Phase 5                |
| 8   | Tax rounding                        | **Confirmed:** per line, to the minor unit                                                                   | Phase 5                |
| 9   | Prices tax-inclusive or exclusive   | **Confirmed:** chosen per company, exclusive by default; rates entered per company, none seeded              | Phase 5                |
| 10  | Depreciation first-month convention | **Confirmed:** full month if available for use by the 15th, otherwise from the next month                    | Phase 7                |
| 11  | Role matrix and self-approval       | As in ROLES.md; no self-approval                                                                             | Phase 1                |
| 12  | Firebase region                     | **Confirmed:** europe-west1 (Belgium) for Firestore, Functions and Storage                                   | Phase 1 deploy         |
| 13  | Firebase projects / billing         | **Confirmed:** owner creates staging now on Blaze with a budget alert; production at go-live (DEPLOYMENT.md) | Phase 1 deploy         |
| 14  | Default chart of accounts template  | **Confirmed:** trading chart in CHART_OF_ACCOUNTS.md                                                         | Phase 2                |
| 15  | Sign-in methods                     | Email/password + verification; Google sign-in later                                                          | Phase 1                |
| 16  | Supplier payment approval           | **Confirmed:** none; anyone with `purchasing.payment.post` pays directly (Accountant, Manager, Admin)        | Phase 4                |
| 17  | Return and refund approvals         | **Confirmed:** sales officers' returns and refunds wait for a manager; others post directly                  | Phase 6                |
| 18  | Time limit on returns               | **Confirmed:** none; the approver applies any shop policy                                                    | Phase 6                |
| 19  | Service revenue recognition         | **Confirmed:** 4200 Service revenue, on the invoice date; unbilled work accrued by journal                   | Phase 9                |
| 20  | Project costs                       | **Confirmed:** expensed as incurred and tagged to the project; not held as work in progress                  | Phase 9                |
| 21  | Production costing                  | **Confirmed:** actual cost; materials at the costing method when issued, plus direct costs charged           | Phase 9                |
| 22  | Production losses                   | **Confirmed:** normal loss spread over good output; abnormal loss written off                                | Phase 9                |

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
- 2026-10-23: the owner asked us to pick a suitable region and to start staging and production
  on the free plan.
  - #12: europe-west1. Every service the product uses (Firestore, Cloud Functions 2nd gen,
    Cloud Run, Storage, scheduled backups) is available there, it is in Google's lowest price
    tier, and Firestore's location cannot be changed later, so we avoided a newer region.
  - #13: the free Spark plan cannot run Cloud Functions, which every write goes through, or
    managed backups. The owner chose staging on Blaze with a budget alert, and production
    created and upgraded at go-live. Project ids proposed: `adezmold-bms-staging`,
    `adezmold-bms-prod` (`.firebaserc`); change them there if those ids are taken.
- 2026-10-23: the owner accepted the recommended policies for Phase 9 (services and
  production):
  - #19: services are sold as service items and earn 4200 Service revenue on the invoice
    date. Work done but not yet invoiced at a month end is accrued by the accountant with a
    journal; nothing accrues automatically.
  - #20: a project is a tag. Its costs are expensed when incurred (to 5400 Direct service
    costs or any other account) and tagged, so the project shows its margin; nothing is
    carried as work in progress for services.
  - #21: production orders use actual cost. Materials leave stock at the company's costing
    method (weighted average by default) and direct costs such as labour are charged to the
    order. There are no standard costs and no overhead absorption rates.
  - #22: expected (normal) loss is recorded and its cost carried by the good output.
    Loss beyond that (abnormal) takes its share of the order's cost per unit and is written
    off to an expense account chosen when the order is completed.
