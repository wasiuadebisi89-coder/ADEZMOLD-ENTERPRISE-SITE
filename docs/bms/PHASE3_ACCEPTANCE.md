# Phase 3 acceptance tests — catalogue and inventory

Each item is covered by an automated test. Domain rules are unit-tested in
`packages/domain/src/inventory.test.ts`; integration tests run the real command pipeline
against the Firestore and Auth emulators (`tests/integration/phase3.test.ts`); rules tests run
against `firestore.rules` (`tests/rules/firestore.rules.test.ts`, "inventory records");
end-to-end tests drive the web app (`tests/e2e/phase3.spec.ts`).

## I1 Locations and catalogue

- I1.1 Every branch gets a store and a quarantine location, on company and branch creation.
  A location holding stock cannot be deactivated.
- I1.2 SKUs are unique per company; the unit comes from a fixed list and cannot change; a
  category must exist and be active.
- I1.3 Only `inventory.products.manage` can change products and categories; locations need
  `company.branches.manage`.

## I2 Opening stock

- I2.1 An opening-stock request (`OST-…`) changes nothing until a second person with
  `inventory.adjustment.approve` approves it. Approval then writes the stock balance,
  movements, cost layers (FIFO), a journal Dr 1300 Inventory / Cr 3300 Opening balance
  equity, one audit entry, and locks the costing method, in one transaction.
- I2.2 Self-approval, a missing unit cost and a second opening for the same product and
  location are refused.

## I3 Weighted average costing

- I3.1 Additions re-average the cost; removals are valued at the current average; an issue
  that empties a location takes its exact remaining value.
- I3.2 An increase with no cost uses the current average; with no stock to average from a
  cost is required.
- I3.3 Stock never goes negative. A posting that would do so is refused and the request
  stays pending.

## I4 Stock counts

- I4.1 A count (`CNT-…`) records the system quantity when entered; on approval the
  difference (counted − expected) is posted against 5200 Inventory adjustments. Counts need
  `inventory.count.create` and `inventory.count.approve`.

## I5 FIFO costing

- I5.1 FIFO can be chosen in Settings before any stock posting; issues consume the oldest
  layers first; the method is locked after the first stock posting.

## I6 Rejection, permissions and branch scope

- I6.1 A rejected adjustment changes no stock and posts nothing.
- I6.2 Sales officers cannot create or approve adjustments; staff limited to a branch can
  only adjust stock at that branch's locations.
- I6.3 Clients cannot write any inventory record; cost layers are server-only; sales
  officers can read products but not stock values, movements or adjustments; other
  companies cannot read anything.

## I7 Stock and ledger agree

- I7.1 After a mix of openings, adjustments and counts, the 1300 Inventory balance equals
  the total value of stock on hand.

## I8 Web

- I8.1 Store flow end to end: the owner creates a product and invites a store officer; the
  store officer records opening stock and cannot approve it; the owner approves; the journal
  shows the inventory and equity lines; a count posts the shortfall; the stock card shows
  balances and movements; the costing method is locked. No accessibility violations.
- I8.2 The stock adjustment form fits a phone screen.
