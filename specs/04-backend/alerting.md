---
id: TEC-BE-021
title: Project alerting
layer: backend
status: draft
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-18
provenance: user-directed
depends_on: [TEC-BE-004, TEC-BE-008, TEC-BE-017, TEC-BE-009]
---

# Project Alerting

## Decision

CloudGrid alerting is project-scoped. The first alerting wave supports alert rules over metrics, logs, and traces. Alert rules are not company-global policies in v1.

## Rule Kinds

Supported v1 rule kinds:

- `METRIC_THRESHOLD`: metric threshold rule over `MetricSeriesInput`-compatible query semantics;
- `METRIC_ABSENCE`: metric absence rule over `MetricSeriesInput`-compatible query semantics;
- `LOG_MATCH`: log match rule over `LogSearchInput`-compatible filters;
- `LOG_COUNT`: log count rule over `LogSearchInput`-compatible filters;
- `TRACE_MATCH`: trace match rule over `TraceSearchInput`-compatible filters;
- `TRACE_COUNT`: trace count rule over `TraceSearchInput`-compatible filters;
- `TRACE_LATENCY`: trace latency rule over `TraceSearchInput`-compatible filters;
- `TRACE_ERROR`: trace error rule over `TraceSearchInput`-compatible filters.

Public contracts must use `AlertRuleKind` enum symbols exactly as listed above.

Rules must not query across projects. Rules must not use raw SQL, SurrealQL, arbitrary JavaScript, or dashboard widget JSON.

## Severity

Supported v1 alert severities are:

- `INFO`
- `WARNING`
- `ERROR`
- `CRITICAL`

Public contracts must use `AlertSeverity` enum symbols exactly as listed above. Severity is user-configured on an alert rule and copied to alert events. The evaluator must not infer a different severity from telemetry content.

## Evaluation Ownership

A dedicated alert evaluator service owns schedules, rule execution, state transitions, deduplication, and notification dispatch. The BFF and frontend never evaluate alert conditions.

Storage-read owns the underlying trace/log/metric query semantics used by alert evaluation. The evaluator calls storage-read through message bridge contracts and receives backend-derived counts/series/matches.

## Notification Adapters

Notification delivery is adapter-based. The core reference implementation is an in-app notification adapter that persists project alert events and alert history in the control-plane database.

Adapter contract:

- input: alert event, project context, rule metadata, severity, deduplication key, and rendered safe summary;
- output: delivery status `delivered`, `failed_retryable`, or `failed_terminal`;
- adapters must not receive SurrealDB credentials, raw telemetry payload bodies beyond the safe summary, bearer tokens, session cookies, or provider secrets;
- adapters must be replaceable without changing alert rule, alert history, GraphQL, or evaluator contracts.

Production alerting supports these notification adapters:

| Adapter ID | Purpose | Configuration owner | Secret handling |
| --- | --- | --- | --- |
| `in_app` | Persist alert events and history for CloudGrid UI. | control-plane alert history tables | No external secret. |
| `email` | Send alert summaries to configured recipients through the deployed SMTP runtime. | project alert rule `notificationAdapterIds` plus deployment SMTP env | Reuses the deployed SMTP secret env. Secrets never enter GraphQL. |
| `webhook` | POST a signed JSON alert summary to one configured HTTPS endpoint per adapter config. | deployment env/config map, referenced by adapter ID | `CLOUDGRID_ALERT_WEBHOOK_<ID>_SIGNING_SECRET` read only by alert-evaluator. |

Slack and Teams delivery are not product-scope adapter IDs in this repository.
They can be reached through the `webhook` adapter when an operator supplies a
compatible HTTPS endpoint.

Email adapter behavior:

- only sends the rendered safe summary, rule metadata, severity, project ID, and
  evidence links; it must not include raw telemetry bodies or provider tokens;
