# Company registration approvals

BMS is a SaaS: anyone can sign up and register a company, but a company only goes live once the
platform owner approves it.

## Lifecycle

| Status      | Meaning                                    | Members see                          |
| ----------- | ------------------------------------------ | ------------------------------------ |
| `pending`   | Registered, waiting for the platform owner | "Waiting for approval" screen        |
| `active`    | Approved; the app works                    | The app                              |
| `rejected`  | Not approved; reason recorded              | "Registration not approved" + reason |
| `suspended` | Was active; switched off, records kept     | "Company suspended" + reason         |

Allowed changes (`platform.setCompanyStatus`): pending → active or rejected; active →
suspended; suspended → active; rejected → active. Every change except approving needs a reason,
which the company's members see. Every change is written to `platformAuditLogs`.

Only `active` companies can run commands: the command pipeline refuses the rest
(`company_pending_approval`, `company_inactive`), so nothing can be posted in a company before
it is approved. Members can still read the company record, which is how the waiting screen sees
the decision and opens the company by itself.

Companies created before approvals existed already have `status: "active"` and keep working.
The platform owner's own registrations are approved at once.

## Who approves

The platform owner is whoever signs in with an address listed in `PLATFORM_OWNER_EMAILS`
(DEPLOYMENT.md §6) with a verified email. On their first visit to `/platform`, the
`platform.claimAdmin` command writes `platformAdmins/{uid}` and sets the `platformAdmin` custom
claim. The rules and the server require both. Platform admins can read company records (name,
registrant, status) and the platform audit log, but not any company's books.

## Dashboard

`/platform` (also linked as **Registrations** in the top bar for the platform owner) shows the
number waiting, and tabs for awaiting approval, active, suspended and not approved, newest first.
