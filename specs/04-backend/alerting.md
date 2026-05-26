---
id: TEC-BE-021
title: Project alerting
layer: backend
status: draft
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-26
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

## Core Alerting And Notification Boundary

CloudGrid core owns alert evaluation and alert management. It observes live and
persisted project telemetry through storage-read query contracts, evaluates rule
conditions, manages state transitions, applies silences and cooldowns, records
alert history, and prepares canonical notification requests. Delivery adapters
must not decide whether an alert is firing, resolved, silenced, or deduplicated.

Notification delivery is adapter-based. The core product includes in-app
delivery. Additional delivery adapters are installed capabilities that register
their safe metadata and configuration schema with CloudGrid. Company admins
create company-scoped adapter instances by providing the values required by that
schema. Alert rules reference those company adapter instance IDs.

Adapter contract:

- input: alert event, project context, rule metadata, severity, deduplication key, and rendered safe summary;
- output: delivery status `delivered`, `failed_retryable`, or `failed_terminal`;
- adapters must not receive SurrealDB credentials, raw telemetry payload bodies beyond the safe summary, bearer tokens, session cookies, or provider secrets unrelated to their own configured instance;
- adapters must be replaceable without changing alert rule, alert history, GraphQL, or evaluator contracts.

Production alerting supports these adapter categories:

| Adapter definition | Purpose | Configuration owner | Secret handling |
| --- | --- | --- | --- |
| `in_app` | Persist alert events and history for CloudGrid UI. | built-in, always company-available | No external secret. |
| `email` | Send alert summaries to configured recipients through an email adapter. | company alert adapter settings | SMTP/API credentials are secret fields. |
| `webhook` | POST a signed JSON alert summary to one HTTPS endpoint. | company alert adapter settings | Signing secret and auth headers are secret fields. |
| `slack`, `teams`, and other bridge adapters | Deliver safe summaries to provider channels. | company alert adapter settings | Provider tokens/webhook URLs are secret fields. |

Raw global technical env vars are allowed only for adapter runtime bootstrap
that is not customer/company-specific, such as worker concurrency, timeout
defaults, encryption key references, or enabling an installed adapter package.
Company-specific tokens, webhook URLs, channel IDs, email recipients, routing
preferences, and provider settings must be stored as company-scoped adapter
configuration, not as global env vars.

## Message Bridge Delivery Extension Path

Third-party alert delivery is an extension path over the private message bridge.
An alert delivery adapter may run as a separate private service that consumes
alert notification dispatch requests from message bridge queues and delivers
them to provider-specific systems such as Slack, Microsoft Teams, WhatsApp, SMS,
incident-management products, or customer-owned notification gateways.

Bridge-backed delivery adapters are delivery-only services:

- they consume canonical alert notification requests produced by alert-evaluator;
- they call provider APIs or customer gateways using adapter-owned credentials;
- they return delivery outcomes to alert-evaluator or control-plane through the
  alert notification result contract;
- they must not query telemetry, read SurrealDB directly, evaluate alert
  conditions, mutate alert rules, or create alert state transitions;
- they must preserve `projectId`, `ruleId`, `eventId`, `deduplicationKey`,
  `severity`, and delivery attempt metadata in every result;
- they must use bounded timeout, retry, and idempotency behavior so a slow
  provider cannot block alert evaluation or unboundedly grow memory.

The canonical request payload for bridge-backed delivery is the same safe
adapter input defined above: alert event, project context, rule metadata,
severity, deduplication key, and rendered safe summary. It must not contain raw
telemetry payload bodies, SurrealDB credentials, browser/session tokens, bearer
tokens, provider secrets, or unbounded attribute maps.

Provider credentials belong to the company-scoped adapter instance. Credentials
may be submitted through BFF GraphQL mutations only as write-only secret fields.
They must be encrypted by control-plane secret storage and passed to the
delivery adapter only at dispatch time for the configured company instance.
Credentials must never appear in BFF responses, alert rule JSON, dashboard
widget configuration, alert history records, logs, or generated assets.