- uses SMTP configuration from the deployed invitation email runtime;
- returns `failed_retryable` for transient SMTP/network errors and
  `failed_terminal` for invalid recipient configuration.

Webhook adapter behavior:

- supports only `https://` URLs;
- sends `POST` with `Content-Type: application/json`;
- signs the canonical JSON body with HMAC-SHA256 using header
  `X-CloudGrid-Signature`;
- times out after `CLOUDGRID_ALERT_WEBHOOK_TIMEOUT_SECONDS`, default `10`, range
  `1..30`;
- treats HTTP `2xx` as `delivered`, `408/429/5xx` as `failed_retryable`, and
  all other statuses as `failed_terminal`;
- redacts the URL query string and signing secret from logs and errors.

## Alert State

Alert instances have states:

- `OK`
- `PENDING`
- `FIRING`
- `RESOLVED`
- `SILENCED`
- `ERROR`

Public contracts must use `AlertState` enum symbols exactly as listed above.

The evaluator stores state transitions and alert history. In-app history is queryable from project alerting views and from dashboard alert evidence widgets when those widgets are specified.

## Contract Shapes

`AlertRule` has `id`, `projectId`, `name`, `enabled`, `kind`, `severity`, `query`, `condition`, `evaluationWindowSeconds`, `pendingForSeconds`, `cooldownSeconds`, `notificationAdapterIds`, `createdAt`, `updatedAt`, `updatedByUserId`, and `version`.

`query` is a typed object chosen by `kind`:

- metric rules use a `MetricSeriesInput`-compatible object plus `metricName`;
- log rules use a `LogSearchInput`-compatible object;
- trace rules use a `TraceSearchInput`-compatible object.

`condition` is a typed object chosen by `kind`:

- threshold and latency rules use `operator` (`GT`, `GTE`, `LT`, `LTE`, `EQ`, `NEQ`) and numeric `threshold`;
- count rules use `operator` and integer `threshold`;
- absence rules use `maxAllowedCount` fixed to `0`;
- match and error rules use `minCount` integer from 1 to 100000.

`AlertEvent` has `id`, `projectId`, `ruleId`, `instanceId`, `state`, `severity`, `summary`, `deduplicationKey`, `startedAt`, `endedAt`, `createdAt`, and optional `evidenceTraceId`, `evidenceSpanId`, `evidenceLogId`, and `evidenceMetricName`.

`AlertSilence` has `id`, `projectId`, `ruleId`, `reason`, `startsAt`, `endsAt`, `createdAt`, `createdByUserId`, and `active`.

GraphQL contracts:

- `alertRules(projectId: ID!, input: AlertRuleSearchInput): [AlertRule!]!`
- `alertHistory(projectId: ID!, ruleId: ID, first: Int = 50, after: String): AlertEventConnection!`
- `alertSilences(projectId: ID!, ruleId: ID): [AlertSilence!]!`
- `createAlertRule(input: CreateAlertRuleInput!): AlertRule!`
- `updateAlertRule(input: UpdateAlertRuleInput!): AlertRule!`
- `deleteAlertRule(id: ID!): Boolean!`
- `createAlertSilence(input: CreateAlertSilenceInput!): AlertSilence!`
- `deleteAlertSilence(id: ID!): Boolean!`

`CreateAlertRuleInput` has `projectId`, `name`, `enabled`, `kind`, `severity`, `query`, `condition`, `evaluationWindowSeconds`, `pendingForSeconds`, `cooldownSeconds`, and `notificationAdapterIds`. `UpdateAlertRuleInput` has `id`, optional versions of the same editable fields, and `expectedVersion`. `query` and `condition` use the existing GraphQL `JSON` scalar in v1; validation of their kind-specific shape belongs to the control-plane.

