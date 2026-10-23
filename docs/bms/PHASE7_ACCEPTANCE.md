# Phase 7 acceptance tests — reports, financial statements and fixed assets

Each item is covered by an automated test. Depreciation and report rules are unit-tested in
`packages/domain/src/assets.test.ts` and `packages/domain/src/reports.test.ts`; integration
tests run the real command pipeline against the Firestore and Auth emulators
(`tests/integration/phase7.test.ts`); rules tests run against `firestore.rules`
(`tests/rules/firestore.rules.test.ts`, "fixed assets (Phase 7)"); end-to-end tests drive the
web app (`tests/e2e/phase7.spec.ts`).

## F1 Registering assets

- F1.1 Buying an asset (`FA-…`) posts Dr the fixed asset account / Cr the cash, bank or general
  liability or equity account chosen, dated the day bought, through the posting engine
  (periods and the backdating window apply).
- F1.2 An asset already owned at cut-over posts Dr cost / Cr accumulated depreciation to date /
  Cr Opening balance equity, and is charged from the month after the as-at date over the rest
  of its life.
- F1.3 Refused: residual value above cost, in use before it was bought, an account of the wrong
  kind for each role, and users without `assets.manage`.

## F2 Depreciation

- F2.1 DECISION 10: an asset in use on or before the 15th is charged for that month; after the
  15th, from the next month.
- F2.2 A run (`DR-…`) for a month charges every active asset in the branch up to that month in
  one journal, Dr depreciation / Cr accumulated depreciation, dated the month's last day.
  Missed months are caught up; a month already charged is not charged again; a month that has
  not ended cannot be run.
- F2.3 The charges add up exactly to cost less residual value; the last month takes the
  rounding and nothing is charged after the useful life.
- F2.4 Retrying the same request does not charge twice.

## F3 Disposal

- F3.1 Depreciation is caught up to the month before a disposal on or before the 15th, or
  including the month after it; then cost and accumulated depreciation are removed, the
  proceeds are recorded and the difference posts to the gain or loss account chosen.
- F3.2 A disposed asset is not charged again and cannot be disposed of twice; a disposal dated
  before months already charged is refused.

## F4 Reports

- F4.1 Profit and loss for any dates shows revenue, cost of sales, gross profit, other income,
  operating expenses and net profit.
- F4.2 The balance sheet as at any date shows non-current and current assets, liabilities,
  equity and profit not yet closed into retained earnings, and says whether it balances.
- F4.3 Receivables and payables ageing group unpaid invoices by days past due (not due, 1–30,
  31–60, 61–90, over 90) and compare the total with the control account.
- F4.4 Stock valuation totals stock on hand at cost and compares it with the Inventory account.
- F4.5 The fixed asset register compares cost and accumulated depreciation with the ledger.

## F5 Security

- F5.1 The register and depreciation runs are readable with `assets.read` only (not by sales
  officers), across tenants never, and are never written by a client.
- F5.2 Report tabs appear only for the permissions behind them; the figures are read under the
  existing ledger, sales, purchasing and stock rules.

## F6 Usability

- F6.1 The asset, depreciation, disposal and report screens have no WCAG 2 A/AA violations
  found by axe, and the reports fit a phone screen.
