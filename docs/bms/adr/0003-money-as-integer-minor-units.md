# ADR-0003: Money as integer minor units, bigint arithmetic

Status: Proposed
Decision: Store money as safe integers in minor units, quantities in milli-units, unit costs scaled by 10^4. Domain arithmetic uses bigint with explicit half-away-from-zero rounding and exact allocation (largest remainder).
Consequences: no float drift; values above 2^53 minor units (~₦90 trillion) rejected, acceptable for SMEs.
