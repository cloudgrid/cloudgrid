---
id: TEC-BE-001
title: Service architecture
layer: backend
status: draft
owner: unknown@example.com
updated: 2026-05-31
provenance: inferred-draft
---

# Service Architecture

## Services

### TypeScript BFF (`apps/backend`)

- Serves `/graphql`, GraphQL subscriptions on the same GraphQL endpoint, `/api/health`, frontend assets, and frontend fallback routes.
- Owns public error mapping, auth/session middleware, rate limits, and GraphQL
  resolver composition.
- Talks to private services only through message bridge ports and contracts. The v1 adapter is NATS. Query resolvers use request/reply subjects. Subscription resolvers use storage-read live-session request/reply plus storage-read-owned ephemeral live event subjects.
- Must not import SurrealDB clients, Go storage packages, OTLP parsers, or storage adapters.
- Must not create JetStream consumers for `TELEMETRY_INGEST` and must not subscribe to `telemetry.persisted.traces`.
- Validates runtime configuration, GraphQL resolver inputs, and decoded NATS request/reply responses with Zod before using them.
- Maps all public GraphQL failures to `GraphQLError.extensions.problem`, using RFC 9457 Problem Details fields plus CloudGrid `id`, `code`, `retryable`, and optional `details` extension members.
- Exposes the `/graphql` API endpoint without a bundled GraphQL IDE or development UI.
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
- Log-specific parsing, redaction, and routing remain inside
  `core/otlp-collector` until a dedicated `core/log-ingest` service is
  specified with the same public OTLP path and private `telemetry.ingest.logs`
  subject.

### Go Storage Write Service (`core/storage-write`)

- Subscribes to `telemetry.ingest.traces`, `telemetry.ingest.logs`, and `telemetry.ingest.metrics` through durable JetStream consumer `storage-write`.
- Is the only service that mutates SurrealDB.
- Acknowledges messages only after persistence succeeds.
- After a successful trace persistence commit, publishes volatile `TracePersistedNotification` messages to the core NATS subject `telemetry.persisted.traces` with trace IDs and non-sensitive routing hints. It must not include full spans, logs, attributes, or raw OTLP payloads in that notification, and it must not create a second JetStream-backed telemetry store.
- Depends on a storage writer port. Database-specific writer code, schema
  initialization, readiness checks, and migrations live under
  `internal/adapters/<database>/`.

### Go Storage Read Service (`core/storage-read`)

- Handles message bridge request/reply subjects `telemetry.traces.search`, `telemetry.traces.get`, `telemetry.logs.search`, `telemetry.metrics.names`, `telemetry.metrics.query`, `telemetry.facets`, `telemetry.traces.live.start`, and `telemetry.traces.live.stop`.
- Is the only service that fetches telemetry from SurrealDB.
- Returns typed success or `BridgeError` responses.
- Depends on a storage reader port. Database-specific query builders, client code, and readiness checks live under `internal/adapters/<database>/`.
- Owns telemetry filtering, aggregation, correlation, ranking, and view-model derivation. Its database adapters must push supported filters, counts, grouping, sorting, cursors, and bounded facet queries into the database instead of post-processing broad raw result sets.
- Subscribes to volatile post-persist `TracePersistedNotification` events while live subscriptions are registered, resolves matching trace summaries through the same storage reader query semantics used by `Query.traces`, applies read authorization, and publishes `LiveTraceEvent` messages only to BFF-owned ephemeral sink subjects that were registered through `telemetry.traces.live.start`.
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
- Orchestrates classification and extraction prompt optimization by requesting
  storage-read family diagnosis, calling the CloudGrid optimizer or optional
  custom optimizer adapter for structured prompt/example proposals, validating
  candidate target snapshots through normal evaluation runs, and persisting
  accepted/rejected evidence through storage-write.
- Orchestrates skill document optimization by resolving skill target parts,
  executing rollout/validation runs, requesting bounded optimizer edits through
  the harness adapter, and persisting accepted/rejected skill optimization
  evidence through storage-write.
- Must not import SurrealDB clients, storage adapters, model-provider SDKs, or provider credentials.
- Publishes durable experiment progress notifications for storage-read-managed GraphQL subscription fanout.

### Go Alert Evaluator (`core/alert-evaluator`)

- Optional private service enabled when project alert execution is configured.
- Owns project alert schedules, rule evaluation, state transitions, silences,
  cooldowns, deduplication, alert history recording, and notification dispatch.
- Reads telemetry only through storage-read request/reply subjects and reads or
  writes alert rules/history only through control-plane request/reply subjects.
