# Definition Package

Shared TypeScript definitions for CloudGrid contracts.

This package must not depend on apps, runtime, HTTP frameworks, React, SurrealDB, or Go services.

This package is also the registry for cross-service constants that must not
drift:

- message bridge subject families and wildcard subject patterns,
- generated enum metadata shared by TypeScript and Go,
- repository-approved `CLOUDGRID_*` and `VITE_CLOUDGRID_*` configuration names.

`bun run contracts:generate` mirrors this metadata into
`apps/packages/ui-contracts` and `core/go-contracts`. `bun run contracts:check`
then verifies AsyncAPI channels, production message subject literals, and
configuration references against this package.
