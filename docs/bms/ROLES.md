# Default role templates (proposed)

R = read, W = create/edit drafts, P = post, A = approve, — = none. Companies can copy and
customise templates. Platform Super Admin is not a company role.

| Area                        | Company Admin | Manager | Sales Officer  | Store Officer  | Accountant   | Auditor |
| --------------------------- | ------------- | ------- | -------------- | -------------- | ------------ | ------- |
| Members, roles, invitations | W             | R       | —              | —              | R            | R       |
| Company settings, branches  | W             | R       | —              | —              | R            | R       |
| Financial periods close     | P             | —       | —              | —              | P            | R       |
| Period reopen               | A             | —       | —              | —              | request      | R       |
| Chart of accounts, mappings | W             | R       | —              | —              | W            | R       |
| Manual journals             | P             | R       | —              | —              | P            | R       |
| Journal reversal            | A             | —       | —              | —              | P (approval) | R       |
| Products, categories, units | W             | W       | R              | W              | R            | R       |
| Stock adjustments           | A             | A       | —              | W (approval)   | R            | R       |
| Stock counts                | A             | A       | —              | W              | R            | R       |
| Suppliers                   | W             | W       | —              | R              | W            | R       |
| Purchases, goods receipts   | P             | P       | —              | W (receipts P) | P            | R       |
| Supplier payments           | A             | P       | —              | —              | P            | R       |
| Customers, credit limits    | W             | W       | —              | —              | W            | R       |
| Credit limit override       | A             | A       | request        | —              | —            | R       |
| Sales / POS                 | P             | P       | P (own branch) | —              | R            | R       |
| Customer receipts           | P             | P       | P              | —              | P            | R       |
| Sales returns, credit notes | P             | P, A    | request        | —              | R            | R       |
| Refunds                     | P             | P, A    | request        | —              | P            | R       |
| Bank reconciliation         | P             | R       | —              | —              | P            | R       |
| Backdated postings          | A             | A       | —              | —              | request      | R       |
| Fixed assets, depreciation  | A             | R       | —              | —              | P            | R       |
| Quotations                  | W             | W       | W              | —              | R            | R       |
| Projects                    | W             | W       | —              | —              | W            | R       |
| Production orders, BOMs     | W             | W       | —              | W              | R            | R       |
| Production direct costs     | P             | P       | —              | —              | P            | R       |
| Reports                     | R             | R       | own sales      | stock only     | R            | R       |
| Audit log                   | R             | R       | —              | —              | R            | R       |

DECISION: confirm this matrix, especially who may approve refunds and stock adjustments,
and whether a requester can approve their own request (proposed: **never**).
