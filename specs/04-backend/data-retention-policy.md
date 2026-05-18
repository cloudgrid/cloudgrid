---
id: TEC-BE-020
title: Project data retention policy
layer: backend
status: draft
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-18
provenance: user-directed
depends_on: [NFR-006, TEC-BE-004, TEC-BE-011, TEC-BE-009]
---

# Project Data Retention Policy

## Decision

CloudGrid supports project-level editable retention policies in Project Settings. Retention is not a deployment-wide-only switch. Each project has one effective retention policy with per-data-class settings.

## Data Classes

Retention policy stores an explicit rule for each data class:

- `TRACES`: traces, spans, span events, span links, and trace warnings;
- `LOGS`: log records;
- `METRICS`: metric descriptors, metric points, and exemplars;
- `AI_EVALS`: AI eval runs, experiment runs, eval results, optimization runs, annotation queue items, and captured eval artifacts;
- `DATASETS`: datasets and dataset items;
- `SCORERS`: scorer definitions and scorer outputs;
- `DASHBOARD_HISTORY`: dashboard saved versions or dashboard history when dashboard history exists;
- `INGEST_CREDENTIAL_AUDIT`: ingest credential audit rows, including created, revoked, and last-used events.

Public contracts must use `RetentionDataClass` enum symbols exactly as listed above. Storage table names and internal adapter identifiers may differ, but they must map one-to-one to these enum values.

Dashboard definitions, current project configuration, users, companies, memberships, and active ingest credential metadata are not deleted by telemetry retention. They require explicit control-plane delete/revoke operations.

## Policy Shape

Each data-class rule has:

- `dataClass`: one `RetentionDataClass` value;
- `mode`: `retain`, `delete`, or `soft_delete_then_delete`;
- `retentionDays`: integer from 1 to 365;
- `softDeleteDays`: integer from 1 to 90, required only for `soft_delete_then_delete`;
- `updatedAt`, `updatedByUserId`, and `version`.

Default project policy:

- `TRACES`, `LOGS`, and `METRICS`: `delete` after 30 days;
- `AI_EVALS`: `delete` after 90 days;
- `DATASETS`, `SCORERS`, and `DASHBOARD_HISTORY`: `retain`;
- `INGEST_CREDENTIAL_AUDIT`: `delete` after 365 days.

`updateRetentionPolicy` replaces the complete rule set for a project. The input must include exactly one rule for every `RetentionDataClass`. The mutation must reject missing, duplicate, or unknown data classes with `ERR-016`. The input carries `expectedVersion`; the control-plane rejects stale updates with `ERR-016` and returns a problem detail whose `operation_or_subject` is `control.retention.update`.

Admins may choose hard delete (`delete`) or soft delete followed by final delete (`soft_delete_then_delete`) per data class. `retain` means no automatic deletion for that data class.

## Authorization

Reading the effective retention policy requires selected-project read access.

Editing retention requires project `admin` or company `admin` for that project. Local mode treats the local Personal user as project admin.

## Ownership

Control-plane owns retention policy records and GraphQL/project settings mutations.

A dedicated storage-maintenance service owns deletion execution. Storage-write remains the only normal telemetry mutation service, but retention deletion is a maintenance mutation boundary and must not be implemented in the BFF or frontend.

Storage-read hides soft-deleted records from normal GraphQL queries. Admin-only future audit/export surfaces may include soft-deleted records only through explicit contracts.

## Deletion Semantics

Deletion runs project-scoped batches. A batch must never delete outside the selected tenant/company/project partition.

Hard delete removes eligible records immediately in dependency order so no orphaned spans, links, logs, exemplars, eval artifacts, or audit rows remain.

Soft delete marks eligible records with `deletedAt`, `deletedByRetentionPolicyId`, and `finalDeleteAfter`. Final deletion removes them after `softDeleteDays`.

Retention decisions use record event time when available and persisted time otherwise. A trace is eligible when its root trace end time is older than the cutoff. Logs and metrics are eligible by their timestamp. AI eval and dataset records are eligible by completed/persisted time according to their class.

## Scheduler Semantics

The storage-maintenance service owns retention scheduling. The BFF, frontend,
control-plane, storage-read, and storage-write must not run retention loops.

Scheduler configuration:

- `CLOUDGRID_RETENTION_SCHEDULER_ENABLED`: default `false`; production
  deployments set `true` only after the SurrealDB retention adapter is enabled.
- `CLOUDGRID_RETENTION_SCHEDULER_INTERVAL_SECONDS`: default `3600`; integer
  `300..86400`.
- `CLOUDGRID_RETENTION_SCHEDULER_PROJECT_IDS`: comma-separated project IDs for
  the first production wave. Automatic project discovery is not part of this
  contract until a project-enumeration message bridge contract exists.
- `CLOUDGRID_RETENTION_BATCH_LIMIT`: default `1000`; integer `1..100000`;
  passed as `limit` to every scheduled batch.
- `CLOUDGRID_RETENTION_LEASE_SECONDS`: default `900`; integer
  `60..86400`; must be greater than the scheduler interval only when one batch
  can overlap the next interval for the same project/data class.

On each tick, storage-maintenance evaluates every configured project ID and
every `RetentionDataClass` in the enum order listed in this spec. It sends the
same internal request shape as `storage_maintenance.retention.execute_batch`
with `requestedAt` set once per tick, `dryRun=false`, and
`limit=CLOUDGRID_RETENTION_BATCH_LIMIT`.

