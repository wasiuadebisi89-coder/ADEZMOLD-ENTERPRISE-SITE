# ADR-0002: All company writes go through server commands
Status: Proposed
Context: Financial correctness and authorization cannot depend on client code; Firestore rules cannot express double-entry or stock invariants.
Decision: Clients have read-only access (rules-guarded). Every mutation is a callable Cloud Function command with authz, Zod validation, idempotency key and audit entry in one Firestore transaction.
Consequences: slightly higher latency for simple edits (master data); uniform audit and authorization; rules stay simple and testable.