- Provides built-in in-app and email delivery paths and can dispatch safe alert
  summaries to bridge-backed delivery adapters for provider-specific systems
  such as Slack, WhatsApp, SMS, Teams, PagerDuty, or customer notification
  gateways.
- Must not import SurrealDB clients, storage adapters, frontend code, provider
  SDKs, provider credentials, or raw telemetry payload bodies.

### Self-Observability

CloudGrid services may emit OpenTelemetry for CloudGrid itself according to
`04-backend/self-observability.md`.

- Self-observability uses the normal OTLP ingest path and must not add a direct
  SurrealDB write path, direct storage-read query path, or BFF telemetry
  derivation path.
- Local mode bootstraps a visible fixed project named `CloudGrid` in the
  `Personal` company for CloudGrid service telemetry.
- Deployed mode requires explicit self-observability company, project,
  endpoint, and ingest credential configuration; access to the project remains
  controlled by normal company membership and project selection semantics.
- Internal CloudGrid metrics, including ingest, publish, persist, storage-read,
  GraphQL, message-bridge, live-subscription, and exporter-failure counters and
  histograms, use the first-class OTLP metrics signal.

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

The SurrealDB adapter is the only implemented MVP adapter. Additional database
adapters must be added as sibling adapter directories and must not change BFF,
frontend, collector, or NATS message contracts.

Regular database adapters remain service-local. Do not collapse
`storage-read`, `storage-write`, `storage-maintenance`, and `control-plane`
into one shared SurrealDB adapter package. The separate adapters preserve
least-privilege method sets, service-specific query semantics, and independent
build tags. Shared alignment comes from generated contracts, local ports,
focused drift tests, and shared runtime helpers, not from a broad cross-service
database interface.

Regular database adapter ports also own a stable optional trace-context
argument once deep adapter tracing is implemented. The context is not a generic
query DSL and is not a shared adapter package; it is a small observability
carrier that allows service spans to become parents of adapter child spans when
the configured adapter can do so safely. Adapter implementations must be able
to ignore the context without changing behavior. The context must contain only
parent OpenTelemetry context and bounded operation metadata defined in
`04-backend/self-observability.md`.

Secret material uses a separate adapter family, not the regular control-plane
database adapter:

```text
core/control-plane/internal/
  ports/secrets.go
  adapters/secrets/<provider>/
```

Provider API keys, bearer tokens, refresh tokens, cloud provider secret JSON,
and other recoverable secret material must be stored, rotated, resolved, and
deleted only through the secret-store port. Control-plane metadata rows store
redacted profile data and `credentialRef` values only. The local/development
reference secret store is SurrealDB-backed but uses a separate namespace and
database from the normal control-plane store.

Secret-store adapters are excluded from deep database adapter tracing. Secret
read, resolve, rotate, delete, and encryption/decryption operations may be
observed only at the bounded control-plane operation level and must not create
adapter-level spans.

Storage services are built with exactly the required storage adapter dependency
set. The MVP SurrealDB binaries are built with the Go build tag `surrealdb` and
then validated at startup with `CLOUDGRID_STORAGE_ADAPTER=surrealdb`.
Additional adapters must use sibling adapter packages plus their own build tags,
so operators can ship a Postgres build without SurrealDB dependencies or a
SurrealDB build without Postgres dependencies.

## Private Boundary

SurrealDB is private to storage and control-plane services. The message bridge is private infrastructure shared by BFF, collector, storage services, control-plane, ai-eval-runner, alert-evaluator, and bridge-backed delivery adapters. The v1 message bridge adapter is NATS. Public clients never connect to NATS or SurrealDB.

## Read Model Boundary

Public GraphQL clients are intentionally dumb consumers of backend telemetry view models. The BFF is a contract and transport layer, not a telemetry analytics layer. The storage-read service is the smart read backend and must use database built-ins where that keeps the implementation clearer, smaller, and more bounded.

Live trace subscriptions are part of the same read model boundary. Storage-read is responsible for matching persisted trace notifications to live filters, loading GraphQL-ready trace summaries, applying authorization, and maintaining per-subscription sequence numbers. The BFF forwards storage-read events to GraphQL clients and must not reconstruct, filter, or enrich live trace events.

## Authorization Boundaries

Authentication and authorization are not enforced in local mode, but service
boundaries must preserve production enforcement:

- Ingestion authorization is evaluated at the OTLP collector before
  `PersistTelemetryCommand` is published.