`AlertRuleSearchInput` has optional `search`, `status`, `severity`, `signal`, `enabled`, and `sort`. `search` matches rule id, name, kind, or severity case-insensitively. `status` uses `AlertState` and filters by the latest persisted alert history state for the rule; rules without history do not match a status filter. `severity` uses `AlertSeverity`; `signal` uses `AlertSignal` values `METRIC`, `LOG`, and `TRACE`, derived from `AlertRuleKind`. `sort` uses `AlertRuleSort` over stable alert rule fields: updated time, created time, name, severity, kind, and enabled state, with rule id as the final tie-breaker. Alert rule list filtering and sorting are backend/contract-owned; clients must not locally sort or filter server-backed alert rule lists except for bounded already-loaded detail tables.

`CreateAlertSilenceInput` has `projectId`, `ruleId`, `reason`, `startsAt`, and `endsAt`.

Message bridge subjects:

- `control.alert_rules.list`
- `control.alert_rules.create`
- `control.alert_rules.update`
- `control.alert_rules.delete`
- `control.alert_silences.list`
- `control.alert_silences.create`
- `control.alert_silences.delete`
- `control.alert_history.list`
- `control.alert_history.record`
- `alert_evaluator.tick`
- `alert_evaluator.rules.evaluate`
- `alert_evaluator.notifications.dispatch`

## Authorization

Reading alert rules and history requires selected-project read access.

Creating, updating, deleting, silencing, or enabling alert rules requires project `admin` or company `admin`.

## Production Execution Packages

These packages are fully specified and can be implemented without adding product
behavior outside this spec.

### Project Enumeration For Schedulers

Control-plane exposes a private service subject:

```text
control.projects.list_for_service
```

Request fields:

- `serviceScope`: enum `alert_evaluator` or `storage_maintenance`;
- `status`: optional `ProjectStatus`, default `ACTIVE`;
- `cursor`: optional opaque cursor;
- `limit`: integer `1..500`, default `100`;
- `authContext`: service auth context with private service scope.

Response fields:

- `items`: ordered by `projectId`, each with `projectId`, `companyId`,
  `tenantId`, `status`, and `changedAt`;
- `nextCursor`: optional opaque cursor.

The alert evaluator uses this subject when
`CLOUDGRID_ALERT_EVALUATOR_PROJECT_DISCOVERY_ENABLED=true`. If discovery is
disabled, it uses `CLOUDGRID_ALERT_EVALUATOR_PROJECT_IDS`. Startup rejects
enabled scheduling when neither discovery nor explicit project IDs are
configured. Storage-maintenance may use the same subject after its retention
adapter is enabled.

### Notification Adapter Runtime

Alert-evaluator owns adapter dispatch. Adapter configuration is loaded at
startup from environment variables and is never read by the BFF or frontend.

Required env keys:

- `CLOUDGRID_ALERT_NOTIFICATION_ADAPTERS`: comma-separated adapter IDs from
  `in_app`, `email`, and configured webhook IDs;
- `CLOUDGRID_ALERT_WEBHOOK_<ID>_URL`;
- `CLOUDGRID_ALERT_WEBHOOK_<ID>_SIGNING_SECRET`;
- `CLOUDGRID_ALERT_WEBHOOK_TIMEOUT_SECONDS`, default `10`;
- SMTP variables already defined for deployed invitation email when `email` is
  enabled.

Control-plane validates `notificationAdapterIds` against the configured adapter
catalog exposed by alert-evaluator at startup. Unknown adapter IDs fail alert
rule create/update with `ERR-018`.

### Dashboard Alert Widgets

Dashboard alert widgets are first-class dashboard widgets, not alert rule
editors. They read existing alert history and never create, update, enable,
disable, or delete alert rules.

Widget kinds:

- `alert_status`: compact rule-state summary for selected severities and
  signals;
- `alert_history`: table/timeline of alert events using `alertHistory`;
- `alert_evidence`: selected alert event evidence card with links to trace,
  log, metric, and rule detail routes.

Widget data inputs:

