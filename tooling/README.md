# Tooling

Repository scripts, shared lint configs, contract generation, and local development tooling.

## Contract Generation Target

The repository currently treats these files as checked source-of-truth contracts:

- `specs/03-contracts/graphql/public-schema.graphql`
- `specs/03-contracts/messages/message-bridge.asyncapi.yaml`
- `specs/03-contracts/api/http-api.openapi.yaml`
- `specs/03-contracts/entities/*.schema.json`
- `specs/03-contracts/errors.yaml`

The target state is to define message/entity contracts once in `apps/packages/definition`
and generate:

- AsyncAPI message bridge YAML;
- TypeScript UI/BFF contract types in `apps/packages/ui-contracts`;
- Go service contract types in `core/go-contracts`.

Until that generator exists, update the AsyncAPI file directly and run
`bun run contracts:check` to catch drift. Once generation is introduced,
`specs/03-contracts/messages/message-bridge.asyncapi.yaml`,
`apps/packages/ui-contracts/src/index.ts`, and `core/go-contracts/contracts.go`
become generated outputs and must not be hand-edited.

## Checks

The default repository checks are hermetic and do not start Docker:

```sh
bun run verify
```

Docker-backed local integration checks are explicit opt-in:

```sh
bun run integration:local
```

Use the integration command only when local NATS, SurrealDB, and the CloudGrid
services are intended to be part of the run.
