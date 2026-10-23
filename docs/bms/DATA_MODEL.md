# BMS — Data model (Phase 0)

Status: **Draft for review**. Firestore collection paths. `★` = written only by server
commands. Every company document carries `companyId`, `createdAt`, `createdBy`,
`updatedAt`, `updatedBy`, `schemaVersion`.

## 1. Numeric representation

| Kind                    | Stored as                                                                                                  | Example                     |
| ----------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------- |
| Money                   | integer **minor units** (`number`, asserted `Number.isSafeInteger`)                                        | ₦1,250.50 → `125050`        |
| Quantity                | integer **milli-units** of the product's base unit (3 dp)                                                  | 2.5 kg → `2500`             |
| Unit cost               | integer in minor units × 10⁴ (`costScaled`)                                                                | ₦12.34567/unit → `12345670` |
| Rates (tax, discount %) | integer basis points × 100 (6 dp of percent)                                                               | 7.5% → `750000`             |
| Dates                   | `postingDate` as `YYYY-MM-DD` string (business date, company time zone) plus server `Timestamp`s for audit |

All arithmetic in `packages/domain` uses `bigint`; values are range-checked before storage.
Rounding: half-away-from-zero to the minor unit at line level; document totals are sums of
rounded lines (see ACCOUNTING_POLICIES §9).

## 2. Platform and identity

```
users/{uid}                         displayName, email, status, defaultCompanyId
users/{uid}/memberships/{companyId} ★ mirror for the company switcher (name, role names, status)
platformAdmins/{uid}                ★ granted by script only
platformAuditLogs/{id}              ★ actor, action, targetCompanyId, reason, at
invitations/{inviteId}              ★ companyId, email (normalised), roleIds, branchIds,
                                      tokenHash, expiresAt, status, invitedBy
```

## 3. Tenancy, access, settings (Phase 1)

```
companies/{companyId}                ★ legalName, tradingName, country, baseCurrency,
                                       timeZone, fiscalYearStartMonth, status, plan,
                                       costingMethod (locked after first stock posting),
                                       businessTypes: ['trading'] (later 'services','production')
  branches/{branchId}                ★ code, name, address, status, isHeadOffice
  members/{uid}                      ★ email, displayName, status (active|suspended|removed),
                                       roleIds[], branchScope ('all' | branchIds[]),
                                       joinedAt, invitedBy
  roles/{roleId}                     ★ name, system (bool), permissions[] (strings), description
  settings/general                   ★ numbering, rounding, backdateWindowDays,
                                       allowNegativeStock=false, approvalPolicies{}
  settings/numbering/{seriesId}      ★ docType, branchId, prefix, nextNumber (transactional)
  fiscalYears/{fyId}                 ★ startDate, endDate, status (open|closed)
  periods/{YYYY-MM}                  ★ startDate, endDate, status (open|soft_closed|closed),
                                       closedBy, closedAt, reopenedBy, reopenReason
  commands/{idempotencyKey}          ★ type, payloadHash, status, result, uid, at
  auditLogs/{id}                     ★ actorUid, action, entityType, entityId, before?, after?,
                                       reason?, ip?, userAgent?, at
  attachments/{id}                   ★ entityType, entityId, storagePath, mime, size, status
  approvalRequests/{id}              ★ action, payload, requestedBy, status, decidedBy, reason
```

Permission strings follow `module.resource.action`, e.g. `settings.periods.close`,
`sales.invoice.post`, `ledger.journal.reverse`, `inventory.adjustment.approve`. The catalogue
lives in `packages/domain/permissions.ts`; roles store subsets. System role templates
(Company Admin, Manager, Sales Officer, Store Officer, Accountant, Auditor) are seeded at
company creation and can be copied and customised, not deleted.

## 4. Ledger (Phase 2, as built)

