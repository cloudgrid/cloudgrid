---
id: TEC-BE-003
title: SurrealDB persistence
layer: backend
status: draft
owner: unknown@example.com
updated: 2026-05-29
provenance: inferred-draft
---

# SurrealDB Persistence

SurrealDB telemetry databases are accessed only by `core/storage-read` and `core/storage-write`. The central control-plane database is accessed only by `core/control-plane`.

Implementation code for this adapter lives under:

- `core/storage-read/internal/adapters/surrealdb`
- `core/storage-write/internal/adapters/surrealdb`

Schema definitions, query builders, client setup, readiness checks, and SurrealDB migrations must stay inside those adapter directories. Service runtime packages depend on storage ports and compose this adapter at startup.

Control-plane schema definitions for organizations, users, projects, memberships, ingest credentials, dashboards, and dashboard pins live under `core/control-plane/internal/adapters/surrealdb`. The telemetry storage adapters must not create, update, or query control-plane dashboard tables.

Recoverable secret material is not part of the regular control-plane schema.
The SurrealDB development secret-store adapter lives under
`core/control-plane/internal/adapters/secrets/surrealdb` and uses a separate
namespace/database from `cloudgrid_control/control` or the local control-plane
database. Regular control-plane SurrealDB schema initialization must not define
`ai_provider_secret` or other secret-bearing tables.

The full tenancy and SurrealDB-native modeling strategy is defined in `04-backend/surrealdb-tenancy-and-modeling.md`. This file defines the current telemetry record shape.

## Supported Runtime Baseline

CloudGrid local, release Compose, and bundled Helm evaluation defaults target
`surrealdb/surrealdb:v3.1.0`.

SurrealDB 3.1.0 is accepted as a compatible minor upgrade from 3.0.x because the
official 3.1 release notes state that the 3.0 to 3.1 catalog and on-disk layouts
are unchanged. Operators may upgrade an existing 3.0.x RocksDB volume in place
after taking the normal environment backup or recovery point. Rollback must use
the environment's storage recovery plan if data has been modified after the
database binary upgrade.

CloudGrid does not depend on SurrealDB MCP, GraphQL, DiskANN, audit logging, or
slow-query telemetry for product behavior in this release. Those capabilities
may be evaluated separately, but they must not bypass CloudGrid's service
boundaries, public GraphQL contract, NATS bridge, storage-read query ownership,
or storage-write mutation ownership.

## SurrealDB Development Secret Store

The development/reference secret store may use the same SurrealDB server
process as the rest of local CloudGrid, but it must use an isolated namespace
and database. Default local values:

- namespace: `cloudgrid_secrets`
- database: `dev`

The secret-store table is `managed_secret`. It is `SCHEMAFULL`, has
`PERMISSIONS NONE`, and stores only encrypted ciphertext plus lookup metadata:
scope, company ID, project ID when applicable, provider profile ID, algorithm,
nonce, created/update timestamps, and actor ID. It must not store plaintext
provider credentials, raw API keys, bearer tokens, refresh tokens, provider
secret JSON, cloud access key secrets, session cookies, or Authorization
headers.

The secret-store adapter owns encryption and decryption. Deployed mode requires
`CLOUDGRID_SECRET_STORE_ENCRYPTION_KEY`; local mode may use an explicit
development key. The regular control-plane store must not receive the secret
encryption key and must not read or write secret ciphertext rows.

SurrealDB 3.1 reorganizes server metrics under a unified OpenTelemetry pipeline
and changes existing dashboard metric names. CloudGrid runtime behavior does not
read SurrealDB server metrics, but operator dashboards that scrape SurrealDB
directly must be reviewed during the dependency upgrade.

## Adapter Observability

Regular SurrealDB adapters for storage-read, storage-write,
storage-maintenance, and control-plane must support the optional database
adapter trace context defined in `04-backend/self-observability.md` when deep
adapter tracing is implemented. Support means the adapter port accepts the
context and, when local deep tracing is enabled, may create child spans for
bounded operations such as readiness checks, schema initialization, trace
search, metric series queries, ingest persistence, dashboard/project metadata
queries, and retention batches.

