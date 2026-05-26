---
id: CNV-001
title: Engineering conventions
layer: foundation
status: draft
owner: unknown@example.com
updated: 2026-05-08
provenance: inferred-draft
---

# Engineering Conventions

## Workspace Contract

The implementation must use this root shape:

```text
apps/backend
apps/frontend
apps/packages/definition
apps/packages/otlp
apps/packages/runtime
apps/packages/ui-contracts
core/otlp-collector
core/control-plane
core/storage-read
core/storage-write
core/go-contracts
core/go-runtime
tooling
specs
```

Deployable apps may depend on `apps/packages/*`. Shared TypeScript packages must not depend on deployable apps. `apps/packages/definition` must not depend on implementation, runtime, HTTP, SurrealDB, React, or UI packages. Go services use generated or shared contracts from `core/go-contracts` and runtime helpers from `core/go-runtime`; they do not expose public HTTP APIs except the OTLP collector and service health endpoints.

## Boundary Invariants

- Frontend talks only to the TypeScript BFF.
- TypeScript BFF talks to private services only through message bridge ports and contracts. The v1 adapter is NATS. Synchronous reads use request/reply subjects. GraphQL subscriptions use storage-read-managed live subjects declared in AsyncAPI and must not consume ingest or persisted-notification streams directly.
- Go OTLP collector publishes ingest commands through the message bridge stream publisher and never writes SurrealDB directly.
- Go storage-write service is the only service that mutates SurrealDB.
- Go storage-read service is the only service that fetches telemetry from SurrealDB.
- Go control-plane service is the only service that reads or mutates central organization, user, membership, project, and project status state.
- SurrealDB is not reachable from public network paths.
- Live telemetry delivery must flow through storage-read so read authorization
  remains centralized.

## Authorization Preparation

- Public ingestion authorization and public read authorization are separate policy decisions.
- Ingestion authorization is enforced at public OTLP ingest boundaries before commands are published.
- Read authorization is enforced by the TypeScript BFF at the public GraphQL boundary and by storage-read before executing telemetry queries or live trace subscriptions.
- `BridgeEnvelope.authContext` is optional in local mode but is the production
  carrier for principal, tenant, project, and scope claims. Services must
  preserve it when forwarding bridge messages and must not log secrets or raw
  authorization tokens.
- Live trace subscriptions must use the same read authorization context as
  GraphQL queries. The BFF must not bypass storage-read to enforce live filters.

## Time

- Persist timestamps as UTC.
- API responses return ISO 8601 strings. Telemetry timestamps originating from
  OTLP nanosecond fields must retain sub-second precision in trace detail,
  span detail, span event, log detail, and waterfall layout responses.
- Raw nanosecond timestamp fields exposed through JSON or GraphQL must be
  decimal strings, not JSON numbers.
- UI displays local browser time and must keep raw UTC available in tooltips or detail panels.

## IDs

- `trace.id` equals the OpenTelemetry trace ID.
- `span.id` equals the OpenTelemetry span ID.
- `log_event.id` is generated when no stable log record ID exists.
- API clients must treat IDs as opaque strings.

## Pagination

- Default page size: 50.
- Maximum page size: 200.
- Cursor format: opaque base64url JSON with `sort`, `lastValue`, and `lastId`.
- Implementation must reject malformed cursors with `ERR-003 INVALID_CURSOR`.

## Errors

- Public HTTP errors use RFC 9457 Problem Details objects. CloudGrid extension members are `id`, `code`, `retryable`, and optional `details`, all sourced from `03-contracts/errors.yaml`.
- Public GraphQL errors use `GraphQLError.extensions.code` with codes from `03-contracts/errors.yaml` and expose the RFC 9457-compatible problem object at `GraphQLError.extensions.problem`.
- OTLP and health HTTP errors use `ErrorResponse` from the HTTP OpenAPI contract, whose `error` member is the CloudGrid Problem Details object.
- Message bridge replies use `BridgeError` from the AsyncAPI contract.
- BFF bridge adapters convert `BridgeError` to Problem Details at the public boundary. NATS message payloads do not embed HTTP-specific status behavior except through error taxonomy references.
- GraphQL subscription setup failures use the same public GraphQL error mapping as query failures. Subscription stream failures after setup emit a terminal GraphQL error when the transport supports it; otherwise the BFF closes the subscription and logs the canonical error.
- Raw provider errors must not be returned to clients.
- All failure-path acceptance criteria must map to `03-contracts/errors.yaml`.
- TypeScript public-boundary and message-boundary validation uses Zod where runtime validation is needed. Compile-time-only generated types are not a substitute for validating untrusted environment variables, GraphQL inputs, decoded NATS replies, or frontend GraphQL responses.

## Logging

- Logs are structured JSON.
- Required fields: `timestamp`, `level`, `service`, `event`, `request_id`, and `message`.
- Include `trace_id` and `span_id` when known.
- Include `error_id` and `error_code` when logging mapped CloudGrid errors.
- Log levels are lowercase strings: `debug`, `info`, `warn`, `error`.
- Default runtime logging threshold is `info`. Successful high-frequency request, NATS handler, GraphQL operation, OTLP HTTP, telemetry ingest, live notification, and persisted-notification completions are `debug` events and must not be emitted at the default threshold.
- Use `info` only for low-frequency operator-relevant lifecycle events such as startup readiness, shutdown, and explicit long-lived mode changes. A healthy running production system should not produce steady-state success logs.
- Use `warn` for validation failures, denied or malformed client actions, recoverable dependency degradation, retryable bridge failures, and self-observability export failures when configured to surface them.
- Use `error` for startup failure, unavailable required dependencies, terminal processing failure, data loss risk, or unexpected internal failures. When a process exits because of a fatal condition, log the condition as `error` with the canonical CloudGrid error fields before exit.
- Services running in Kubernetes must write application logs to stdout/stderr as one JSON object per line.
- Do not log full OTLP payload bodies by default.
- Do not log SurrealDB credentials, NATS credentials, raw provider errors, raw OTLP bodies, or user-controlled high-cardinality payload objects by default.

## Frontend Loading And Errors

- Query views render skeleton rows while loading.
- Empty states distinguish "no telemetry ingested yet" from "filters returned no results".
- Failed API calls render inline error panels with retry buttons.
- The frontend does not perform optimistic updates because MVP interactions are read-only.

## Testing

- Unit tests are required for OTLP mapping, correlation, configuration parsing, and cursor parsing.
- Integration tests are required for Hono routes, GraphQL resolvers, message bridge request/reply handlers, stream consumers, and SurrealDB read/write services. NATS adapter tests cover the v1 transport mapping.
- Contract tests must parse GraphQL SDL, AsyncAPI messages and operations, OpenAPI HTTP responses, entity JSON Schemas, error taxonomy references, and generated TypeScript/Go contract outputs.
- UI smoke tests must cover trace list, trace detail, log search, filtering, loading, empty, and error states.
