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
by the direct executor. It is a storage-maintenance adapter; it must not live in
the BFF, frontend, collector, storage-read, or storage-write packages.

### Policy Resolution

The adapter must load the effective policy from the existing control-plane
`retention_policy` table by `projectId`. It must not duplicate policy state in
storage-maintenance. If no policy exists for the requested project/data class,
the executor returns the existing terminal missing-policy response.

The adapter maps the requested `RetentionDataClass` to one rule in the loaded
policy and copies these fields into the executor model:

- `projectId`;
- `dataClass`;
- `mode`;
- `retentionDays`;
- `softDeleteDays`;
- `version`;
- `policyId`, derived as `retention_policy:{projectId}:{dataClass}:v{version}`
  unless a future control-plane contract adds a stored per-rule ID;
- `updatedAt`;
- `updatedByUserId`.

### Adapter Tables

The SurrealDB schema owned by storage-maintenance must add these tables:

| Table | Purpose | Required fields |
| --- | --- | --- |
| `retention_lease` | One scheduler lease per project/data class. | `key`, `projectId`, `dataClass`, `ownerId`, `acquiredAt`, `expiresAt`, `lastCompletedAt`, `lastErrorCode`, `lastErrorAt` |
| `retention_audit` | One audit row per attempted batch after executor completion. | `id`, `projectId`, `dataClass`, `policyVersion`, `dryRun`, `matchedCount`, `hardDeletedCount`, `softDeletedCount`, `finalDeletedCount`, `startedAt`, `completedAt`, `errorId`, `errorCode` |

Indexes:

- `retention_lease_key` unique on `key`;
- `retention_audit_project_completedAt` on `projectId, completedAt`;
- `retention_audit_project_dataClass_completedAt` on `projectId, dataClass, completedAt`.

Lease acquisition must be atomic. The adapter may implement that with one
SurrealDB transaction or with an equivalent compare-and-set query that only
updates `retention_lease` when no row exists or `expiresAt <= $now`. It must
return `false` when another owner still holds a non-expired lease.

### Data-Class Mapping

The production adapter must use this table mapping and eligibility field:

| Data class | Tables | Eligibility time |
| --- | --- | --- |
| `TRACES` | `trace`, `span` | `trace.endedAt` when present, otherwise `trace.startedAt` |
| `LOGS` | `log_event` | `log_event.timestamp` |
| `METRICS` | `metric_descriptor`, `metric_point`, `metric_ingest_cardinality` | `metric_point.timestamp`, `metric_descriptor.lastSeenAt`, `metric_ingest_cardinality.windowStart` |
| `AI_EVALS` | `ai_agent_run`, `ai_llm_call`, `ai_tool_call`, `ai_retrieval_event`, `ai_eval_result`, `ai_experiment`, `ai_experiment_run`, `ai_dataset_item_run`, `ai_prompt_version`, `ai_annotation_queue_item` | `endedAt`, `producedAt`, `persistedAt`, then `createdAt` fallback in that order when fields exist on the row |
| `DATASETS` | `ai_dataset`, `ai_dataset_item` | `updatedAt` when present, otherwise `createdAt` |
| `SCORERS` | `ai_scorer` | `updatedAt` when present, otherwise `createdAt` |
| `DASHBOARD_HISTORY` | No production table in this wave. | Zero-count no-op until a dashboard-history table contract exists. |
| `INGEST_CREDENTIAL_AUDIT` | `ingest_command` | `ingest_command.completedAt` |

`DASHBOARD_HISTORY` must return a successful zero-count batch while no
dashboard-history table exists. It must not delete current dashboard
definitions.

### Deletion Order

Hard delete must execute from dependent tables to parent tables:

- `TRACES`: select eligible `traceId` values from `trace` inside the selected
  project; delete `span` rows for those trace IDs; delete `log_event` rows for
  those trace IDs only when the log itself is also older than the cutoff; delete
  the selected `trace` rows last.
- `LOGS`: delete eligible `log_event` rows by project and timestamp.
- `METRICS`: delete eligible `metric_point` rows first; then delete
  `metric_ingest_cardinality` rows; then delete `metric_descriptor` rows whose
  `lastSeenAt` is older than the cutoff.
- `AI_EVALS`: delete child/detail rows before parent run or experiment rows:
  `ai_llm_call`, `ai_tool_call`, `ai_retrieval_event`,
  `ai_dataset_item_run`, `ai_eval_result`, `ai_annotation_queue_item`,
  `ai_prompt_version`, `ai_experiment_run`, `ai_experiment`, and
  `ai_agent_run`.
- `DATASETS`: delete `ai_dataset_item` rows before `ai_dataset` rows.
- `SCORERS`: delete `ai_scorer` rows.
- `INGEST_CREDENTIAL_AUDIT`: delete eligible `ingest_command` rows only; active
  ingest credential metadata stays in control-plane.

Every query must include `projectId = $projectId`. If `tenantId` or `companyId`
exists on a target table, the query must also constrain it from the resolved
project ownership context. The adapter must never derive project ownership from
frontend input.

### Soft Delete

Before production soft-delete execution is enabled, every table that can be
soft-deleted must declare these nullable fields in its SurrealDB schema:

- `deletedAt`;
- `deletedByRetentionPolicyId`;
- `finalDeleteAfter`.

Soft delete updates eligible rows with those fields and does not remove them.
Final deletion removes rows where `finalDeleteAfter <= requestedAt` before
marking new rows in the same batch. Storage-read normal GraphQL queries must add
`deletedAt = NONE` filters for every soft-delete-capable table before the
scheduler can be enabled in production.

If a table does not yet have those fields, the adapter must reject
`soft_delete_then_delete` for that data class with terminal `ERR-001` rather
than silently hard deleting.

### Batch Limits And Counts

`limit` applies to matched root records for the requested data class. Dependent
deletes required to keep referential consistency may exceed the root limit but
must remain inside the selected project partition. `matchedCount` reports root
records selected for action. Delete counts report affected rows in all tables.

`dryRun=true` must perform the same eligibility selection and count calculation
without mutating target tables, leases, or audit rows beyond the normal audit
record for the attempted dry run.

Adapter tests must run by default against isolated in-memory fixtures. Real
SurrealDB adapter tests are opt-in with:

```sh
CLOUDGRID_ENABLE_SURREALDB_RETENTION_TESTS=true
```

Opt-in SurrealDB tests must create an isolated database, seed at least one
eligible and one ineligible record for every executable data class, run one
batch per mode, and assert:

- no record outside the selected project is deleted or soft-deleted;
- dependency order leaves no orphaned child rows for hard deletes;
- soft-deleted rows are hidden by storage-read normal query builders;
- final delete removes only rows whose `finalDeleteAfter <= requestedAt`;
- dry runs return counts without mutating data;
- leases block concurrent acquisition and can be reacquired after expiry;
- audit rows are written once per attempted batch.

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
