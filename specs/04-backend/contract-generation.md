---
id: TEC-BE-010
title: Contract generation source and outputs
layer: backend
status: draft
owner: unknown@example.com
updated: 2026-05-11
provenance: inferred-standard
---

# Contract Generation Source And Outputs

CloudGrid must converge on one contract source so GraphQL, AsyncAPI, TypeScript UI types, and Go bridge types cannot drift.

## Source Of Truth

`apps/packages/definition` is the only source package for generated contracts. It must contain data-only TypeScript definitions and generator metadata. It must not import:

- React, browser, Vite, Hono, GraphQL Yoga, NATS, SurrealDB, Go service code, filesystem side effects, or runtime environment readers.

The checked source of truth is:

- `specs/03-contracts/graphql/public-schema.graphql`
- `specs/03-contracts/messages/message-bridge.asyncapi.yaml`
- `specs/03-contracts/entities/*.schema.json`
- `specs/03-contracts/errors.yaml`

Manual generated outputs are allowed only while `tooling/scripts/check-contracts.mjs` verifies drift-sensitive symbols and cross-layer conformance. The checker must validate `apps/packages/public-api-client` GraphQL operation documents against the public GraphQL SDL, ensure frontend routes do not define route-local GraphQL operations or direct `/graphql` calls outside the approved client wrapper, validate every public API client operation has `apps/packages/integration-scenarios` coverage metadata, validate required GraphQL input fields against `apps/packages/ui-contracts/src/generated.ts`, and validate AsyncAPI request required fields against Go request structs.

## Generated Outputs

The generator must produce these files deterministically:

- `specs/03-contracts/messages/message-bridge.asyncapi.yaml`
- `apps/packages/ui-contracts/src/generated.ts`
- `core/go-contracts/generated_contracts.go`

The GraphQL SDL remains hand-authored until a GraphQL generator is explicitly specified. UI contract types may be generated from GraphQL SDL plus shared scalar mappings. Until full generation exists, every required GraphQL input field must be mirrored in `apps/packages/ui-contracts/src/generated.ts` as a non-optional TypeScript field and covered by `bun run contracts:check`.

Every generated file must include a short header that names `apps/packages/definition` and the generator command. Once generation exists, implementation agents must not hand-edit generated outputs.

## Generator Command

Add exactly one root command:

```sh
bun run contracts:generate
```

The command must be deterministic, must not access the network, and must fail if generated output differs from the checked-in files unless it is running in write mode. `bun run contracts:check` must run the generator in check mode plus the existing structural checks.

The check command is a hard drift gate. It must fail when:

- a frontend GraphQL operation omits an argument required by `public-schema.graphql`,
- a frontend route defines an inline GraphQL operation or calls `/graphql`
  directly instead of using the shared frontend client,
- `ui-contracts` omits a required GraphQL input field,
- an AsyncAPI request schema requires a field that is missing from its Go request struct,
- generated enum or subject metadata is stale.

## Canonicalization

- Object keys are emitted in definition order unless a target format requires sorted keys.
- YAML uses two-space indentation.
- JSON Schema references remain relative to `specs/03-contracts/entities`.
- TypeScript output is ESM and type-only.
- Go output uses stable struct field order, explicit JSON tags, pointer fields only for nullable contract fields, and no storage adapter imports.

## Drift Rules

A contract change is complete only when all applicable layers are updated in the same change:

- capability or flow spec,
- GraphQL SDL or AsyncAPI contract,
- JSON Schema entity when shared entities change,
- TypeScript UI contract output,
- Go bridge contract output,
- error taxonomy when new failures are introduced,
- focused contract test or drift-check assertion.

Implementation agents must stop if they need a new field, enum value, subject, event type, operation, or error code that is not present in those layers.

Control-plane GraphQL fields are public contract fields. A control-plane implementation wave must add matching AsyncAPI subjects and Go control-plane contract structs before implementing BFF resolvers. Until those message contracts exist, generated UI types and GraphQL SDL define the public shape only and BFF implementation must not stub management fields with local-only data.

## Tests

Default CI must run:

```sh
bun run contracts:check
```

When the generator exists, CI must also fail on non-deterministic output by running generation twice in a temporary directory and comparing outputs.

Focused tests in `tooling/scripts/generate-contracts.test.ts` must duplicate the critical negative surfaces for the drift gate: GraphQL operation validation and required GraphQL input field reflection. This prevents `contracts:check` itself from degrading into a syntax-only parser.
