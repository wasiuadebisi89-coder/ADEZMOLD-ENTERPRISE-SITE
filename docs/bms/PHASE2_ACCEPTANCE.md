# Phase 2 acceptance tests — ledger

Each item is covered by an automated test. Integration tests run the real command pipeline
against the Firestore and Auth emulators (`tests/integration/phase2.test.ts`); rules tests run
against `firestore.rules` (`tests/rules/firestore.rules.test.ts`, "ledger records");
end-to-end tests drive the web app (`tests/e2e/phase2.spec.ts`).

## L1 Chart of accounts

- L1.1 A new company gets the trading template (CHART_OF_ACCOUNTS.md) with headings, roles
  and control flags.
- L1.2 A template can only be applied to an empty chart.
- L1.3 New accounts: unique code, role allowed for the type, heading of the same type, at
  most one retained-earnings and one opening-balance-equity account.
- L1.4 Only `ledger.accounts.manage` can change the chart.

## L2 Manual journals

- L2.1 A balanced journal writes the journal, one ledger entry per line, the next number
  (`JV-000001`, …), one audit entry, and locks the base currency and financial-year start.
- L2.2 Unbalanced journals, lines with both or neither side, too many decimals, headings,
  inactive accounts and control accounts are rejected and nothing is written.
- L2.3 A retried request with the same idempotency key returns the first result and posts once;
  reusing the key for a different journal is refused.
- L2.4 Posting needs `ledger.journal.post` and a branch inside the member's branch scope.

## L3 Posting dates

- L3.1 Future dates and dates without a financial period are refused.
- L3.2 Closed periods refuse postings; soft-closed periods refuse users without
  `settings.periods.postSoftClosed`.
- L3.3 Dates older than the backdating window (3 days, OPEN_DECISIONS #4) need an approved
  `ledger.backdate` request for that date, raised by the poster and approved by someone else
  with `ledger.backdate.approve`. It is used once and records the journal it was used for.

## L4 Reversals

- L4.1 Reversal posts a mirror journal (`RV-…`), links both ways, marks the original
  `reversed`, and leaves its lines and amounts unchanged; the accounts net to zero.
- L4.2 A journal cannot be reversed twice, a reversal cannot be reversed, and a reversal
  cannot be dated before the original.
- L4.3 Reversal needs `ledger.journal.reverse`.

## L5 Opening balances

- L5.1 Opening balances post once (`OB-…`); the difference goes to opening balance equity and
  is reported. Reversing the journal allows a new one.
- L5.2 Control accounts and the equity account itself are refused (subledger opening balances
  come with their modules).

## L6 Invariants and access

- L6.1 Every journal balances, totals more than zero, and the trial balance built from
  ledger-entry sums balances and matches the journals.
- L6.2 Clients cannot write, edit or delete accounts, journals, ledger entries or number
  series; sales officers cannot read the ledger, auditors can; other companies cannot.
- L6.3 Web: the accountant flow (chart → journal → reversal → opening balances → trial
  balance) works end to end with no accessibility violations, and journal entry fits a phone
  screen.
