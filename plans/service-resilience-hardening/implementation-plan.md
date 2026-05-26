# Service Resilience Hardening Implementation Plan

Status: ready-for-review
Source spec: `specs/06-nfr/service-resilience-self-healing.md`

## Goal

Harden CloudGrid runtime behavior so invalid inputs, invalid private messages,
handler panics, temporary NATS failures, temporary SurrealDB failures, and
response contract drift are contained to the failing operation. Services must
degrade readiness and recover when local dependencies recover, without making
one service health depend on another service health.

## Honest Risk Assessment

The current codebase already has useful per-operation validation and
storage-write redelivery behavior, but runtime recovery is incomplete. The
highest-risk gaps are NATS callback panic containment, weak readiness checks,
SurrealDB client reconnect behavior, storage-write consumer-loop failure
classification, BFF conflation of response validation failures with message
bridge unavailability, BFF WebSocket subscription lifecycle limits, and
health-check paths that can contend with normal SDK work.

This plan deliberately avoids a large generic resilience framework. The first
implementation should add small, testable helpers behind existing adapter
boundaries, then prove behavior with fake-driven unit tests and local-stack
integration scenarios.

Detailed code-review findings are recorded in
`plans/service-resilience-hardening/code-review-findings.md`.

## Non-Drift Rules

- Agents start at `specs/spec.md`, then read
  `specs/06-nfr/service-resilience-self-healing.md`.
- Agents do not add new NATS subjects, GraphQL fields, public REST endpoints,
  storage adapters, databases, queues, service meshes, or health aggregators.
- `/livez` remains process-only. `/readyz` checks only local dependencies owned
  directly by the service.
- BFF must not gain SurrealDB access, telemetry aggregation, or private stream
  consumers.
- SurrealDB credentials remain confined to storage-read, storage-write, and
  control-plane.
- Contract or error-taxonomy changes require `bun run contracts:check`.
- Chaos tests must be opt-in unless explicitly promoted after stable evidence.

## Waves

1. `wave_01_specs_and_classification`: close taxonomy and helper design gaps
   before touching runtime behavior.
2. `wave_02_go_runtime_resilience`: harden Go NATS, SurrealDB, health, panic,
   and shutdown behavior.
3. `wave_03_bff_and_contract_errors`: fix BFF bridge error classification and
   response-validation observability.
4. `wave_04_async_saturation`: audit and enforce bounded async/blocking
   behavior across BFF and Go services.
5. `wave_05_readiness_lifecycle`: align startup dependency mode, readiness
   semantics, and shutdown ordering across BFF and Go services.
6. `wave_06_integration_chaos`: add local-stack degradation/recovery and opt-in
   chaos scenarios.

## Parallelism

- `TICKET-201` runs first and may identify a required error taxonomy update.
- After `TICKET-201`, `TICKET-202`, `TICKET-203`, and `TICKET-204` can run in
  parallel if their write scopes are respected.
- `TICKET-205` depends on `TICKET-201` and can run parallel with Go runtime
  work.
- `TICKET-209` depends on `TICKET-205` and can run in parallel with Go runtime
  work because it is scoped to BFF WebSocket and subscription lifecycle.
- `TICKET-208` runs after adapter, BFF bridge, and BFF WebSocket hardening
  because it verifies blocking/concurrency behavior across those
  implementations.
- `TICKET-210` depends on the Go runtime resilience tickets and can run before
  or in parallel with cross-service lifecycle validation.
- `TICKET-207` runs after the service-level behavior exists because it validates
  cross-service startup and shutdown semantics.
- `TICKET-206` runs after `TICKET-207`.

## Default Verification

```sh
go test -tags surrealdb ./core/go-runtime/... ./core/otlp-collector/... ./core/control-plane/... ./core/storage-read/... ./core/storage-write/...
bun test apps/backend/src
node /Users/sebastianwessel/.agents/skills/spec-architect/scripts/check_specs.mjs specs
```

`bun run contracts:check` is mandatory if `specs/03-contracts`, generated
contracts, BFF bridge schemas, or error taxonomy files change.

`bun run integration:local` is required before completing the final wave.
`CLOUDGRID_ENABLE_RESILIENCE_CHAOS_TESTS=true bun run integration:local` is
required only for the opt-in chaos ticket.

## Completion Rule

The plan is complete when all tickets are done, default verification passes,
local integration proves NATS and SurrealDB recovery, and
`plans/service-resilience-hardening/_status.yaml` records evidence for every
ticket.
