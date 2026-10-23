# Load and concurrency testing

`tests/integration/load.test.ts` runs with the emulator tests (`pnpm test:emulator`). It fires
requests at one company at the same time through the real command pipeline and checks the
results, not just that nothing crashed.

| Test                    | Load                                | Checked                                                                                              |
| ----------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Journals posted at once | 20 manual journals, one company     | all posted, numbers JV-000001…20 with no gap or repeat, debits = credits                             |
| Simultaneous retries    | 10 copies of one request (same key) | one journal, one set of ledger entries, every caller gets the same id                                |
| Sales racing for stock  | 15 cash sales of 1 bag, 10 in stock | exactly 10 sold, 5 refused `insufficient_stock`, stock 0 at 0 value, numbers gap-free, books balance |

Results on the emulators, 2026-10-23: all three passed; 20 journals took about 12 s and 15
sales about 14 s.

## What the timings mean

The emulator runs transactions one at a time with pessimistic locks, so these times show
correctness under contention, not production speed. Production Firestore handles this
better but has the same shape: every posting in a company updates that company's number
series document, and Firestore sustains roughly one write a second per document before
contention grows. So **one company can post a few documents a second**, more in short bursts.
That is ample for an SME's tills and back office; a company with many tills posting
continuously would need per-branch or per-till series. Transactions that lose a contention
race are retried; one that still fails is refused as a whole and the user can retry, with
the idempotency key preventing a double posting.

## Not done yet

- A load test against a real staging project (needs DEPLOYMENT.md first). Suggested: a
  script signing in five test users and posting sales from each for ten minutes, watching
  latency and errors in Cloud Run metrics.
- Report load with a large ledger (many thousands of entries).