Delivery result handling remains core-owned. Alert-evaluator maps adapter
results to `delivered`, `failed_retryable`, or `failed_terminal`, records the
attempt in alert history, and applies retry/cooldown behavior. A bridge-backed
adapter may add provider-specific diagnostic text only when it is bounded and
secret-redacted.

This extension path is intentionally language-neutral. Adapters can be written
in Go, TypeScript, another programming language, or by a third-party system as
long as they implement the message bridge request/result contract, preserve the
required identifiers, and obey the safety restrictions in this spec.

The v1 bridge contract is `alert_evaluator.notifications.dispatch`. Built-in
delivery runs behind the same dispatcher interface. External adapter workers may
bind queue subscribers to that dispatch subject so provider adapters scale
independently from rule evaluation. Durable dispatch queues must use
at-least-once delivery plus the alert event ID, adapter instance ID, and
deduplication key as the idempotency inputs.

Email adapter behavior:

- only sends the rendered safe summary, rule metadata, severity, project ID, and
  evidence links; it must not include raw telemetry bodies or provider tokens;
- uses the company adapter instance configuration declared by the email adapter
  definition, including recipients, sender/provider metadata, and write-only
  SMTP or email API secrets;
- returns `failed_retryable` for transient SMTP/network errors and
  `failed_terminal` for invalid recipient configuration.

Webhook adapter behavior:

- supports only `https://` URLs;
- sends `POST` with `Content-Type: application/json`;
- signs the canonical JSON body with HMAC-SHA256 using header
  `X-CloudGrid-Signature`;
- times out after `CLOUDGRID_ALERT_WEBHOOK_TIMEOUT_SECONDS`, default `10`, range
  `1..30`; this is a global technical timeout only, not the company webhook
  URL or secret;
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

`AlertNotificationAdapterDefinition` describes an installed adapter capability
and its configuration schema. `CompanyAlertNotificationAdapter` stores one
company-scoped configured instance of a definition.

GraphQL contracts:

- `alertRules(projectId: ID!, input: AlertRuleSearchInput): [AlertRule!]!`
- `alertHistory(projectId: ID!, ruleId: ID, first: Int = 50, after: String): AlertEventConnection!`
- `alertSilences(projectId: ID!, ruleId: ID): [AlertSilence!]!`
- `alertNotificationAdapters(projectId: ID!): [AlertNotificationAdapter!]!`
- `alertNotificationAdapterDefinitions: [AlertNotificationAdapterDefinition!]!`
- `companyAlertNotificationAdapters(companyId: ID!): [CompanyAlertNotificationAdapter!]!`
- `createAlertRule(input: CreateAlertRuleInput!): AlertRule!`
- `updateAlertRule(input: UpdateAlertRuleInput!): AlertRule!`
- `deleteAlertRule(id: ID!): Boolean!`
- `upsertCompanyAlertNotificationAdapter(input: UpsertCompanyAlertNotificationAdapterInput!): CompanyAlertNotificationAdapter!`
- `deleteCompanyAlertNotificationAdapter(id: ID!, expectedVersion: Int!): Boolean!`
- `testCompanyAlertNotificationAdapter(id: ID!): AlertNotificationAdapterTestResult!`
- `createAlertSilence(input: CreateAlertSilenceInput!): AlertSilence!`
- `deleteAlertSilence(id: ID!): Boolean!`

`CreateAlertRuleInput` has `projectId`, `name`, `enabled`, `kind`, `severity`, `query`, `condition`, `evaluationWindowSeconds`, `pendingForSeconds`, `cooldownSeconds`, and `notificationAdapterIds`. `UpdateAlertRuleInput` has `id`, optional versions of the same editable fields, and `expectedVersion`. `query` and `condition` use the existing GraphQL `JSON` scalar in v1; validation of their kind-specific shape belongs to the control-plane.

