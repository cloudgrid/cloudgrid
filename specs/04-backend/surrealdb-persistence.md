---
id: TEC-BE-003
title: SurrealDB persistence
layer: backend
status: draft
owner: unknown@example.com
updated: 2026-05-08
provenance: inferred-draft
---

# SurrealDB Persistence

SurrealDB telemetry databases are accessed only by `core/storage-read` and `core/storage-write`. The central control-plane database is accessed only by `core/control-plane`.

Implementation code for this adapter lives under:

- `core/storage-read/internal/adapters/surrealdb`
- `core/storage-write/internal/adapters/surrealdb`

Schema definitions, query builders, client setup, readiness checks, and SurrealDB migrations must stay inside those adapter directories. Service runtime packages depend on storage ports and compose this adapter at startup.

Control-plane schema definitions for organizations, users, projects, memberships, ingest credentials, dashboards, and dashboard pins live under `core/control-plane/internal/adapters/surrealdb`. The telemetry storage adapters must not create, update, or query control-plane dashboard tables.

The full tenancy and SurrealDB-native modeling strategy is defined in `04-backend/surrealdb-tenancy-and-modeling.md`. This file defines the current telemetry record shape.

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

## Trace Record

```ts
{
  tenantId: string
  projectId: string
  traceId: string
  serviceName?: string
  startedAt: Date
  endedAt?: Date
  durationMs?: number
  rootSpanId?: string
  status?: "ok" | "error" | "unset"
  attributes: Record<string, unknown>
  spanCount: number
  errorSpanCount: number
  logCount: number
  serviceCount: number
}
```

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
}
```

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
  firstSeenAt: Date
  lastSeenAt: Date
}
```

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
- `trace.serviceName`.
- `trace.serviceName, trace.startedAt`.
- `trace.status`.
- `trace.status, trace.startedAt`.
- `span.traceId`.
- `span.parentSpanId`.
- `span.traceId, parentSpanId`.
- `span.serviceName`.
- `span.name`.
- `span.status`.
- `log_event.timestamp`.
- `log_event.serviceName`.
- `log_event.serviceName, timestamp`.
- `log_event.traceId`.
- `log_event.traceId, timestamp`.
- `log_event.spanId`.
- `log_event.severityText`.
- `metric_descriptor.metricName`.
- `metric_descriptor.lastSeenAt`.
- `metric_point.metricName`.
- `metric_point.metricName, timestamp`.
- `metric_point.serviceName, timestamp`.
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

## Secret And Permission Rules

Telemetry databases and the control-plane database must use SurrealDB schemafull tables plus table permissions that deny direct end-user record access. Application services connect with service credentials and enforce authorization before queries or mutations.

Secrets and bearer tokens are never stored plaintext:

- `ingest_credential.secretHash` stores a one-way hash only.
- Local development bearer-token maps are runtime configuration and are not persisted.
- JWTs, session cookies, Authorization headers, provider API keys, and SurrealDB credentials are not written to telemetry records, metric attributes, dashboard definitions, dashboard pins, logs, or generated assets.

SurrealDB schema initialization for secret-bearing or user-configurable tables must include explicit fields and deny broad flexible object storage except for validated OpenTelemetry payload fields.