SurrealDB adapter spans must use bounded operation labels and sanitized
CloudGrid error mapping only. They must not attach raw SurrealQL statements,
query-builder output, bind parameters, response rows, namespace/database names
derived from tenant or project IDs, provider error strings, record IDs,
telemetry attributes, bearer tokens, SurrealDB credentials, or secret-store
payload data.

The SurrealDB development secret-store adapter under
`core/control-plane/internal/adapters/secrets/surrealdb` is not a regular
database adapter for tracing purposes. It must not emit deep adapter spans and
must not expose secret read/write/resolve/rotate/delete internals through
adapter-level telemetry.

## Tenant And Project Layout

Production telemetry uses one SurrealDB namespace per tenant and one strict database per project:

- namespace: `cg_tenant_<tenantId>`
- database: `project_<projectId>`

The local auth mode default uses namespace `cloudgrid_local` and database `project_default`.

Every telemetry record still stores `tenantId` and `projectId` as defense-in-depth metadata and for post-persist notification routing, even though the physical database is already project-scoped.

## Tables

- `trace`
- `span`
- `log_event`
- `metric_descriptor`
- `metric_point`
- `metric_ingest_cardinality`
- `service`
- `ingest_command`
- Optional AI evaluation tables when `CLOUDGRID_AI_EVAL_ENABLED=true`: `ai_agent_run`, `ai_llm_call`, `ai_tool_call`, `ai_retrieval_event`, `ai_dataset`, `ai_dataset_item`, `ai_scorer`, `ai_eval_result`, `ai_experiment`, `ai_experiment_run`, `ai_dataset_item_run`, `ai_prompt_version`, and `ai_annotation_queue_item`.
- `ai_experiment_run` persists the resolved `runPolicy` object from the evaluation run policy contract so GraphQL `ExperimentRun.runPolicy`, storage-read responses, and runner responses stay field-aligned.

`span_event` remains embedded in `span.events` for MVP.

## Record IDs

- Trace record: `trace:<traceId>`.
- Span record: `span:<traceId>_<spanId>`.
- Log record: `log_event:<logEventId>`.
- Metric descriptor record: `metric_descriptor:<metricNameSlug>`.
- Metric point record: `metric_point:<metricNameSlug>_<timestampUnixNano>_<attributeHash>`.
- Metric cardinality record: `metric_ingest_cardinality:<metricNameSlug>_<windowStart>`.
- Service record: `service:<serviceNameSlug>`.
- Ingest command record: `ingest_command:<commandId>`.

Deterministic record IDs are the primary direct-reference mechanism for hot telemetry records. String IDs remain stored as fields for GraphQL contracts, filtering, notification payloads, and compound indexes. Do not add graph edge tables for trace-span, span-parent, span-log, service-span, or metric-service links on the ingest path unless an async materialization spec defines the extra write cost and query that consumes it.

## Trace Record

```ts
{
  tenantId: string
  projectId: string
  traceId: string
  serviceName?: string
  operationName?: string
  startedAt: Date
  endedAt?: Date
  durationMs?: number
  rootSpanId?: string
  status?: "ok" | "error" | "unset"
  attributes: Record<string, unknown>
  searchText?: string
  spanCount: number
  errorSpanCount: number
  logCount: number
  serviceCount: number
}
```

`operationName` is the root span name captured at write time. Trace-list and live-candidate reads must project this field directly from `trace`; they must not perform per-row span lookups to derive it.

Trace summary counters are denormalized on `trace`. Trace-list and live-candidate reads must project `spanCount`, `errorSpanCount`, `logCount`, and `serviceCount` directly from `trace`. Log-only ingest that refreshes an existing trace's `logCount` must target `trace:<traceId>` by deterministic record ID and may use the indexed `log_event(tenantId, companyId, projectId, traceId, timestamp)` lookup to recompute the count.

`searchText` is a storage-owned full-text projection for route-primary trace and live-trace search. Storage-write populates it from trace identifiers, primary service, operation/root span data, trace status, trace attributes, span names, and span attributes. Public read contracts do not expose it.

## Span Record