`AlertRuleSearchInput` has optional `search`, `status`, `severity`, `signal`, `enabled`, and `sort`. `search` matches rule id, name, kind, or severity case-insensitively. `status` uses `AlertState` and filters by the latest persisted alert history state for the rule; rules without history do not match a status filter. `severity` uses `AlertSeverity`; `signal` uses `AlertSignal` values `METRIC`, `LOG`, and `TRACE`, derived from `AlertRuleKind`. `sort` uses `AlertRuleSort` over stable alert rule fields: updated time, created time, name, severity, kind, and enabled state, with rule id as the final tie-breaker. Alert rule list filtering and sorting are backend/contract-owned; clients must not locally sort or filter server-backed alert rule lists except for bounded already-loaded detail tables.

`CreateAlertSilenceInput` has `projectId`, `ruleId`, `reason`, `startsAt`, and `endsAt`.

`AlertNotificationAdapter` is the project-effective safe adapter list. It has
`id`, `definitionId`, `label`, `kind`, `configured`, `enabled`, `description`,
and optional `disabledReason`. `kind` uses `AlertNotificationAdapterKind` enum
values `IN_APP`, `EMAIL`, `WEBHOOK`, and `BRIDGE`. `BRIDGE` covers queue-backed
adapters such as Slack, Microsoft Teams, SMS, WhatsApp, incident-management
systems, or customer notification gateways.

`UpsertCompanyAlertNotificationAdapterInput` has optional `id`, `companyId`,
`definitionId`, `label`, `enabled`, `config`, `secretConfig`,
`clearSecretKeys`, and `expectedVersion` for updates. `secretConfig` is
write-only and must not be returned by any query.

Message bridge subjects:

- `control.alert_rules.list`
- `control.alert_rules.create`
- `control.alert_rules.update`
- `control.alert_rules.delete`
- `control.alert_silences.list`
- `control.alert_silences.create`
- `control.alert_silences.delete`
- `control.alert_history.list`
- `control.alert_notification_adapters.list`
- `control.alert_notification_adapter_definitions.list`
- `control.company_alert_notification_adapters.list`
- `control.company_alert_notification_adapters.upsert`
- `control.company_alert_notification_adapters.delete`
- `control.company_alert_notification_adapters.test`
- `control.alert_history.record`
- `alert_evaluator.tick`
- `alert_evaluator.rules.evaluate`
- `alert_evaluator.notifications.dispatch`

## Authorization

Reading alert rules, effective project adapters, and history requires
selected-project read access.

Creating, updating, deleting, silencing, or enabling alert rules requires project `admin` or company `admin`.

Reading company adapter definitions and company adapter instances requires
company admin access. Creating, updating, testing, or deleting company adapter
instances requires company admin access. Project admins can select enabled
company adapter instances for their project alert rules but cannot read or edit
company secret configuration unless they are also company admins.

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

### Notification Adapter Registry And Company Settings

Alert-evaluator owns adapter dispatch. Control-plane owns company-scoped
adapter instance metadata and encrypted secret storage. The BFF exposes safe
metadata and write-only configuration mutations.

Installed adapters register an `AlertNotificationAdapterDefinition`:

- `definitionId`: stable adapter definition ID such as `in_app`, `email`,
  `webhook`, `slack`, or `teams`;
- `kind`: `IN_APP`, `EMAIL`, `WEBHOOK`, or `BRIDGE`;
- `label` and `description`;
- `configFields`: ordered field schema;
- optional `supportsTest`;
- optional `defaultEnabled`.

Each `configFields` item has:

- `key`: stable field key;
- `label`;
- `description`;
- `type`: `STRING`, `URL`, `EMAIL`, `SECRET`, `BOOLEAN`, `NUMBER`, `SELECT`, or
  `MULTISELECT`;