```
  accounts/{accountId}               ★ code, name, type (asset|liability|equity|income|expense),
                                       subtype (role: cash|bank|receivable|payable|inventory|
                                       grni|inputTax|outputTax|retainedEarnings|
                                       openingBalanceEquity|revenue|cogs|...), parentId,
                                       isPostable (false = heading), isControl (derived from
                                       subtype), status, hasPostings, template {id, version}
  journals/{journalId}               ★ number, postingDate, periodId, branchId,
                                       origin (manual|opening_balance|reversal|system),
                                       currency, memo, reference, lines[] (embedded, ≤200, with
                                       accountCode/accountName snapshots), totalDebit,
                                       totalCredit, status (posted|reversed),
                                       reversesJournalId, reversedByJournalId, reversalReason,
                                       backdateApprovalId, postedAt, postedBy
  ledgerEntries/{journalId}_{lineNo} ★ journalId, journalNumber, lineNo, accountId,
                                       postingDate, periodId, branchId, origin, debit, credit,
                                       memo, postedAt
  numberSeries/{seriesId}            ★ prefix, next (journal.manual JV, journal.opening OB,
                                       journal.reversal RV, journal.system SJ)
  settings/ledger                    ★ openingBalanceJournalId
  approvalRequests/{id}              ★ action period.reopen {periodId} |
                                       ledger.backdate {postingDate}; usedFor
  periodBalances/{periodId_accountId}★ snapshot written at period close (not built yet)
```

Posting services find special accounts by role (`subtype`), so there is no separate
account-mappings document; the roles that must be unique (retained earnings, opening balance
equity) are enforced on account creation. Only the link fields of a posted journal
(`status`, `reversedByJournalId`, `reversalReason`) ever change.

Invariant (tested): for every journal `Σdebit = Σcredit > 0`; every line has exactly one of
debit/credit > 0; account is postable, active, same company; control accounts only from
their module.

## 5. Catalogue and inventory (Phase 3, as built)

```
  categories/{categoryId}            name, status
  products/{productId}               sku (unique per company), name, unit (fixed list in
                                     packages/domain UNITS), categoryId, description,
                                     salePrice (minor units), reorderLevelMilli, status,
                                     hasMovements
  locations/{branchId-store|branchId-quarantine|id}
                                     branchId, name, type (store|quarantine), status
  stockBalances/{productId__locationId} ★ productId, locationId, branchId, qtyMilli,
                                       valueMinor, nextLayerSeq
  costLayers/{id}                    ★ FIFO only: productId, locationId, seq, open,
                                       qtyRemainingMilli, valueRemainingMinor, source
  stockMovements/{id}                ★ productId, locationId, branchId, qtyMilli (+/-),
                                       valueMinor (+/-), balanceQtyMilli, balanceValueMinor,
                                       movementType, postingDate, sourceType, sourceId,
                                       sourceNumber, journalId, postedAt
  stockAdjustments/{id}              kind (adjustment|count|opening), number (ADJ/CNT/OST),
                                     locationId, branchId, reason, status
                                     (pending|posted|rejected), lines[{lineNo, productId,
                                     sku, productName, unit, enteredMilli, expectedMilli?,
                                     deltaMilli, unitCostScaled?, valueMinor?}], createdBy,
                                     decidedBy, decisionReason, postingDate, journalId,
                                     valueMinor
```

★ server-written only. The average cost is not stored: it is `valueMinor / qtyMilli`, so the
balance can never drift from the value it was derived from. When an issue empties a balance
it takes the exact remaining value, so no rounding residue is left behind. Costing method
lives on the company (`costingMethod`) and is locked by `locks.costingMethod` at the first
stock posting. Unit conversions, product types, tax codes and per-category accounts are not
built yet (KNOWN_LIMITATIONS.md).

## 6. Suppliers and purchasing (Phase 4, as built)

