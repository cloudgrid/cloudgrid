---
id: TEC-BE-012
title: SurrealDB tenancy and native modeling
layer: backend
status: draft
owner: unknown@example.com
updated: 2026-05-11
provenance: research-informed
---

# SurrealDB Tenancy And Native Modeling

This spec refines the SurrealDB adapter strategy using SurrealDB's namespace/database hierarchy, strict schema definitions, graph relations, full-text indexes, vector support, time-series patterns, and permission model.

## Physical Layout

Use three logical layers:

1. Control plane: namespace `cloudgrid_control`, database `control`.
2. Tenant telemetry: one namespace per tenant, name `cg_tenant_<tenantId>`.
3. Project telemetry: one strict database per project inside the tenant namespace, name `project_<projectId>`.

This gives database-level separation for projects and namespace-level separation for tenants while keeping company/user/project management centralized.

Local disabled auth mode uses namespace `cloudgrid_local`, database `project_default`.

## Database Strictness

Every CloudGrid-managed SurrealDB database must be `STRICT`. Telemetry tables must be `SCHEMAFULL` except explicitly flexible nested payload fields:

- `trace.attributes`
- `span.attributes`
- `span.events[*].attributes`
- `span.links[*].attributes`
- `log_event.attributes`
- `log_event.body`

Schema initialization must use idempotent `DEFINE ... OVERWRITE` statements where supported and must fail readiness if a required table, field, or index cannot be verified.

## Service Credentials

No frontend, BFF, or collector receives SurrealDB credentials.

SurrealDB users/access are separated by responsibility:

- `control-plane`: read/write only in `cloudgrid_control/control`.
- `storage-write`: read/write only in the target tenant/project telemetry database.
- `storage-read`: read-only in the target tenant/project telemetry database.
- migration/admin credentials: used only by schema initialization or controlled migration jobs.

SurrealDB table `PERMISSIONS` must deny end-user record access for telemetry and control-plane tables. Application authorization is enforced by BFF/control-plane/storage-read and backed by service credentials. Direct client access to SurrealDB is not a product API.

Control-plane tables that store user customization, including `dashboard` and `dashboard_pin`, must be `SCHEMAFULL` and define only the validated fields from their contract schemas. They must not permit arbitrary code, query strings, external script/embed URLs, or secret-bearing flexible fields.

## Control Plane Modeling

Use SurrealDB graph relations for low-volume management relationships:

```text
user -> membership -> organization
organization -> owns_project -> project
user -> dashboard_pin -> dashboard
```

Relation records carry the small amount of relationship state needed by the product: membership role and actor metadata, project ownership metadata, or dashboard pin position. Control-plane queries may use graph traversal for organization/project navigation, membership checks, and the current user's pinned dashboards.

Control-plane dashboard modeling uses SurrealDB's model mix:

- document records for `dashboard` because the widget tree is loaded, validated, versioned, and saved as one configuration document;
- graph relation records for `dashboard_pin` because pins are a user-to-dashboard relationship with ordering metadata;
- deterministic record IDs for key-value-style direct lookup of project and personal dashboard documents;
- SQL-like indexed filters for dashboard list/search by project, visibility, owner, slug, tags, and updated time.

## Telemetry Modeling

Use document records plus indexed fields for hot telemetry:

- `trace` stores trace summary fields and flexible attributes.
- `span` stores span fields, embedded span events, embedded span links, and flexible attributes.
- `log_event` stores log fields, flexible body, bodyText, and attributes.
- `service` stores service metadata observed in the project.
- `ingest_command` stores idempotency/audit metadata.

Do not create graph relation records for every span parent/child edge on the ingest hot path. Span hierarchy is represented by deterministic record IDs plus indexed scalar fields: `traceId`, `spanId`, and `parentSpanId`. Storage-read derives trees from those fields. High-volume graph edges may be introduced only by a later async topology/materialization spec.

Record links may be added only when they replace a real hot query or enable a direct lookup without duplicating work on every ingest. The MVP telemetry read paths do not need SurrealDB graph traversal for trace detail, trace search, log search, or metric series reads. Low-volume control-plane relationships are the appropriate place for graph relation tables because those relationships carry membership/pin/project metadata and are navigated interactively.

## Record IDs

Inside a project database:

- `trace:<traceId>`
- `span:<traceId>_<spanId>`
- `log_event:<deterministicLogEventId>`
- `metric_descriptor:<metricNameSlug>`
- `metric_point:<metricNameSlug>_<timestampUnixNano>_<attributeHash>`
- `metric_ingest_cardinality:<metricNameSlug>_<windowStart>`
- `service:<serviceNameSlug>`
- `ingest_command:<commandId>`

Trace IDs and span IDs remain fields as well as record ID components so GraphQL contracts and indexes stay stable.

## Index Strategy

Required synchronous indexes:

- `trace.startedAt`
- `trace.operationName, trace.startedAt` may be added when operation-name filtering moves from span lookup to trace summary filtering.
- `trace.tenantId, trace.companyId, trace.projectId, startedAt`
- `trace.tenantId, trace.companyId, trace.projectId, traceId`
- `trace.tenantId, trace.companyId, trace.projectId, serviceName, startedAt`
- `trace.tenantId, trace.companyId, trace.projectId, status, startedAt`
- `trace.serviceName`
- `trace.status`
- `span.traceId`
- `span.parentSpanId`
- `span.tenantId, span.companyId, span.projectId, traceId, parentSpanId, startedAt`
- `span.tenantId, span.companyId, span.projectId, serviceName, traceId`
- `span.serviceName`
- `span.name`
- `span.status`
- `trace.searchText` full-text index using `cloudgrid_search`
- `log_event.timestamp`
- `log_event.tenantId, log_event.companyId, log_event.projectId, timestamp`
- `log_event.tenantId, log_event.companyId, log_event.projectId, serviceName, timestamp`
- `log_event.tenantId, log_event.companyId, log_event.projectId, traceId, timestamp`
- `log_event.serviceName`
- `log_event.traceId`
- `log_event.spanId`
- `log_event.severityText`
- `log_event.searchText` full-text index using `cloudgrid_search`
- `metric_descriptor.metricName`
- `metric_descriptor.lastSeenAt`
- `metric_descriptor.tenantId, metric_descriptor.companyId, metric_descriptor.projectId, lastSeenAt`
- `metric_descriptor.tenantId, metric_descriptor.companyId, metric_descriptor.projectId, metricName`
- `metric_descriptor.searchText` full-text index using `cloudgrid_search`
- `metric_point.metricName`
- `metric_point.metricName, timestamp`
- `metric_point.tenantId, metric_point.companyId, metric_point.projectId, metricName, timestamp`
- `metric_point.serviceName, timestamp`
- `metric_point.tenantId, metric_point.companyId, metric_point.projectId, serviceName, timestamp`
- `metric_point.timestamp`
- `metric_ingest_cardinality.metricName, windowStart`
- `ingest_command.commandId` unique
- `ingest_command.completedAt`

Control-plane indexes:

- `dashboard.projectId`
- `dashboard.projectId, visibility`
- `dashboard.projectId, visibility, ownerUserId, slug` unique
- `dashboard.projectId, searchText`
- `dashboard.projectId, updatedAt`
- `dashboard_pin.in, projectId, position`
- `dashboard_pin.in, out, projectId` unique

Telemetry search uses a materialized `searchText` string because SurrealDB full-text indexes are single-field indexes. Schema initialization must define one shared `cloudgrid_search` analyzer with `blank`, `class`, and `camel` tokenizers plus lowercase/ascii filters, then define synchronous `FULLTEXT ANALYZER cloudgrid_search BM25` indexes on `trace.searchText`, `log_event.searchText`, and `metric_descriptor.searchText`.

Route-primary trace, live-trace, log, and metric-name free-text search must use SurrealDB full-text match operators against `searchText`; it must not use substring `CONTAINS` over hot telemetry fields or dynamic attribute joins. Full-text and vector indexes on hot telemetry may use `DEFER` only when the UI can tolerate short indexing lag and a spec explicitly accepts eventual search consistency. Exact filters must continue to use synchronous indexes.

Vector indexes are not part of the MVP telemetry hot path. Future AI investigation features may add a separate `trace_embedding` or `log_embedding` table with explicit embedding model, dimension, lifecycle, and backfill specs.

## Query Rules

All SurrealQL from adapters must use parameterized queries. Do not interpolate GraphQL input, tenant IDs, project IDs, trace IDs, attribute keys, or cursor values into query strings except through validated field-name allowlists.

Storage-read must prefer direct record ID lookup for `trace(id)` and indexed predicates for lists/facets. Query builders must have tests for generated SurrealQL text and parameters.

Storage-write must use deterministic record IDs for single-record trace, span, log, service, metric descriptor, metric cardinality, and ingest-command mutations. It must not update hot telemetry rows by scanning `WHERE tenantId AND companyId AND projectId AND id-field` when the target record ID is known.

Use `EXPLAIN`/`EXPLAIN ANALYZE` in opt-in integration tests for critical query shapes:

- trace search by service/time,
- trace search by status/time,
- trace detail by trace ID,
- logs by trace/time,
- logs by service/time,
- bounded facets.

The default CI path must not depend on exact `EXPLAIN` output shape.

Known expensive exploratory predicates must remain visibly bounded until materialized indexes exist. This includes arbitrary `attributes[$key]` filters, bounded typeahead substring matching on facet labels, and attribute-key discovery with `object::keys(attributes)`. Product surfaces that use those predicates must keep small default limits and explicit time windows, and must not be used as unbounded project overview queries.

## Events, Live Queries, And Changefeeds

SurrealDB events and live queries must not be used on the ingest hot path for MVP live telemetry. CloudGrid's public realtime path remains storage-write post-persist notification through NATS and storage-read fanout.

SurrealDB changefeeds are reserved for a specified backfill, export, or
materialization worker and must not power BFF live subscriptions. A
changefeed-based worker must define retention duration, replay cursor storage,
and failure recovery before implementation.

Database events may be used for low-volume control-plane audit rows. They must not perform expensive telemetry aggregation inside the write transaction.

## Performance Rules

- Ingest requests must perform local auth validation and one storage-write persistence transaction; no control-plane lookup is allowed per request.
- Avoid synchronous full-text/vector index maintenance on the write hot path unless measured latency remains within NFR targets.
- Bounded facets must query indexed fields and limit result counts.
- Project selection telemetry overview is fetched through storage-read `telemetry.projects.overview` for the explicit projects returned by control-plane. Storage-read owns the database queries for `traceCount`, `logCount`, `metricCount`, `serviceCount`, and `lastIngestAt`; the BFF may only merge returned values into control-plane project view models.
- Large cross-project analytics must query explicit project summary tables, not fan out over every telemetry database during page render.

## Source Basis

This spec follows SurrealDB documentation on multi-model storage, namespace/database isolation, strict schemas, row/table permissions, JWT-backed auth, graph relations, full-text/vector/time-series models, parameterized queries, live queries, changefeeds, and query optimization.
