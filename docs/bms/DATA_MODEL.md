# BMS — Data model (Phase 0)

Status: **Draft for review**. Firestore collection paths. `★` = written only by server
commands. Every company document carries `companyId`, `createdAt`, `createdBy`,
`updatedAt`, `updatedBy`, `schemaVersion`.

## 1. Numeric representation

| Kind | Stored as | Example |
|---|---|---|
| Money | integer **minor units** (`number`, asserted `Number.isSafeInteger`) | ₦1,250.50 → `125050` |
| Quantity | integer **milli-units** of the product's base unit (3 dp) | 2.5 kg → `2500` |
| Unit cost | integer in minor units × 10⁴ (`costScaled`) | ₦12.34567/unit → `123457` |
| Rates (tax, discount %) | integer basis points × 100 (6 dp of percent) | 7.5% → `750000` |
| Dates | `postingDate` as `YYYY-MM-DD` string (business date, company time zone) plus server `Timestamp`s for audit |

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

## 4. Ledger (Phase 2)

```
  accounts/{accountId}               ★ code, name, type (asset|liability|equity|income|expense),
                                       subtype (cash|bank|receivable|payable|inventory|
                                       grni|tax|fixedAsset|accumDepreciation|cogs|...),
                                       parentId, isPostable, isControl, status, currency
  accountMappings/{transactionType}  ★ map of role → accountId (e.g. sale.revenue, sale.ar)
  journals/{journalId}               ★ number, postingDate, periodId, sourceType, sourceId,
                                       sourceNumber, memo, lines[] (embedded, ≤200),
                                       totalDebit, totalCredit, status (posted|reversed),
                                       reversesJournalId?, reversedByJournalId?, batchId?
  ledgerEntries/{entryId}            ★ journalId, lineNo, accountId, postingDate, periodId,
                                       debit, credit, branchId, partyId?, productId?,
                                       sourceType, sourceId, batchStatus
  periodBalances/{periodId_accountId}★ snapshot written at period close
  openingBalanceBatches/{batchId}    ★ status, asAtDate, lines, chunk progress
```

Invariant (tested): for every journal `Σdebit = Σcredit > 0`; every line has exactly one of
debit/credit > 0; account is postable, active, same company.

## 5. Catalogue and inventory (Phase 3)

```
  units/{unitId}                     code, name, decimals
  categories/{categoryId}            name, parentId, default accounts override?
  products/{productId}               sku, name, productType, categoryId, baseUnitId,
                                     unitConversions[{unitId, factorMilli}], salePrice,
                                     reorderLevel, trackStock, status, taxCodeId?
  locations/{locationId}             branchId, type (store|quarantine|...), name
  stockBalances/{productId_locationId} ★ qtyMilli, valueMinor, avgCostScaled (WAC)
  costLayers/{layerId}               ★ FIFO: productId, locationId, receivedAt, qtyRemaining,
                                       costScaled, sourceRef
  stockMovements/{movementId}        ★ productId, locationId, branchId, qtyMilli (+/-),
                                       unitCostScaled, valueMinor, movementType, postingDate,
                                       sourceType, sourceId, journalId
  stockCounts/{countId}              count sheets → posted as adjustments (durable batch)
```

## 6. Parties and documents (Phases 4–6)

```
  parties/{partyId}                  kind flags {customer, supplier}, name, contacts[],
                                     creditLimit?, paymentTermsDays, status
  purchaseInvoices/{id}, goodsReceipts/{id}, supplierPayments/{id}, supplierReturns/{id}
  sales/{id}, customerReceipts/{id}, salesReturns/{id}, creditNotes/{id}, refunds/{id}
  allocations/{id}                   ★ payment/credit ↔ invoice links with amounts
  landedCosts/{id}                   charges + allocation basis + target receipt lines
  cashAccounts/{id}                  links a ledger account (cash or bank) to a branch/till
```

Document lines snapshot `productName`, `sku`, `unitCode`, `factorMilli`, `unitPrice`,
`discount`, `taxCode`, `taxRate` at the time of posting, so product edits never change history.
Document status: `draft → posted → (partially_paid|paid|returned_partial|returned|voided_by_reversal)`.
Posted documents are immutable; corrections are reversals or new documents.

## 7. Fixed assets (Phase 7)

```
  assetCategories/{id}   default life, method, accounts
  assets/{id}            cost, residual, usefulLifeMonths, availableForUseDate,
                         depreciationStartDate, method, status, accumulatedDepreciation ★
  depreciationRuns/{id}  ★ periodId, status, journalId
```

## 8. Indexes (initial)

`ledgerEntries`: (accountId, postingDate), (partyId, postingDate), (sourceType, sourceId).
`stockMovements`: (productId, locationId, postingDate). `journals`: (postingDate),
(sourceType, sourceId). `auditLogs`: (entityType, entityId, at), (actorUid, at).
Defined in `firestore.indexes.json` and reviewed each phase.