- Read authorization is evaluated at the BFF GraphQL boundary and in storage-read before query execution or live subscription start.
- `BridgeEnvelope.authContext` carries normalized principal, tenant, project, scopes, and authorization decisions across BFF-to-storage-read calls. In local MVP it may be omitted only when the receiver normalizes missing context to `mode=anonymous`, `tenantId=local`, and `projectId=default`.
- Storage-write does not make read authorization decisions. It may persist
  tenant/project ownership metadata supplied by authorized ingest commands, then
  emits only trace IDs and routing hints in post-persist notifications.
- The detailed auth contract is `04-backend/authentication-authorization.md`. Implementation agents must not add cookie sessions, custom API keys, policy engines, or alternate claim names without updating that spec and the machine-readable contracts first.
- Company, user, membership, project, and project status decisions are centralized in `core/control-plane` as specified by `04-backend/control-plane.md`.

## Deployment Log Collection Boundary

CloudGrid receives logs as OTLP logs. Local, VM, and Kubernetes stdout/file log collection is performed by OpenTelemetry Collector agents, not by the BFF or storage services. Kubernetes deployments should use a Collector DaemonSet with filelog collection and Kubernetes metadata enrichment, then export OTLP logs to CloudGrid.

## Timeout Policy

- GraphQL resolver to NATS request/reply timeout: configured by `CLOUDGRID_MESSAGE_BRIDGE_REQUEST_TIMEOUT_MS`, default 12 seconds, maps to ERR-014.
- GraphQL subscription start/stop request to storage-read timeout: configured by `CLOUDGRID_MESSAGE_BRIDGE_REQUEST_TIMEOUT_MS`, default 12 seconds, maps to ERR-014.
- Live trace event heartbeat interval: 15 seconds. If the BFF does not receive heartbeat or data for 45 seconds, it closes the GraphQL subscription with ERR-014.
- Collector JetStream publish ack timeout: 1 second, maps to ERR-013.
- Storage-read request handler and SurrealDB query timeout: configured by `CLOUDGRID_STORAGE_READ_QUERY_TIMEOUT_MS`, default 10000 milliseconds, maps to ERR-006. This timeout is owned by storage-read handlers and must be the single read-query deadline applied to trace, log, metric, facet, live-notification, and AI-eval read handlers. The BFF message bridge request timeout must remain greater than this timeout so storage-read owns query timeout semantics.
- Storage-write SurrealDB command timeout: 5 seconds, maps to ERR-006 or ERR-007.

## Scaling Policy

Production scaling is defined in `06-nfr/performance-and-scaling.md`. Implementation agents must not add new queue technologies, public realtime protocols, unbounded buffers, GraphQL complexity behavior, JetStream consumer modes, or benchmark scripts outside that spec.

## Runtime Diagnostics

- All services emit one structured JSON log object per line.
- Required log keys are `timestamp`, `level`, `service`, `event`, `request_id`, and `message`.
- Mapped failures include `error_id` from `errors.yaml` and `error_code` from the same taxonomy entry.
- Startup failures sanitize provider errors before logging unless the failure is configuration or validation.
- Request/reply handlers preserve `request_id` from the bridge envelope when available.

## Runtime Resilience

Service resilience requirements are defined by
`06-nfr/service-resilience-self-healing.md`.

- Invalid requests, invalid NATS messages, response contract validation
  failures, retryable NATS outages, retryable SurrealDB outages, and handler
  panics are operation-scoped runtime failures. They must not permanently wedge
  the process or require manual restart after the local dependency recovers.
- Startup remains fail-fast for invalid configuration, listener bind failure,
  missing required startup schema, incompatible compiled adapter selection, and
  other fatal composition errors.
- `/livez` is process liveness only. `/readyz` reports local dependencies
  directly owned by the service and must not call another CloudGrid service's
  health endpoint.
- NATS adapters own connection state, reconnect logging, subscription
  readiness, and callback panic containment.
- SurrealDB adapters own reconnect, reauthentication, namespace/database
  selection, readiness recovery, and storage error classification behind their
  service ports.
- BFF bridge response validation failures must not be mapped as message-bridge
  transport outages unless the underlying failure is actually NATS
  unavailability.

## Parallel Implementation Boundaries

- Agent A can implement `apps/backend` GraphQL and message bridge adapter/client against message contracts.
- Agent B can implement `core/otlp-collector` against HTTP and message contracts.
- Agent C can implement `core/storage-write` against message and persistence contracts.
- Agent D can implement `core/storage-read` against message and persistence contracts.
- Agent E can implement `apps/frontend` against GraphQL contracts.
- Agent F can implement `core/ai-eval-runner` against the AI-eval message contracts and harness adapter contract.
