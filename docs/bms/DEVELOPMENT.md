# Development

Requirements: Node 22.22+, pnpm 10 (`corepack enable`), Java 21 (Firebase emulators).

```sh
pnpm install
pnpm test:unit        # domain, schemas, functions and web unit tests
pnpm test:emulator    # Firestore/Storage rules tests + command integration tests
pnpm test:e2e         # builds functions and web, runs Playwright against the emulators
pnpm lint && pnpm typecheck && pnpm build
```

Run the app locally against the emulators:

```sh
pnpm --filter @bms/functions build
firebase emulators:start --project demo-bms --only auth,firestore,functions,storage &
pnpm --filter @bms/web dev --mode emulator   # http://localhost:5173
```

Emails (verification, password reset) are not delivered by the Auth emulator; their links
appear in the emulator log and at
`http://127.0.0.1:9099/emulator/v1/projects/demo-bms/oobCodes`.

The `demo-bms` project id keeps the emulators offline: nothing reaches real Google services.

Deploying, operations and security: [DEPLOYMENT.md](DEPLOYMENT.md),
[OPERATIONS.md](OPERATIONS.md), [SECURITY_REVIEW.md](SECURITY_REVIEW.md).

## Layout

| Path                | What                                                     |
| ------------------- | -------------------------------------------------------- |
| `apps/web`          | React app (BMS)                                          |
| `apps/site`         | Existing marketing site, unchanged, not in the workspace |
| `functions`         | Callable command API (`api`)                             |
| `packages/domain`   | Pure business rules: money, periods, permissions         |
| `packages/schemas`  | Zod schemas shared by web and functions                  |
| `tests/rules`       | Security rules tests                                     |
| `tests/integration` | Command tests against the emulators                      |
| `tests/e2e`         | Playwright tests                                         |
| `ops`               | Project setup script and alert policies                  |

## Adding a command

1. Add its Zod schema to `packages/schemas` and to `COMMAND_SCHEMAS`.
2. Implement it with `defineCommand` in `functions/src/commands`, declaring its access rule.
3. Register it in `functions/src/registry.ts` (the type checker enforces this).
4. Add integration tests for success, permission denial and each business rule.
