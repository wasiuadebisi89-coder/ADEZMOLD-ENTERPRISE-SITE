# ADR-0004: Account balances from ledger entries, not running counters

Status: Proposed
Context: Firestore sustains ~1 write/s per document; a running balance doc for the cash or sales account would bottleneck a busy POS and cause transaction contention.
Decision: ledgerEntries are the source of truth; balances use Firestore sum() aggregation over date ranges; period-close writes periodBalances snapshots. Stock balances per product/location remain transactional (needed for negative-stock checks and WAC).
Consequences: report queries cost reads proportional to entries in open periods; reconciliation job verifies snapshots against entries.

Note (2026-11-02): a sum() query needs a composite index that also holds the summed fields, after the filter fields (for example `accountId, postingDate, credit, debit` on ledgerEntries). The emulators do not check indexes, so a missing one only shows on a real project, as a failed-precondition error naming the index to create.
