---
title: "Retention Operations"
description: "Retention policy CRUD is implemented per project; deletion execution is owned by a separate storage-maintenance boundary."
order: 4
accent: amber
eyebrow: "Handbook - Operations"
updated: 2026-05-18
---

Retention is configured per project. Project retention policy CRUD is implemented through GraphQL, the BFF bridge, control-plane storage, and the project settings UI. Deletion execution is a separate storage-maintenance boundary, not frontend or BFF behavior.

## Current Product Behavior

Project admins can read and save the effective retention policy for a project. A policy has exactly one rule per data class, and updates replace the complete rule set using optimistic version checks.

Saved policies are durable configuration. The repository includes a storage-maintenance batch-executor module and service image/chart shape. Production deletion still requires wiring that executor to the intended storage adapter and scheduler for the deployed environment.

## Data Classes

| Data class | Default |
| --- | --- |
| `TRACES` | Delete after 30 days |
| `LOGS` | Delete after 30 days |
| `METRICS` | Delete after 30 days |
| `AI_EVALS` | Delete after 90 days |
| `DATASETS` | Retain |
| `SCORERS` | Retain |
| `DASHBOARD_HISTORY` | Retain |
| `INGEST_CREDENTIAL_AUDIT` | Delete after 365 days |

Dashboard definitions, current project configuration, users, companies, memberships, and active ingest credential metadata are not deleted by telemetry retention.

## Lifecycle

```mermaid
flowchart TD
  Admin["Project admin"] --> Save["Save full policy\nwith expectedVersion"]
  Save --> BFF["GraphQL BFF"]
  BFF --> Control["control-plane\nretention_policy record"]
  Control --> Visible["Policy visible in project settings"]
  Visible --> Worker{"storage-maintenance\nworker running?"}
  Worker -->|No| ConfigOnly["Configuration only\nno telemetry deletion"]
  Worker -->|Yes| Batch["Project-scoped batch\nby data class"]
  Batch --> Soft["Soft delete mode\nhide from normal reads"]
  Batch --> Hard["Hard delete mode\nremove eligible records"]
  Soft --> Final["Final delete after softDeleteDays"]
  Hard --> Counts["Batch counts and logs"]
  Final --> Counts
```

## Operator Checks

When deletion execution is present, operators should check:

- project ID and data class in maintenance logs;
- matched, hard-deleted, soft-deleted, and final-deleted counts;
- policy version used by the batch;
- terminal errors and retry behavior;
- confirmation that no deletion crosses tenant/company/project boundaries.

Do not invent a scheduler command or batch command name in runbooks until the executable or script exposes it. The retention spec defines the `storage_maintenance.retention.execute_batch` contract shape; the current service boundary keeps that behavior behind the storage-maintenance module.

## Safety Rules

- Retention deletion must be project-scoped.
- Soft-deleted records are hidden from normal GraphQL reads.
- `retain` means no automatic deletion for that data class.
- The BFF and frontend must not implement deletion loops.
- Storage-write remains the normal telemetry mutator; retention deletion is a maintenance mutation boundary.

## Next Step

Review the concept page: [Retention and alerts](/handbook/concepts/retention-alerts).
