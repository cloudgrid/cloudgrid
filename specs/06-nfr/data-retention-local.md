---
id: NFR-006
title: Data retention
category: compliance
status: draft
provenance: inferred-draft
target: Local MVP exposes project retention policy configuration and keeps scheduled deletion disabled unless operators explicitly enable storage-maintenance after the production SurrealDB retention adapter exists.
measurement: Documentation check, presence of policy CRUD contracts, disabled-by-default scheduler config, absence of enabled deletion jobs in local MVP, and opt-in retention adapter tests before production retention execution is enabled.
applies_to: [CAP-STO-*]
enforcement: blocking-for-production-retention
---

# Data Retention

The MVP implements project-level retention policy CRUD and the storage-maintenance execution boundary, but local mode does not enable automatic deletion jobs or public telemetry deletion APIs. This split must be visible to operators because telemetry may contain sensitive attributes.

## Local MVP

- Project admins can configure retention policy metadata.
- No automatic deletion job runs by default.
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
- Deletion cadence: storage-maintenance scheduler defaults to hourly once enabled.
- Deletion owner: the dedicated storage-maintenance service. The BFF and frontend must not delete retained records directly.

## Deletion Semantics

Retention deletion must support both hard delete and soft-delete-then-delete, selectable by a project admin per data class. Hard delete removes eligible records immediately in dependency order. Soft delete hides records from normal reads, stores deletion metadata, and final-deletes them after the configured soft-delete window.

Retention deletion must remove a trace and its dependent spans, span events, span links, related logs, and ingest command audit rows when all records are older than the retention cutoff. If a log belongs to a retained trace, the log may remain until the trace ages out.

Retention must be tenant/project scoped when tenant/project isolation is enabled. A retention worker must never delete outside the configured tenant/project partition for the current batch.

## Configuration

Retention execution config keys:

- `CLOUDGRID_RETENTION_SCHEDULER_ENABLED`, default `false`.
- `CLOUDGRID_RETENTION_SCHEDULER_INTERVAL_SECONDS`, integer from 300 to 86400, default `3600`.
- `CLOUDGRID_RETENTION_SCHEDULER_PROJECT_IDS`, comma-separated project IDs required when the scheduler is enabled.
- `CLOUDGRID_RETENTION_BATCH_LIMIT`, integer from 1 to 100000, default `1000`.
- `CLOUDGRID_RETENTION_LEASE_SECONDS`, integer from 60 to 86400, default `900`.

Setting the scheduler enabled without project IDs must fail startup with ERR-009. Production templates must keep the scheduler disabled until the production SurrealDB retention adapter and storage-read soft-delete filters are implemented.

## Tests

Default tests assert that no retention scheduler starts in local mode. Retention integration tests are opt-in and must create isolated test records, run one deletion batch, assert dependent record deletion, assert soft-delete hiding behavior, and assert that records outside the tenant/project and cutoff remain.
