# Retention And Alerts

Retention and alerting are project-scoped administrative surfaces. Policy and rule management is implemented; deletion and alert execution are separate service responsibilities.

## Retention Policies

Each project has one effective retention policy with one rule per data class.

Data classes:

- `TRACES`
- `LOGS`
- `METRICS`
- `AI_EVALS`
- `DATASETS`
- `SCORERS`
- `DASHBOARD_HISTORY`
- `INGEST_CREDENTIAL_AUDIT`

Rule modes:

| Mode | Meaning |
| --- | --- |
| `retain` | Keep the data class until explicit deletion or a later saved policy changes it. |
| `delete` | Hard-delete eligible records after `retentionDays`. |
| `soft_delete_then_delete` | Hide eligible records first, then final-delete after `softDeleteDays`. |

Default policy:

| Data class | Default |
| --- | --- |
| `TRACES`, `LOGS`, `METRICS` | Delete after 30 days |
| `AI_EVALS` | Delete after 90 days |
| `DATASETS`, `SCORERS`, `DASHBOARD_HISTORY` | Retain |
| `INGEST_CREDENTIAL_AUDIT` | Delete after 365 days |

Control-plane owns retention policy records. A dedicated storage-maintenance boundary owns deletion execution. The BFF and frontend never delete telemetry for retention. The repository includes the storage-maintenance batch-executor module, but production deletion requires scheduler and storage-adapter wiring in the deployed environment.

## Alerting

Alerting is project-scoped. Supported rule kinds are metric, log, and trace rules:

- metric threshold and metric absence;
- log match and log count;
- trace match, trace count, trace latency, and trace error.

Supported severities:

- `INFO`
- `WARNING`
- `ERROR`
- `CRITICAL`

Supported alert states:

- `OK`
- `PENDING`
- `FIRING`
- `RESOLVED`
- `SILENCED`
- `ERROR`

## Execution Boundary

```mermaid
flowchart LR
  UI["Project settings / alerts UI"] --> BFF["GraphQL BFF"]
  BFF --> Control["control-plane\nrules, silences, history"]
  Evaluator["alert evaluator\nexecution service"] --> Read["storage-read\nquery semantics"]
  Evaluator --> Control
  Control --> History["in-app alert history"]
```

The alert evaluator owns schedules, rule execution, state transitions, deduplication, and notification dispatch. The repository includes evaluator domain logic and transport-neutral handlers, but production firing requires scheduler, storage-read/control-plane adapters, and configured notification dispatch. Dashboard widget thresholds are visual dashboard settings and do not execute alert rules.

Non-core adapters such as email, webhook, Slack, or Teams require their own provider config and secret-handling specs before implementation.

## Next Step

Operate saved policies with [Retention operations](../operations/retention.md) and alert management with [Alerting operations](../operations/alerting.md).
