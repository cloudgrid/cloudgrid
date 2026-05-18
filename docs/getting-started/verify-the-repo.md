# Verify The Repository

Use the narrowest check that proves the docs, examples, or implementation you changed. For docs-only changes, `git diff --check` and a link check are usually enough. For contract or code changes, run the relevant repo gates.

## Default Verification

```sh
bun run verify
```

`verify` runs formatting check, typecheck, lint, Bun tests, contract checks, build, Go workspace tests, and backend coverage.

## Full Local Verification

```sh
bun run verify:full
```

`verify:full` adds frontend smoke checks and `git diff --check`.

## Focused Commands

| Purpose | Command |
| --- | --- |
| Format check | `bun run format:check` |
| Typecheck | `bun run typecheck` |
| Lint | `bun run lint` |
| Bun tests | `bun run test` |
| Contract drift check | `bun run contracts:check` |
| Backend coverage | `bun run coverage:backend` |
| Frontend smoke | `bun run smoke:frontend` |
| Docker-backed local integration | `bun run integration:local` |
| Go workspace tests | `bun run go:test` |

## Contract Check Rule

Run `bun run contracts:check` for any change touching:

- GraphQL schema or operations;
- AsyncAPI message bridge contracts;
- generated UI contracts;
- generated Go message contracts;
- BFF bridge clients or adapters;
- storage-read or storage-write message handling.

The check validates frontend GraphQL operations against the SDL, required GraphQL input fields against TypeScript UI contracts, and AsyncAPI request fields against Go structs.

## Backend Coverage Targets

TypeScript BFF:

```sh
bun test --coverage apps/backend/src
```

Go backend services:

```sh
go test -tags surrealdb -coverprofile=/tmp/cloudgrid-go-backend.out \
  ./core/otlp-collector/... \
  ./core/control-plane/... \
  ./core/storage-read/... \
  ./core/storage-write/...

go tool cover -func=/tmp/cloudgrid-go-backend.out | tail -1
```

The backend coverage target is greater than 80 percent for the TypeScript BFF and the aggregate Go backend services.
