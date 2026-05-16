---
id: TEC-BE-021
title: Project alerting
layer: backend
status: draft
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-16
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

Non-core adapters such as email, webhook, Slack, or Teams require their own provider config and secret-handling specs before implementation.

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

## Required Contracts Before Implementation

Implementation requires:

- GraphQL alert rule, alert history, alert event, silence, and mutation contracts;
- control-plane message bridge subjects for rule CRUD, silence CRUD, and history reads;
- evaluator message bridge subjects for schedule ticks, rule execution, and notification dispatch;
- SurrealDB schema for `alert_rule`, `alert_instance`, `alert_event`, `alert_silence`, and `notification_delivery`;
- error mappings for invalid rule config, unsupported query, notification adapter failure, and evaluator timeout;
- frontend UX spec for project alerting list, rule editor, history, and trace/log/metric pivots.

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
- no alerting behavior in dashboards until dashboard alert widgets are explicitly specified.
