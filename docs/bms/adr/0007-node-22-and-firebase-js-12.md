# ADR-0007: Node 22 runtime, Firebase JS SDK 12, React Router 8

Status: Accepted (Phase 1)

Context: The latest Firebase JS SDK (13.x) and `@firebase/rules-unit-testing` 6.x require
Node ≥ 24.12. Cloud Functions, CI and the development container currently use Node 22 LTS.

Decision: Use Node 22 everywhere, Firebase JS SDK 12.19.0 in the web app and tests, and
`firebase-admin` 14 / `firebase-functions` 7 in functions. All other dependencies use their
current releases, exact-pinned. Moving to Node 24 and Firebase JS 13 is a single follow-up
change once the Functions runtime choice is confirmed.

Consequences: One supported major behind on the Firebase web SDK; no API differences are
used that depend on 13.x.