```
  suppliers/{id}                     code (unique), name, contactName, phone, email, address,
                                     taxId, paymentTermsDays, status,
                                     ★ balanceMinor (owed), ★ advanceMinor (paid in advance)
  goodsReceipts/{id}                 ★ number GRN-…, supplierId, locationId, branchId,
                                     postingDate, reference, lines[{lineNo, productId, sku,
                                     productName, unit, qtyMilli, unitCostScaled, valueMinor,
                                     clearedQtyMilli, clearedValueMinor}], totalMinor,
                                     invoiceStatus, journalId
  purchaseInvoices/{id}              ★ number PI-…, kind (invoice|opening), supplierId,
                                     supplierInvoiceNo, branchId, invoiceDate, dueDate,
                                     lines[{kind receipt|expense|landed|opening, amountMinor,
                                     receipt link and quantity, grniMinor, inventoryMinor,
                                     cogsMinor, returnedQtyMilli, returnedCreditMinor, basis,
                                     accountId}], inputTaxMinor, totalMinor, paidMinor,
                                     creditedMinor, status (open|paid), journalId
  supplierInvoiceKeys/{hash}         ★ server-only; makes supplier invoice numbers unique
  supplierPayments/{id}              ★ number SP-…, supplierId, branchId, postingDate,
                                     paymentAccountId, amountMinor, allocatedMinor,
                                     allocations[{invoiceId, invoiceNumber, amountMinor,
                                     journalId, allocatedAt}], journalId
  supplierReturns/{id}               ★ number SR-…, supplierId, locationId, branchId,
                                     postingDate, reason, lines[{goodsReceiptId, lineNo,
                                     invoiceId?, productId, qtyMilli, costMinor,
                                     creditMinor}], journalId
```

★ written only by the server. Supplier balances sum to 2100 Trade payables, advances to 1350,
and received-but-not-cleared receipt value to 2150 GRNI; an emulator test checks all three
after a mixed run. Sales returns and refunds follow the same pattern in Phase 6. Document lines snapshot product names and SKUs, so product edits never change
history. Posted documents are immutable; corrections are new documents.

## 7. Customers and sales (Phase 5, as built)

```
  taxCodes/{id}                      code (unique), name, rateBp (7.5% = 750), status
  customers/{id}                     code (unique), name, contactName, phone, email, address,
                                     taxId, paymentTermsDays, creditLimitMinor (0 = cash only),
                                     status, ★ balanceMinor (owes), ★ advanceMinor (paid ahead)
  salesInvoices/{id}                 ★ number SI-…, kind (invoice|opening), customerId (null =
                                     walk-in), customerName, branchId, locationId, invoiceDate,
                                     dueDate, pricesIncludeTax, lines[{productId, sku,
                                     productName, unit, qtyMilli, listPriceMinor,
                                     unitPriceMinor, discountMinor, netMinor, taxCodeId,
                                     taxCode, taxRateBp, taxMinor, grossMinor, costMinor,
                                     returnedQtyMilli, returnedNetMinor, returnedTaxMinor,
                                     returnedCostMinor}], netMinor, taxMinor, totalMinor,
                                     costMinor, payments[{accountId, accountName,
                                     amountMinor}], paidMinor, creditedMinor, returnedMinor,
                                     status
                                     (open|paid), creditOverride, journalId, postedBy
  customerReceipts/{id}              ★ number CR-…, customerId, branchId, postingDate,
                                     depositAccountId, amountMinor, allocatedMinor,
                                     refundedMinor, allocations[{invoiceId, invoiceNumber, amountMinor,
                                     journalId, allocatedAt}], journalId, postedBy
  stockAvailability/{product__loc}   ★ productId, locationId, branchId, qtyMilli — written with
                                     every stock balance, readable by sales staff (no values)
```

Customer balances sum to 1200 Trade receivables and advances to 2250 Customer advances; an
emulator test checks both. `paidMinor` on an invoice counts money taken at the sale and
receipts allocated to it. Sales officers (`sales.readOwn`) read only documents with their own
`postedBy`, so their queries filter on it. Credit-limit approvals are `approvalRequests` with
action `sales.creditOverride` and target {customerId, customerName, amountMinor}.