- `projectId` comes from selected project context, not widget JSON;
- optional `ruleIds`, max `20`;
- optional `states`, values from `AlertState`;
- optional `severities`, values from `AlertSeverity`;
- optional `signals`, values from `AlertSignal`;
- `timeWindow`, same dashboard time-window model as metric widgets;
- `limit`, integer `1..100`, default `20`.

GraphQL uses existing alert contracts where possible. If a widget needs a
pre-aggregated status count, add `Query.alertSummary(projectId, input)` with
backend-owned counts grouped by state, severity, and signal. The frontend must
not compute counts from an incomplete history page.

## Implementation Status

Implemented:

- GraphQL alert rule, alert history, alert event, silence, and mutation contracts;
- control-plane message bridge subjects for rule CRUD, silence CRUD, history reads, and history record writes;
- SurrealDB schema for `alert_rule`, `alert_event`, and `alert_silence`;
- BFF bridge/resolver validation and project alert management UI;
- alert evaluator core package for all v1 rule kinds, kind-specific `query`/`condition` validation, storage-read port calls, project-scoped execution, pending/firing/resolved/silenced/error state transitions, cooldown deduplication, alert history recording, and notification dispatch status mapping;
- alert evaluator runtime handlers for `alert_evaluator.tick`, `alert_evaluator.rules.evaluate`, and `alert_evaluator.notifications.dispatch`;
- alert evaluator process wiring for NATS request/reply handlers and NATS-backed control-plane/storage-read ports used by explicit project/rule evaluation requests;
- service-scoped control-plane access for the private alert evaluator scope, constrained to the requested project;
- optional periodic scheduler loop driven by `CLOUDGRID_ALERT_EVALUATOR_PROJECT_IDS` and `CLOUDGRID_ALERT_EVALUATOR_INTERVAL_SECONDS`;
- service project discovery through `control.projects.list_for_service` when
  `CLOUDGRID_ALERT_EVALUATOR_PROJECT_DISCOVERY_ENABLED=true`;
- email and webhook notification adapters with deployment-time adapter catalog
  validation, SMTP recipient checks, HTTPS-only webhook URLs, HMAC-SHA256
  signing, timeout/status mapping, and redaction;
- typed dashboard alert widgets for `alert_status`, `alert_history`, and
  `alert_evidence`, backed by `Query.alertSummary(projectId,input)` and alert
  history reads;
- evaluator timeout and notification terminal-failure errors mapped to `ERR-021` and `ERR-020`;
- narrow Go tests for rule validation, project isolation at the evaluator port boundary, state transitions, retryable/terminal notification statuses, runtime subjects, NATS-backed port request shapes, service-scoped control-plane access, and evaluator timeout handling;
- alert evaluator binary health/readiness endpoint.

Production execution package status:

- implemented for repository-local contract, BFF/frontend, control-plane, and
  alert-evaluator boundaries;
- each deployment still has to provide its own SMTP/webhook environment values
  and choose the enabled adapter catalog.

Alerting-specific errors:

- `ERR-018 ALERT_RULE_INVALID`: invalid rule config or invalid kind-specific `query`/`condition`;
- `ERR-019 ALERT_QUERY_UNSUPPORTED`: rule query cannot be executed by storage-read contracts;
- `ERR-020 ALERT_NOTIFICATION_FAILED`: notification adapter returned terminal failure;
- `ERR-021 ALERT_EVALUATOR_TIMEOUT`: evaluator exceeded its configured execution deadline.

## Tests

Required tests:

- rule validation for all v1 kinds;
- project isolation for rule execution and history;
- evaluator state transitions for pending, firing, resolved, silenced, and error;
- in-app notification adapter delivery and retry/terminal failure behavior;
- project enumeration scheduler mode, including disabled fallback and startup
  rejection when no project source is configured;
- email adapter retry/terminal mapping with SMTP test double;
- webhook adapter signing, timeout, status mapping, and secret redaction;
- dashboard alert widgets render only backend alert view models and do not
  mutate alert rules.
