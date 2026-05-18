---
id: TEC-BE-020
title: Project data retention policy
layer: backend
status: draft
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-15
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

## Implementation Status

Implemented:

- GraphQL `RetentionPolicy`, `RetentionRule`, `retentionPolicy(projectId)`, and `updateRetentionPolicy` contracts;
- control-plane message bridge subjects for get/update policy;
- SurrealDB schema and control-plane storage for `retention_policy`;
- BFF bridge/resolver validation and project settings UI for policy read/update;
- `storage-maintenance` service shell with health/readiness logging;
- direct retention batch executor for the `storage_maintenance.retention.execute_batch` request/response contract;
- in-memory isolated retention fixtures for every `RetentionDataClass`;
- executor validation for request fields, delete/soft-delete policy range rules, mode-specific `softDeleteDays`, and missing policies;
- executor retain/no-op handling;
- fixture-backed hard delete, soft delete, final delete, dry-run, limit, project isolation, and normal-read soft-delete hiding behavior;
- structured retention batch logs with project, data class, policy version, dry-run, matched count, hard-deleted count, soft-deleted count, final-deleted count, duration, and terminal error fields;
- focused Go tests for executor behavior, policy validation, every data-class fixture, structured logs, and fixture deletion semantics.

Remaining before retention deletes telemetry:

- maintenance audit records;
- NATS request/reply wiring for the `storage_maintenance.retention.execute_batch` subject;
- production SurrealDB storage adapter for project-scoped hard delete, soft delete, and final delete execution;
- production scheduler behavior, because this spec currently defines direct batch execution but does not define scheduling cadence, ownership, lease/lock behavior, or retry policy;
- integration tests against the production storage adapter once that adapter is specified and implemented;
- docs that clearly separate configured policy from executed deletion.

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