## 8. Returns, credit notes and refunds (Phase 6, as built)

```
  creditNotes/{id}        ★ number CN-…, invoiceId, invoiceNumber, customerId (null = walk-in),
                          customerName, branchId, reason, lines[{lineNo (the sale line),
                          productId, sku, productName, unit, qtyMilli, condition
                          (resalable|damaged), locationId, ★ netMinor, taxMinor, costMinor}],
                          quarantineLocationId, refundAccountId (walk-in only), status
                          (pending|posted|rejected), createdBy, decidedBy, decisionReason,
                          ★ postingDate, netMinor, taxMinor, totalMinor, costMinor,
                          allocatedMinor, refundedMinor, allocations[], journalId
  customerRefunds/{id}    ★ number RF-…, customerId, branchId, source {type
                          (customerReceipt|creditNote), id, number}, accountId, accountName,
                          amountMinor, reason, reference, status (pending|posted|rejected),
                          createdBy, decidedBy, decisionReason, ★ postingDate, journalId
```

A credit note posted straight away (by someone with `sales.return.post`) or on approval holds
its amounts; a pending one holds only what was asked for and is re-checked when approved.
What a customer can still use or be paid back from a receipt or credit note is its amount less
`allocatedMinor` and `refundedMinor`; the customer's `advanceMinor` is the sum of those.
Sales officers read only returns and refunds with their own `createdBy`.

## 9. Bank reconciliation (Phase 6, as built)

```
  bankStates/{accountId}       ★ reconciledBalanceMinor, lastStatementDate, lastReconciliationId
  bankReconciliations/{id}     ★ accountId, accountName, statementDate, openingBalanceMinor,
                               statementBalanceMinor, entryIds[], clearedDebitMinor,
                               clearedCreditMinor, completedBy
  bankClearings/{entryId}      ★ accountId, reconciliationId, statementDate — one per ledger
                               entry cleared, so an entry can be cleared only once
```

## 10. Fixed assets (Phase 7)

```
  assetCategories/{id}   default life, method, accounts
  assets/{id}            cost, residual, usefulLifeMonths, availableForUseDate,
                         depreciationStartDate, method, status, accumulatedDepreciation ★
  depreciationRuns/{id}  ★ periodId, status, journalId
```

## 11. Indexes (initial)

`ledgerEntries`: (accountId, postingDate), (accountId, postingDate desc), (journalId, lineNo); later (partyId, postingDate).
`stockMovements`: (productId, postedAt desc). `costLayers`: (productId, locationId, open, seq).
`stockBalances`: (locationId, qtyMilli). Purchasing documents: (supplierId, postedAt desc);
`goodsReceipts`: (supplierId, invoiceStatus, postedAt desc); `purchaseInvoices`: (supplierId,
status, dueDate) and (status, dueDate). `salesInvoices` and `customerReceipts`: (customerId,
postedAt desc), (postedBy, postedAt desc), (customerId, postedBy, postedAt desc);
`salesInvoices`: (customerId, status, dueDate), (customerId, postedBy, status, dueDate),
(status, dueDate). `approvalRequests`: (action, target.customerId, requestedBy, status).
`creditNotes` and `customerRefunds`: (createdBy, createdAt desc), (customerId, createdAt desc),
(customerId, createdBy, createdAt desc), (status, createdAt desc); `creditNotes`: (invoiceId,
createdAt desc), (invoiceId, createdBy, createdAt desc); `customerRefunds`: (source.id,
createdAt desc), (source.id, createdBy, createdAt desc). `bankReconciliations`: (accountId,
completedAt desc).
`journals`: (postingDate),
(sourceType, sourceId). `auditLogs`: (entityType, entityId, at), (actorUid, at).
Defined in `firestore.indexes.json` and reviewed each phase.
