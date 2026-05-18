---
title: "Alerting Operations"
description: "Alert rule, silence, and history CRUD is implemented per project; rule execution belongs to a separate alert evaluator."
order: 5
accent: amber
eyebrow: "Handbook - Operations"
updated: 2026-05-18
---

CloudGrid alerting is project-scoped. Alert rule, silence, and history CRUD is implemented through GraphQL, the BFF bridge, control-plane storage, and the alert management UI. Rule execution belongs to a dedicated alert evaluator.

## Current Product Status

CloudGrid exposes alert management surfaces:

- alert rule configuration;
- alert silences;
- in-app alert history;
- typed rule shapes over metrics, logs, and traces.

The alert evaluator is the component that executes rules, transitions states, and dispatches notifications. The repository includes evaluator domain logic, transport-neutral handlers, and service image/chart shape. Production completion packages are project discovery, email/webhook notification adapters, and dashboard alert widgets.

## Rule Kinds

| Signal | Kinds |
| --- | --- |
| Metrics | `METRIC_THRESHOLD`, `METRIC_ABSENCE` |
| Logs | `LOG_MATCH`, `LOG_COUNT` |
| Traces | `TRACE_MATCH`, `TRACE_COUNT`, `TRACE_LATENCY`, `TRACE_ERROR` |

## Evaluation Lifecycle

```mermaid
flowchart TD
  Rule["Alert rule\ncontrol-plane"] --> Tick["Evaluator tick"]
  Tick --> Query["storage-read query\nproject scoped"]
  Query --> Condition{"Condition met?"}
  Condition -->|No| OK["State OK or RESOLVED"]
  Condition -->|Yes| Pending["State PENDING\npendingForSeconds"]
  Pending --> Firing["State FIRING"]
  Firing --> Silence{"Matching silence?"}
  Silence -->|Yes| Silenced["State SILENCED"]
  Silence -->|No| Notify["Dispatch notification adapter"]
  Notify --> History["Persist alert history"]
  Query --> Error["State ERROR\non unsupported query or timeout"]
```

## Notification Adapters

The core reference adapter is in-app alert history. The production adapter package adds email and webhook delivery using the configuration and secret-handling rules in the alerting spec. Slack and Teams delivery use webhook endpoints when operators provide compatible HTTPS receivers.

Do not add notification provider secrets to dashboard widgets, frontend state, BFF responses, or alert summaries.

## Operator Checks

When the evaluator is present, check:

- evaluator schedule/tick logs;
- rule execution duration and errors;
- storage-read query failures;
- notification delivery status;
- alert history persistence;
- silence matching.

Do not document email or webhook alert notifications as available until their adapters exist. Invitation email SMTP is a separate onboarding path; alert email may reuse the deployed SMTP runtime only after the alert email adapter is implemented.

## Dashboard Thresholds

Dashboard widget thresholds are visual dashboard settings. They do not create alert rules and do not execute alert logic.

## Next Step

For alert concepts, read [Retention and alerts](/handbook/concepts/retention-alerts).