```ts
{
  tenantId: string
  projectId: string
  spanId: string
  traceId: string
  parentSpanId?: string
  name: string
  kind?: string
  serviceName?: string
  startedAt: Date
  endedAt: Date
  durationMs: number
  status?: "ok" | "error" | "unset"
  attributes: Record<string, unknown>
  events: SpanEvent[] stored as `array<object>` with explicit `name`, `timestamp`, and flexible `attributes` nested fields; schema initialization overwrites these field definitions to repair older local schemas.
  links: SpanLink[] stored as `array<object>` with explicit `traceId`, `spanId`, optional `traceState`, and flexible `attributes` nested fields.
}
```

## Log Record

```ts
{
  tenantId: string
  projectId: string
  logEventId: string
  traceId?: string
  spanId?: string
  serviceName?: string
  severityText?: string
  severityNumber?: number
  body: unknown
  bodyText?: string
  timestamp: Date
  observedTimestamp?: Date
  attributes: Record<string, unknown>
  searchText?: string
}
```

`searchText` is a storage-owned full-text projection for log search. Storage-write populates it from log ID, trace/span correlation IDs, service, severity, body, and attributes. Public read contracts do not expose it.

## Metric Descriptor Record

```ts
{
  tenantId: string
  projectId: string
  metricName: string
  description?: string
  unit: string
  kind: "gauge" | "sum" | "histogram" | "exponential_histogram" | "summary"
  aggregationTemporality?: "unspecified" | "delta" | "cumulative"
  monotonic?: boolean
  attributeKeys: string[]
  searchText?: string
  firstSeenAt: Date
  lastSeenAt: Date
}
```

`searchText` is a storage-owned full-text projection for metric-name search. Storage-write populates it from metric name, unit, kind, description, and attribute keys. Public read contracts do not expose it.

Metric descriptor writes are monotonic for query-critical metadata. Storage-write must enrich a descriptor with the filtered metric point attribute keys observed for the same metric in the same command. When storage-write receives another descriptor for an existing metric name, it must keep the union of previously observed and newly observed `attributeKeys`, preserve the earliest `firstSeenAt`, and advance `lastSeenAt` to the latest observed value. This prevents later narrower OTLP batches from removing group-by keys that are still valid for persisted metric points.

## Metric Point Record

```ts
{
  tenantId: string
  projectId: string
  metricName: string
  serviceName?: string
  scopeName?: string
  kind: "gauge" | "sum" | "histogram" | "exponential_histogram" | "summary"
  timestamp: Date
  startTimestamp?: Date
  value?: number
  count?: number
  sum?: number
  min?: number
  max?: number
  bucketCounts?: number[]
  explicitBounds?: number[]
  quantileValues?: { quantile: number; value: number }[]
  attributes: Record<string, unknown>
  exemplars: { timestamp: Date; value: number; traceId?: string; spanId?: string; attributes: Record<string, unknown> }[]
  droppedAttributeCount: number
}
```

## Metric Cardinality Record

```ts
{
  tenantId: string
  projectId: string
  metricName: string
  windowStart: Date
  attributeKeys: string[]
  valueCounts: Record<string, number>
}
```

## Indexes

