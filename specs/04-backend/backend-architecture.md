---
id: TEC-BE-001
title: Service architecture
layer: backend
status: draft
owner: unknown@example.com
updated: 2026-05-08
provenance: inferred-draft
---

# Service Architecture

## Services

### TypeScript BFF (`apps/backend`)

- Serves `/graphql`, GraphQL subscriptions on the same GraphQL endpoint, `/api/health`, frontend assets, and frontend fallback routes.
- Owns public error mapping, future auth/session middleware, rate limits, and GraphQL resolver composition.
- Talks to private services only through message bridge ports and contracts. The v1 adapter is NATS. Query resolvers use request/reply subjects. Subscription resolvers use storage-read live-session request/reply plus storage-read-owned ephemeral live event subjects.
- Must not import SurrealDB clients, Go storage packages, OTLP parsers, or storage adapters.
- Must not create JetStream consumers for `TELEMETRY_INGEST` or `telemetry.persisted.traces`.
- Validates runtime configuration, GraphQL resolver inputs, and decoded NATS request/reply responses with Zod before using them.
- Maps all public GraphQL failures to `GraphQLError.extensions.problem`, using RFC 9457 Problem Details fields plus CloudGrid `id`, `code`, `retryable`, and optional `details` extension members.
- Enables the GraphQL development UI only when running in development or when `CLOUDGRID_GRAPHQL_UI=true`; production defaults to disabled.
- Must not filter, aggregate, rank, correlate, or enrich telemetry records. Telemetry read semantics are owned by storage-read as defined in `04-backend/telemetry-query-semantics.md`.
- Owns GraphQL subscription transport lifecycle only: WebSocket/session acceptance, input validation, start/stop bridge calls, event decoding, public error mapping, heartbeat forwarding, and cleanup on disconnect.

### React Frontend (`apps/frontend`)

- Talks only to the TypeScript BFF.
- Uses GraphQL operations and subscriptions generated from `03-contracts/graphql/public-schema.graphql`.
- Renders GraphQL telemetry view models and owns only local presentation state such as selection, expansion, focus, tabs, URL parameters, and virtualization windows.
- Uses `Subscription.liveTraces` for realtime trace-level updates. Changing live filters restarts only the GraphQL subscription operation on the existing WebSocket session when supported by the client library; it must not use a second realtime protocol.

### Go OTLP Collector (`core/otlp-collector`)

- Serves `POST /v1/traces`, `POST /v1/logs`, and `POST /v1/metrics`.
- Accepts OTLP HTTP JSON and protobuf.
- Normalizes payloads into canonical entities.
- Publishes `PersistTelemetryCommand` and `PersistMetricsCommand` messages through the message bridge stream publisher. The v1 adapter publishes to NATS JetStream subjects.
- Must not import SurrealDB clients or storage adapters.
- A future `core/log-ingest` service may take ownership of `/v1/logs` and log-specific parsing/redaction/routing while preserving the public OTLP path and private `telemetry.ingest.logs` subject.

### Go Storage Write Service (`core/storage-write`)

- Subscribes to `telemetry.ingest.traces`, `telemetry.ingest.logs`, and `telemetry.ingest.metrics` through durable JetStream consumer `storage-write`.
- Is the only service that mutates SurrealDB.
- Acknowledges messages only after persistence succeeds.
- After a successful trace persistence commit, publishes `TracePersistedNotification` to `telemetry.persisted.traces` with trace IDs and non-sensitive routing hints. It must not include full spans, logs, attributes, or raw OTLP payloads in that notification.
- Depends on a storage writer port. Database-specific writer code, schema initialization, readiness checks, and future migrations live under `internal/adapters/<database>/`.

### Go Storage Read Service (`core/storage-read`)

- Handles message bridge request/reply subjects `telemetry.traces.search`, `telemetry.traces.get`, `telemetry.logs.search`, `telemetry.metrics.names`, `telemetry.metrics.query`, `telemetry.facets`, `telemetry.traces.live.start`, and `telemetry.traces.live.stop`.
- Is the only service that fetches telemetry from SurrealDB.
- Returns typed success or `BridgeError` responses.
- Depends on a storage reader port. Database-specific query builders, client code, and readiness checks live under `internal/adapters/<database>/`.
- Owns telemetry filtering, aggregation, correlation, ranking, and view-model derivation. Its database adapters must push supported filters, counts, grouping, sorting, cursors, and bounded facet queries into the database instead of post-processing broad raw result sets.
- Consumes post-persist `TracePersistedNotification` events through durable consumer `storage-read-live`, resolves matching trace summaries through the same storage reader query semantics used by `Query.traces`, applies read authorization, and publishes `LiveTraceEvent` messages only to BFF-owned ephemeral sink subjects that were registered through `telemetry.traces.live.start`.
- Does not expose public HTTP or WebSocket endpoints for live telemetry. All public realtime access remains GraphQL through the TypeScript BFF.

### Go Control Plane Service (`core/control-plane`)

- Owns company, user, membership, project, selected-project validation, project status, ingest credential metadata, dashboards, and dashboard pins.
- Is the only service that reads or mutates the central control-plane SurrealDB namespace/database.
- Serves private message bridge request/reply subjects for BFF organization/project/user/dashboard management GraphQL resolvers.
- Publishes project status snapshots and invalidation events for fast collector authorization caches.
- Must not read, write, aggregate, or enrich telemetry records.

### Go AI Evaluation Runner (`core/ai-eval-runner`)

