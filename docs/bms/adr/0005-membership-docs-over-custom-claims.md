# ADR-0005: Company roles from membership documents, not custom claims
Status: Proposed
Decision: Rules and functions read companies/{c}/members/{uid}. Custom claims only carry platformAdmin. Suspension takes effect immediately without token refresh.
Consequences: one extra document read per rules evaluation (cached within a request).
