---
name: cloudgrid-surrealdb
description: Implements or reviews CloudGrid SurrealDB schema, query, readiness, storage adapter, and credential-handling work. Use when editing storage-read, storage-write, control-plane SurrealDB adapters, SurrealQL, schema initialization, INFO readiness checks, telemetry query behavior, or storage debugging.
---

# CloudGrid SurrealDB Development

Use this skill when implementing or debugging CloudGrid storage work that touches SurrealDB schema, SurrealQL queries, readiness checks, or storage credentials.

Do not install SurrealDB MCP servers, third-party skills, or external code
generators. This skill is a local guide only. When syntax might depend on the
SurrealDB server or Go SDK version, verify against official docs before editing
code.

## Source Order

Start with the owning storage code, generated contracts, tests, and public docs,
then use official docs only to confirm SurrealDB syntax and SDK APIs:

1. `core/storage-read/internal/adapters/surrealdb`
2. `core/storage-write/internal/adapters/surrealdb`
3. `core/control-plane/internal/adapters/surrealdb`
4. `core/go-contracts`
5. `apps/packages/ui-contracts`
6. `website/src/content/handbook/reference/environment-variables.md`
7. `.env.example`

If behavior is missing from code, contracts, and docs, report it as a product
gap. Do not invent fields, tables, indexes, transactions, retry behavior, NATS
subjects, or error codes from SurrealDB examples.

## Storage Boundaries

Respect these CloudGrid boundaries exactly:

- Only `core/storage-write` creates, updates, deletes, or initializes SurrealDB schema.
- Only `core/storage-read` fetches telemetry from SurrealDB.
- Only `core/control-plane` reads or mutates central company, user,
  membership, project, dashboard, retention, alert, invitation, and email outbox
  state.
- `core/storage-read` may check schema readiness, but it must not create missing tables or indexes.
- `core/otlp-collector` publishes ingest commands to NATS and never imports or calls SurrealDB.
- `apps/backend` talks to storage through NATS request/reply only and must not import SurrealDB clients or storage adapters.
- `apps/frontend` talks only to the TypeScript BFF and must never receive SurrealDB credentials or direct query capability.

## Schema Ownership

The required tables and indexes are defined by the storage adapter schema
initialization code and readiness tests. Treat those files as the source path
for schema shape until product behavior changes.

Telemetry tables:

- `trace`
- `span`
- `log_event`
- `service`

Required MVP indexes:

- `trace.startedAt`
- `trace.serviceName`
- `trace.status`
- `span.traceId`
- `span.parentSpanId`
- `log_event.timestamp`
- `log_event.serviceName`
- `log_event.traceId`
- `log_event.spanId`
- `log_event.severityText`

`span_event` is embedded in `span.events` for the MVP. Do not add a
`span_event` table unless product behavior changes.

Use direct ID fields for MVP correlation. Do not introduce relation tables for
trace-span, span-log, trace-log, or service relationships unless product
behavior changes.

Control-plane tables belong to `core/control-plane/internal/adapters/surrealdb`.
Do not reuse telemetry storage adapters for company, project, invitation,
dashboard, retention, alert, or email outbox data.

## Schema Initialization Guidance

Implement schema initialization only in `core/storage-write/internal/adapters/surrealdb`, before the JetStream consumer starts. Initialization must be idempotent.

When writing SurrealQL definitions:

- Prefer explicit `DEFINE TABLE IF NOT EXISTS`, `DEFINE FIELD IF NOT EXISTS`, and `DEFINE INDEX IF NOT EXISTS` patterns when they match the target SurrealDB version.
- Keep field names and record shapes aligned with adapter schema
  initialization and readiness tests.
- Define indexes only for required query paths unless product behavior adds
  more.
- Keep schema, query, client, readiness, and future migration code inside `core/storage-read/internal/adapters/surrealdb` or `core/storage-write/internal/adapters/surrealdb`, not in shared packages or public services.

Verify current syntax in official docs:

- [SurrealQL reference](https://surrealdb.com/docs/surrealql)
- [DEFINE TABLE](https://surrealdb.com/docs/surrealql/statements/define/table)
- [DEFINE FIELD](https://surrealdb.com/docs/surrealql/statements/define/field)
- [DEFINE INDEX](https://surrealdb.com/docs/surrealql/statements/define/indexes)

## Query Guidance

All telemetry read queries belong in `core/storage-read`. Validate request shape before issuing SurrealQL:

- Invalid time ranges map to `ERR-001 VALIDATION_FAILED`.
- Malformed cursors map to `ERR-003 INVALID_CURSOR`.
- Missing traces map to `ERR-004 TRACE_NOT_FOUND`.
- SurrealDB connection/query availability failures map to `ERR-006 STORAGE_UNAVAILABLE`.
- Time range filters use inclusive bounds.
- Cursor pagination must be deterministic while data is unchanged.

Use parameterized SurrealQL instead of string interpolation for values. Bind trace IDs, span IDs, service names, status values, severity values, timestamps, limits, cursors, and search text through the SurrealDB client API supported by the current Go SDK. Never concatenate user or message input into SurrealQL.

Only interpolate table or index identifiers if there is no SDK-safe alternative
and the identifier comes from a closed, hard-coded allowlist matching required
tables/indexes. Do not accept table names from NATS messages, GraphQL inputs,
frontend state, environment variables, or logs.

Storage-read must push supported filters, sorting, cursor predicates, counts,
grouping, and bounded facets into the database adapter. Do not fetch broad raw
datasets and post-process them in Go when the query contract requires adapter
pushdown.

Official docs for query syntax and parameter behavior:

- [SurrealQL parameters](https://surrealdb.com/docs/surrealql/parameters)
- [Transactions](https://surrealdb.com/docs/surrealql/transactions)
- [Go SDK](https://surrealdb.com/docs/sdk/golang)
- [Go SDK installation and imports](https://surrealdb.com/docs/sdk/golang/installation)

## Write Guidance

All telemetry writes belong in `core/storage-write` and are driven by `PersistTelemetryCommand` messages.

- Acknowledge JetStream messages only after persistence succeeds.
- Upsert duplicate traces and spans by canonical ID.
- Upsert duplicate logs by generated `LogEvent.id`.
- Writes for a single ingest command are all-or-nothing where SurrealDB transaction support is available.
- If transactions are unavailable in the selected SurrealDB mode, persist traces before spans and logs and record `ERR-007 PARTIAL_WRITE` if a later step fails after earlier records may have persisted.

Before using `BEGIN TRANSACTION`, verify transaction support and syntax for the configured SurrealDB mode and version in the official transaction docs.

## Readiness Checks

`core/storage-write` readiness should fail when it cannot reach SurrealDB or cannot confirm its owned schema initialization completed.

`core/storage-read` startup/readiness should check that required tables and indexes exist, but it must not define or repair them.

Use SurrealDB `INFO` statements for readiness inspection:

- `INFO FOR DB;` to inspect database-level definitions and confirm required tables are present.
- `INFO FOR TABLE trace;`, `INFO FOR TABLE span;`, `INFO FOR TABLE log_event;`, and `INFO FOR TABLE service;` to inspect per-table fields and indexes.
- `INFO FOR INDEX <index_name> ON <table_name>;` only for hard-coded,
  product-owned indexes if the implementation gives indexes explicit names.

Compare `INFO` output against the required tables/indexes from adapter schema
initialization and readiness tests. Missing schema in storage-read is a
readiness failure, not an auto-migration trigger.

Verify current `INFO` syntax and output shape in the official [INFO statement docs](https://surrealdb.com/docs/surrealql/statements/info).

## Forbidden Imports And Leakage

Do not add SurrealDB clients, SurrealDB adapters, or SurrealQL files to:

- `apps/backend`
- `apps/frontend`
- `core/otlp-collector`
- `apps/packages/definition`
- `apps/packages/ui-contracts`
- generated frontend assets

Do not expose or log SurrealDB credentials, connection URLs with credentials, namespace/database secrets, provider stack traces, or raw provider errors. Credentials must not appear in frontend bundles, BFF responses, GraphQL errors, NATS replies, OTLP responses, logs, screenshots, generated docs, or skill output.

Map provider failures to canonical error codes and include only safe context
such as `request_id`, `command_id`, `trace_id`, `span_id`, `nats_subject`, and
canonical error code.

## Working Checklist

Before editing storage code:

1. Read the relevant source files listed in Source Order.
2. Identify whether the change belongs to `storage-write` or `storage-read`.
3. Confirm the table, field, index, or query behavior already exists in code,
   generated contracts, or public docs.
4. Check official SurrealDB docs for version-sensitive syntax.
5. Use parameter bindings for values and hard-coded allowlists for any identifiers.
6. Add readiness checks with `INFO` statements when schema presence affects startup health.
7. Add or update tests for query generation, readiness, persistence idempotency,
   or failure mapping.
8. Run the narrowest relevant Go tests when code changes are in scope. Contract
   changes also require `bun run contracts:check`.

For skill/docs-only work, inspect the Markdown for clarity and grounding. Do not run application code unless it directly helps verification.