Scheduled execution must be project/data-class isolated. Failure in one project
or data class must not stop the rest of the tick.

## Lease And Retry Semantics

The production scheduler uses a SurrealDB-backed lease table owned by
storage-maintenance. Lease key:

```text
retention:{projectId}:{dataClass}
```

Lease fields:

- `key`
- `projectId`
- `dataClass`
- `ownerId`
- `acquiredAt`
- `expiresAt`
- `lastCompletedAt`
- `lastErrorCode`
- `lastErrorAt`

Only one storage-maintenance replica may execute a project/data-class batch
while the lease is valid. A replica may acquire a lease when no row exists or
`expiresAt <= now`. Lease acquisition and update must be a single SurrealDB
transaction or an equivalent compare-and-set query. The `ownerId` is a stable
process ID generated at startup and never exposed publicly.

Retry policy:

- retryable storage or bridge errors leave the lease with `lastErrorCode` and
  `lastErrorAt`; the next scheduler tick may retry after the lease expires;
- validation errors, missing policy, and `retain` rules are terminal for that
  batch and must not be retried before the next normal tick;
- repeated retryable failures are not parked in a dead-letter stream in this
  wave; operators inspect structured logs and the lease row fields.

## Production Storage Adapter Contract

The production SurrealDB adapter implements the same `RetentionStore` port used
by the direct executor. It must:

- load the effective control-plane retention policy through the private
  control-plane bridge or a storage-maintenance-local control-plane adapter;
- execute deletes only inside the selected tenant/company/project partition;
- implement class-specific dependency order for hard deletes;
- mark soft-deleted rows with `deletedAt`, `deletedByRetentionPolicyId`, and
  `finalDeleteAfter` where the target table supports soft deletion;
- hide soft-deleted telemetry from storage-read normal queries before final
  deletion ships to production;
- record one audit row per attempted batch after executor completion.

Adapter tests must run by default against isolated in-memory fixtures. Real
SurrealDB adapter tests are opt-in with:

```sh
CLOUDGRID_ENABLE_SURREALDB_RETENTION_TESTS=true
```

Default root verification must not require the scheduler, real SurrealDB
retention deletion, or production credentials.

## Implementation Status

Implemented:

- GraphQL `RetentionPolicy`, `RetentionRule`, `retentionPolicy(projectId)`, and `updateRetentionPolicy` contracts;
- control-plane message bridge subjects for get/update policy;
- SurrealDB schema and control-plane storage for `retention_policy`;
- BFF bridge/resolver validation and project settings UI for policy read/update;
- `storage-maintenance` service shell with NATS health/readiness logging;
- direct retention batch executor for the `storage_maintenance.retention.execute_batch` request/response contract;
- NATS request/reply runtime handler for the `storage_maintenance.retention.execute_batch` subject;
- disabled-by-default storage-maintenance scheduler configuration for cadence, project IDs, batch limit, lease duration, and startup owner ID;
- scheduler tick expansion across configured project IDs and all retention data classes;
- fixture-backed retention lease acquisition, lease contention skip, error recording, completion recording, and retry-after-expiry behavior;
- in-memory isolated retention fixtures for every `RetentionDataClass`;
- executor validation for request fields, delete/soft-delete policy range rules, mode-specific `softDeleteDays`, and missing policies;
- executor retain/no-op handling;
- fixture-backed hard delete, soft delete, final delete, dry-run, limit, project isolation, and normal-read soft-delete hiding behavior;
- structured retention batch logs with project, data class, policy version, dry-run, matched count, hard-deleted count, soft-deleted count, final-deleted count, duration, and terminal error fields;
- maintenance audit record hook with fixture-backed audit assertions;
- focused Go tests for executor behavior, policy validation, every data-class fixture, structured logs, audit recording, and fixture deletion semantics;
- focused Go tests for runtime subject handling and invalid request JSON.
- focused Go tests for scheduler disabled defaults, config parsing, invalid config rejection, project/data-class expansion, lease acquisition, lease contention, recorded errors, and retry after lease expiry.

Remaining before retention deletes telemetry:

- production SurrealDB storage adapter for project-scoped hard delete, soft delete, and final delete execution;
- integration tests against the production storage adapter once that adapter is specified and implemented.

`storage_maintenance.retention.execute_batch` accepts `projectId`, `dataClass`, `requestedAt`, optional `dryRun`, and optional `limit`. It returns `projectId`, `dataClass`, `policyVersion`, `dryRun`, `matchedCount`, `hardDeletedCount`, `softDeletedCount`, `finalDeletedCount`, `startedAt`, `completedAt`, and optional `error`.

## Tests

Default tests must run without a long-running scheduler. They call one batch executor directly against isolated fixtures.

Required tests:

- policy validation ranges and mode-specific fields;
- authorization for read and update;
- hard delete removes dependent records and does not cross project boundaries;
- soft delete hides records from normal reads and final delete removes them later;
- every data class has at least one retention fixture;
- root verification commands do not require production retention env vars.
- scheduler tests cover disabled default behavior, configured project/data-class
  tick expansion, lease acquisition, lease contention skip, retryable failure
  retry-after-expiry, and terminal validation behavior.
