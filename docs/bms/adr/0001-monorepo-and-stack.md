# ADR-0001: pnpm monorepo with shared domain and schema packages
Status: Proposed
Context: Web and functions must share validation and money logic without letting the web app import posting code.
Decision: pnpm workspaces: apps/web, functions, packages/domain (pure TS), packages/schemas (Zod), packages/test-utils. Node 22 LTS, TypeScript strict, exact-pinned versions, committed pnpm-lock.yaml.
Consequences: one CI pipeline; boundary enforced by ESLint import rules.
