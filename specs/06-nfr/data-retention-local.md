---
id: NFR-006
title: Data retention
category: compliance
status: draft
provenance: inferred-draft
target: Local MVP exposes project retention policy configuration but retains telemetry until operator deletion unless a future storage-maintenance worker executes policy batches.
measurement: Documentation check, presence of policy CRUD contracts, absence of deletion jobs in local MVP, and future retention-worker tests before production retention execution is enabled.
applies_to: [CAP-STO-*]
enforcement: blocking-for-production-retention
---

# Data Retention

The MVP implements project-level retention policy CRUD, but it does not implement automatic deletion jobs or public telemetry deletion APIs. This split must be visible to operators because telemetry may contain sensitive attributes.

## Local MVP

- Project admins can configure retention policy metadata.
- No automatic deletion job runs.
- No public telemetry deletion API exists.
- Operators delete local data by resetting or deleting the SurrealDB database.
- Docs must warn that telemetry may contain sensitive attributes and is retained until operator action.

## Production Retention Execution Target

Retention execution must follow [Project data retention policy](../04-backend/data-retention-policy.md). The approved product decision is project-level editable retention in Project Settings, not deployment-wide-only retention.

Use these defaults unless a project policy overrides them:

- Default retention: 30 days for traces, spans, span events, span links, logs, metrics, and metric exemplars.
- Default AI-eval retention: 90 days for runs, results, optimization runs, annotation items, and captured eval artifacts.
- Default ingest credential audit retention: 365 days.
- Minimum configurable retention: 1 day.
- Maximum configurable retention: 365 days unless a paid plan or compliance spec explicitly raises it.
- Deletion cadence: background worker runs at least hourly.
- Deletion owner: a dedicated storage-maintenance service. The BFF and frontend must not delete retained records directly.

## Deletion Semantics

Retention deletion must support both hard delete and soft-delete-then-delete, selectable by a project admin per data class. Hard delete removes eligible records immediately in dependency order. Soft delete hides records from normal reads, stores deletion metadata, and final-deletes them after the configured soft-delete window.

Retention deletion must remove a trace and its dependent spans, span events, span links, related logs, and ingest command audit rows when all records are older than the retention cutoff. If a log belongs to a retained trace, the log may remain until the trace ages out.

Retention must be tenant/project scoped when tenant/project isolation is enabled. A retention worker must never delete outside the configured tenant/project partition for the current batch.

## Configuration

Future retention config keys:

- `CLOUDGRID_RETENTION_MODE`, allowed values `disabled` and `ttl`, default `disabled` in local development and `ttl` in production templates once the worker exists.
- `CLOUDGRID_RETENTION_DAYS`, integer from 1 to 365, default `30` when mode is `ttl`.
- `CLOUDGRID_RETENTION_BATCH_SIZE`, integer from 1 to 10000, default `1000`.

Until the worker exists, setting `CLOUDGRID_RETENTION_MODE=ttl` must fail startup with ERR-009 instead of silently doing nothing.

## Tests

Default tests assert that no retention worker starts in local mode. Retention integration tests are opt-in and must create isolated test records, run one deletion batch, assert dependent record deletion, and assert that records outside the tenant/project and cutoff remain.