- `required`: boolean;
- `secret`: boolean;
- optional `placeholder`;
- optional `options` for select fields;
- optional `validationPattern` for non-secret strings.

Company admins create `CompanyAlertNotificationAdapter` instances from a
definition. Instances are company-scoped and are available to alert rules in
projects owned by that company when enabled.

Instance fields:

- `id`: stable company adapter instance ID referenced by alert rules;
- `companyId`;
- `definitionId`;
- `label`;
- `enabled`;
- `configured`;
- `config`: non-secret config values only;
- `secretStatuses`: per-secret field status `SET` or `MISSING`;
- `createdAt`, `updatedAt`, `updatedByUserId`, and `version`.

Secret handling:

- secret values are accepted only in create/update mutations;
- omitted secret fields keep existing values during update;
- explicit secret clearing requires `clearSecretKeys`;
- query responses return only `secretStatuses`;
- secrets are encrypted in control-plane secret storage and resolved only for
  alert delivery execution;
- logs and errors must never include secret values.

Control-plane validates `notificationAdapterIds` against enabled company
adapter instances for the rule's project company. Unknown, disabled, or
cross-company adapter IDs fail alert rule create/update with `ERR-018`.

Frontend-visible project adapter list:

- `alertNotificationAdapters(projectId)` returns effective adapter instances
  available to that project;
- the list includes built-in `in_app` and enabled company instances;
- responses include safe metadata only: instance ID, definition ID, display
  label, kind, configured/enabled state, short description, and optional
  disabled reason;
- responses must not include secret values, provider tokens, endpoint auth
  headers, or raw adapter runtime configuration.

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
- alert notification adapter definition and company instance contracts are
  specified; implementation must add control-plane persistence, encrypted
  company secret storage, GraphQL mutations, and evaluator resolution before
  non-`in_app` adapters are user-configurable;
- email and webhook notification adapter behavior is specified around
  company-scoped instance configuration, SMTP/API recipient checks, HTTPS-only
  webhook URLs, HMAC-SHA256 signing, timeout/status mapping, and redaction;
- typed dashboard alert widgets for `alert_status`, `alert_history`, and
  `alert_evidence`, backed by `Query.alertSummary(projectId,input)` and alert
  history reads;
- evaluator timeout and notification terminal-failure errors mapped to `ERR-021` and `ERR-020`;
- narrow Go tests for rule validation, project isolation at the evaluator port boundary, state transitions, retryable/terminal notification statuses, runtime subjects, NATS-backed port request shapes, service-scoped control-plane access, and evaluator timeout handling;
- alert evaluator binary health/readiness endpoint.

Production execution package status:

- implemented for repository-local alert rule, history, silence,
  BFF/frontend, control-plane, and alert-evaluator boundaries;
- adapter definition registration and project-effective safe adapter listing
  may exist as a thin catalog, but company-scoped adapter instance
  configuration, encrypted secret persistence, and non-`in_app` delivery are
  not complete until the subjects and GraphQL mutations named in this spec are
  implemented and covered by `contracts:check`;
- deployments may configure raw global technical adapter runtime settings such
  as worker concurrency, installed adapter package allowlists, timeout defaults,
  and encryption key references; customer/company delivery settings must not be
  supplied as global SMTP/webhook/Slack/Teams env vars.

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
- adapter definition registry validation, including required fields, secret
  field declarations, and unsupported field type rejection;
- company adapter instance create/update/delete/test authorization, validation,
  version conflicts, secret set/missing status, secret clearing, and
  cross-company isolation;
- alert rule create/update rejects unknown, disabled, unconfigured, or
  cross-company notification adapter IDs;
- email adapter retry/terminal mapping with a fake company adapter instance and
  SMTP/API test double;
- webhook adapter signing, timeout, status mapping, HTTPS enforcement, and
  secret redaction using company-scoped config;
- dashboard alert widgets render only backend alert view models and do not
  mutate alert rules.