- `ingest_command.commandId`.
- `ingest_command.commandId` unique.
- `ingest_command.completedAt`.
- `trace.startedAt`.
- `trace.tenantId, trace.companyId, trace.projectId, trace.startedAt`.
- `trace.tenantId, trace.companyId, trace.projectId, trace.traceId`.
- `trace.tenantId, trace.companyId, trace.projectId, trace.serviceName, trace.startedAt`.
- `trace.tenantId, trace.companyId, trace.projectId, trace.status, trace.startedAt`.
- `trace.serviceName`.
- `trace.status`.
- `span.traceId`.
- `span.parentSpanId`.
- `span.tenantId, span.companyId, span.projectId, span.traceId, span.parentSpanId, span.startedAt`.
- `span.tenantId, span.companyId, span.projectId, span.serviceName, span.traceId`.
- `span.serviceName`.
- `span.name`.
- `span.status`.
- `log_event.timestamp`.
- `log_event.tenantId, log_event.companyId, log_event.projectId, log_event.timestamp`.
- `log_event.serviceName`.
- `log_event.serviceName, timestamp`.
- `log_event.traceId`.
- `log_event.traceId, timestamp`.
- `log_event.tenantId, log_event.companyId, log_event.projectId, log_event.serviceName, log_event.timestamp`.
- `log_event.tenantId, log_event.companyId, log_event.projectId, log_event.traceId, log_event.timestamp`.
- `log_event.spanId`.
- `log_event.severityText`.
- `metric_descriptor.metricName`.
- `metric_descriptor.lastSeenAt`.
- `metric_descriptor.tenantId, metric_descriptor.companyId, metric_descriptor.projectId, metric_descriptor.lastSeenAt`.
- `metric_descriptor.tenantId, metric_descriptor.companyId, metric_descriptor.projectId, metric_descriptor.metricName`.
- `metric_point.metricName`.
- `metric_point.metricName, timestamp`.
- `metric_point.tenantId, metric_point.companyId, metric_point.projectId, metric_point.metricName, metric_point.timestamp`.
- `metric_point.serviceName, timestamp`.
- `metric_point.tenantId, metric_point.companyId, metric_point.projectId, metric_point.serviceName, metric_point.timestamp`.
- `metric_point.timestamp`.
- `metric_ingest_cardinality.metricName, windowStart`.

## Write Ownership

Only `core/storage-write` creates, updates, or deletes records. Writes are driven by `PersistTelemetryCommand.commandId` and are idempotent by command ID plus entity ID.

AI evaluation writes are also owned by `core/storage-write`. `core/ai-eval-runner` sends commands over NATS and never writes SurrealDB directly.

## Ingest Command Record

```ts
{
  tenantId: string
  projectId: string
  commandId: string
  source: "otlp-traces" | "otlp-logs" | "otlp-metrics"
  requestId: string
  subject: string
  traceCount: number
  spanCount: number
  logCount: number
  metricPointCount: number
  completedAt: Date
}
```

The write service records an `ingest_command` row only after the telemetry transaction succeeds. If an `ingest_command` already exists for a `commandId`, the JetStream message is acknowledged without rewriting telemetry records.

## Read Ownership

Only `core/storage-read` executes read queries for trace search, trace detail, log search, and correlation. Read queries must not mutate data, create missing services, or update counters.

## Migration Rule

Schema initialization must be idempotent. `core/storage-write` owns schema initialization at startup before its JetStream consumer starts. `core/storage-read` checks schema readiness at startup and fails readiness if required tables or indexes are missing.

Telemetry databases must be strict and tables must be schemafull except explicitly flexible payload fields for OpenTelemetry attributes and log bodies.

Storage-owning writers must authenticate before selecting a namespace/database
and must explicitly create missing namespaces/databases before applying schema.
This is required for SurrealDB 3.1, where selecting a missing namespace fails
instead of implicitly creating it. `core/storage-read` must not create missing
schema; it reports missing namespace, database, tables, or indexes through
readiness failure.

SurrealDB version upgrades must be validated with the opt-in live SurrealDB
integration suites before promotion. At minimum, run retention adapter coverage
and the storage-read/storage-maintenance Go suites against the target
SurrealDB image tag. If a release changes query planner, index, or storage
engine behavior, also run the opt-in query-plan suites and record the result in
release evidence.

## Secret And Permission Rules

Telemetry databases and the control-plane database must use SurrealDB schemafull tables plus table permissions that deny direct end-user record access. Application services connect with service credentials and enforce authorization before queries or mutations.

Secrets and bearer tokens are never stored plaintext:

- `ingest_credential.secretHash` stores a one-way hash only.
- Local development bearer-token maps are runtime configuration and are not persisted.
- JWTs, session cookies, Authorization headers, provider API keys, and SurrealDB credentials are not written to telemetry records, metric attributes, dashboard definitions, dashboard pins, logs, or generated assets.

SurrealDB schema initialization for secret-bearing or user-configurable tables must include explicit fields and deny broad flexible object storage except for validated OpenTelemetry payload fields.
