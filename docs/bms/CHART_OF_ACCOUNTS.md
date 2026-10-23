# Trading company chart of accounts

Status: **Confirmed by the owner on 2026-10-23** (OPEN_DECISIONS #14). It is applied automatically to
every new company and can then be adapted: rename accounts, add accounts and headings,
deactivate accounts you do not use. Codes, types and roles are fixed once an account exists.

Source of truth: `packages/domain/src/chart.ts` (`TRADING_TEMPLATE`, version 1). A unit test
checks that codes are unique, every account sits under a heading of the same type, and each
role the posting services look up exists exactly once.

**Headings** group accounts for reports and take no postings. **Control accounts** must
always equal a subledger (customers, suppliers, stock), so they only accept postings from
their own module, never from manual journals or the general opening-balance journal.

| Code | Account                             | Type      | Role                     | Notes                                      |
| ---- | ----------------------------------- | --------- | ------------------------ | ------------------------------------------ |
| 1000 | **Assets**                          | Asset     | heading                  |                                            |
| 1100 | — **Cash and bank**                 | Asset     | heading                  |                                            |
| 1110 | — — Cash on hand                    | Asset     | Cash                     |                                            |
| 1120 | — — Bank current account            | Asset     | Bank                     | Add one account per bank account           |
| 1200 | — Trade receivables                 | Asset     | Trade receivables        | Control account (customers, Phase 5)       |
| 1250 | — Other receivables, prepayments    | Asset     | General                  |                                            |
| 1300 | — Inventory                         | Asset     | Inventory                | Control account (stock, Phase 3)           |
| 1350 | — Advances to suppliers             | Asset     | Supplier advances        |                                            |
| 1400 | — Input tax recoverable             | Asset     | Input tax                | Used only if the company sets up tax codes |
| 1500 | — **Property, plant and equipment** | Asset     | heading                  |                                            |
| 1510 | — — Furniture and fittings          | Asset     | Fixed asset              |                                            |
| 1520 | — — Motor vehicles                  | Asset     | Fixed asset              |                                            |
| 1530 | — — Office equipment                | Asset     | Fixed asset              |                                            |
| 1590 | — — Accumulated depreciation        | Asset     | Accumulated depreciation | Contra-asset: normally a credit balance    |
| 2000 | **Liabilities**                     | Liability | heading                  |                                            |
| 2100 | — Trade payables                    | Liability | Trade payables           | Control account (suppliers, Phase 4)       |
| 2150 | — Goods received not invoiced       | Liability | GRNI                     | Control account (purchases, Phase 4)       |
| 2200 | — Output tax payable                | Liability | Output tax               | Used only if the company sets up tax codes |
| 2250 | — Customer advances and credits     | Liability | Customer advances        |                                            |
| 2300 | — Accruals and other payables       | Liability | General                  |                                            |
| 2400 | — Loans and borrowings              | Liability | General                  |                                            |
| 3000 | **Equity**                          | Equity    | heading                  |                                            |
| 3100 | — Share capital                     | Equity    | General                  |                                            |
| 3200 | — Retained earnings                 | Equity    | Retained earnings        | Year-end close target (Phase 7)            |
| 3300 | — Opening balance equity            | Equity    | Opening balance equity   | Takes the opening-balance difference       |
| 4000 | **Income**                          | Income    | heading                  |                                            |
| 4100 | — Sales revenue                     | Income    | Revenue                  |                                            |
| 4900 | — Other income                      | Income    | General                  |                                            |
| 5000 | **Cost of sales**                   | Expense   | heading                  |                                            |
| 5100 | — Cost of goods sold                | Expense   | Cost of goods sold       |                                            |
| 5200 | — Inventory adjustments             | Expense   | Inventory adjustments    |                                            |
| 5300 | — Purchase price variance           | Expense   | Purchase price variance  |                                            |
| 6000 | **Operating expenses**              | Expense   | heading                  |                                            |
| 6100 | — Salaries and wages                | Expense   | General                  |                                            |
| 6200 | — Rent                              | Expense   | General                  |                                            |
| 6300 | — Utilities                         | Expense   | General                  |                                            |
| 6400 | — Transport and delivery            | Expense   | General                  |                                            |
| 6500 | — Repairs and maintenance           | Expense   | General                  |                                            |
| 6600 | — Depreciation                      | Expense   | Depreciation             |                                            |
| 6700 | — Bank charges                      | Expense   | General                  |                                            |
| 6900 | — Other expenses                    | Expense   | General                  |                                            |

## Questions for the owner

1. Does the business need separate revenue accounts (for example by product line or branch)?
   Branch is already recorded on every ledger line, so per-branch revenue does not need
   separate accounts.
2. Which bank accounts should exist from day one?
3. Are there loans, staff advances or director's current accounts to add?
4. No tax accounts are used until the company sets up tax codes (OPEN_DECISIONS #9); no tax
   rate is seeded.