- Optional service enabled only when the AI evaluation feature is configured.
- Handles AI experiment, online scoring, and optimization orchestration over private message bridge subjects declared in the AsyncAPI contract.
- Reads datasets, scorers, projections, and experiment state only through storage-read request/reply subjects.
- Persists DatasetItemRun, EvalResult, PromptVersion, ExperimentRun status, and AnnotationQueueItem records only through storage-write command subjects.
- Calls the cloudgrid-harness-adapter over HTTP for agent replay, scorer execution, and prompt optimization.
- Must not import SurrealDB clients, storage adapters, model-provider SDKs, or provider credentials.
- Publishes durable experiment progress notifications for storage-read-managed GraphQL subscription fanout.

## Storage Adapter Layout

Storage and control-plane services must keep adapter implementations behind explicit service ports:

```text
core/storage-read/internal/
  ports/
  adapters/<database>/

core/storage-write/internal/
  ports/
  adapters/<database>/

core/control-plane/internal/
  ports/
  adapters/<database>/
```

The SurrealDB adapter is the only implemented MVP adapter. A future Postgres adapter must be added as a sibling adapter directory and must not change BFF, frontend, collector, or NATS message contracts.

Storage services are built with exactly the required storage adapter dependency set. The MVP SurrealDB binaries are built with the Go build tag `surrealdb` and then validated at startup with `CLOUDGRID_STORAGE_ADAPTER=surrealdb`. Future adapters must use sibling adapter packages plus their own build tags, so operators can ship a Postgres build without SurrealDB dependencies or a SurrealDB build without Postgres dependencies.

## Private Boundary

SurrealDB is private to storage and control-plane services. The message bridge is private infrastructure shared by BFF, collector, storage services, control-plane, and ai-eval-runner. The v1 message bridge adapter is NATS. Public clients never connect to NATS or SurrealDB.

## Read Model Boundary

Public GraphQL clients are intentionally dumb consumers of backend telemetry view models. The BFF is a contract and transport layer, not a telemetry analytics layer. The storage-read service is the smart read backend and must use database built-ins where that keeps the implementation clearer, smaller, and more bounded.

Live trace subscriptions are part of the same read model boundary. Storage-read is responsible for matching persisted trace notifications to live filters, loading GraphQL-ready trace summaries, applying authorization, and maintaining per-subscription sequence numbers. The BFF forwards storage-read events to GraphQL clients and must not reconstruct, filter, or enrich live trace events.

## Authorization Boundaries

Authentication and authorization are not enforced in the local MVP, but service boundaries must be shaped for future enforcement:

- Ingestion authorization is evaluated at the OTLP collector or a future public ingest gateway before `PersistTelemetryCommand` is published.
- Read authorization is evaluated at the BFF GraphQL boundary and in storage-read before query execution or live subscription start.
- `BridgeEnvelope.authContext` carries normalized principal, tenant, project, scopes, and authorization decisions across BFF-to-storage-read calls. In local MVP it may be omitted only when the receiver normalizes missing context to `mode=anonymous`, `tenantId=local`, and `projectId=default`.
- Storage-write does not make read authorization decisions. It may persist future tenant/project ownership metadata supplied by authorized ingest commands, then emits only trace IDs and routing hints in post-persist notifications.
- The detailed auth contract is `04-backend/authentication-authorization.md`. Implementation agents must not add cookie sessions, custom API keys, policy engines, or alternate claim names without updating that spec and the machine-readable contracts first.
- Company, user, membership, project, and project status decisions are centralized in `core/control-plane` as specified by `04-backend/control-plane.md`.

## Deployment Log Collection Boundary

CloudGrid receives logs as OTLP logs. Local, VM, and Kubernetes stdout/file log collection is performed by OpenTelemetry Collector agents, not by the BFF or storage services. Kubernetes deployments should use a Collector DaemonSet with filelog collection and Kubernetes metadata enrichment, then export OTLP logs to CloudGrid.

## Timeout Policy

- GraphQL resolver to NATS request/reply timeout: 2 seconds, maps to ERR-014.
- GraphQL subscription start/stop request to storage-read timeout: 2 seconds, maps to ERR-014.
- Live trace event heartbeat interval: 15 seconds. If the BFF does not receive heartbeat or data for 45 seconds, it closes the GraphQL subscription with ERR-014.
- Collector JetStream publish ack timeout: 1 second, maps to ERR-013.
- Storage-read SurrealDB query timeout: 1500 milliseconds, maps to ERR-006.
- Storage-write SurrealDB command timeout: 5 seconds, maps to ERR-006 or ERR-007.

## Scaling Policy

Production scaling is defined in `06-nfr/performance-and-scaling.md`. Implementation agents must not add new queue technologies, public realtime protocols, unbounded buffers, GraphQL complexity behavior, JetStream consumer modes, or benchmark scripts outside that spec.

## Runtime Diagnostics

- All services emit one structured JSON log object per line.
- Required log keys are `timestamp`, `level`, `service`, `event`, `request_id`, and `message`.
- Mapped failures include `error_id` from `errors.yaml` and `error_code` from the same taxonomy entry.
- Startup failures sanitize provider errors before logging unless the failure is configuration or validation.
- Request/reply handlers preserve `request_id` from the bridge envelope when available.

## Parallel Implementation Boundaries

- Agent A can implement `apps/backend` GraphQL and message bridge adapter/client against message contracts.
- Agent B can implement `core/otlp-collector` against HTTP and message contracts.
- Agent C can implement `core/storage-write` against message and persistence contracts.
- Agent D can implement `core/storage-read` against message and persistence contracts.
- Agent E can implement `apps/frontend` against GraphQL contracts.
- Agent F can implement `core/ai-eval-runner` against the AI-eval message contracts and harness adapter contract.
