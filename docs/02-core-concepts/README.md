# Core Concepts

CloudGrid has a small set of concepts. Understanding them makes the UI, API, and service split easier to reason about.

## Company

A company is the top-level account boundary.

- Local mode always uses one local company.
- Deployed mode supports multiple companies.
- The first user in a company becomes `admin`.
- A company must always keep at least one `admin`.

## User And Role

CloudGrid has company roles and project roles.

| Role | Can view projects | Can manage users | Can manage projects |
| --- | --- | --- | --- |
| `admin` | Yes | Yes | Yes |
| `user` | Yes | No | No |

Company admins can manage all projects in the company. Project-specific membership controls project access for non-admin users. Project roles are `viewer`, `editor`, and `admin`; local mode treats the Personal user as project admin for every local project.

## Project

A project scopes telemetry, dashboards, and live trace subscriptions. Trace, log, metric, dashboard, and live trace views require a selected project. The frontend must not search other projects for correlated trace, span, log, metric, or exemplar data.

Project status affects ingest:

| Status | Reads | Ingest |
| --- | --- | --- |
| `active` | Allowed | Allowed |
| `read_only` | Allowed | Denied |
| `disabled` | Denied | Denied |

The collector uses a project status cache so normal ingest does not call the control plane or database on every request.

## Trace, Span, And Log

- A trace is one end-to-end execution.
- A span is one operation inside a trace.
- A span event captures structured events inside a span, including exception events.
- A log is an OTLP log record that may correlate to a trace or span.

CloudGrid keeps OpenTelemetry IDs stable:

- `trace.id` is the OpenTelemetry trace ID.
- `span.id` is the OpenTelemetry span ID.
- generated log IDs are deterministic when the sender does not provide a stable ID.

Log search is a first-class workspace at `/logs`. It searches project logs, opens a selected-log inspector for body, attributes, and correlation, and links to `/traces/:traceId` or `/traces/:traceId?spanId=:spanId` only when the selected log has same-project trace/span correlation.

Trace detail can link back to logs by opening `/logs` with trace or span filters. These pivots preserve project scope.

## Metrics And Dashboards

Metrics are OpenTelemetry metric points scoped to one project through the same trusted ingest authorization path as traces and logs.

`/metrics` is the metric explorer. Use it to find metric names, inspect descriptors, query series, test aggregations, group by descriptor attribute keys, inspect exemplars, and open exemplar trace/span links.

`/dashboards` is the saved visual composition workspace. Dashboards are project-scoped control-plane configuration made from typed `DashboardWidget` entries:

- metric time series, stat, and table widgets backed by `Query.metricSeries`;
- log table widgets backed by `Query.logs`;
- trace table widgets backed by `Query.traces`;
- live trace table widgets backed by `Subscription.liveTraces`.

Dashboards are stored as `Dashboard` and `DashboardWidget` contracts. CloudGrid does not support `MetricView`, `MetricViewPanel`, `metricViews`, `saveMetricView`, or `deleteMetricView` compatibility surfaces.

Dashboard pins are user preferences. The project sidebar may show up to five pinned dashboards and a collapsible dashboard list only when those values come from dashboard contracts and pin mutations.

For the full dashboard builder workflow, rich metric query model, widget layout controls, and computation ownership rules, see [Metrics And Dashboards](./metrics-and-dashboards.md).

## Ingest Credentials

Projects can have multiple ingest credentials for different emitters or environments. In user-facing setup copy these may be described as ingest API keys, but the runtime boundary still uses standard OTLP authorization metadata:

- deployed machine ingest uses `Authorization: Bearer <jwt>` with project claims and ingest scopes;
- local multi-project ingest uses `Authorization: Bearer <local-project-token>` where each configured opaque token maps to exactly one local project.

Credential metadata belongs to control-plane. Secret values are never stored in plaintext, copied into telemetry attributes, embedded in dashboards, or returned through frontend view models.

## Live Trace Receiving

Live trace receiving is a mode inside `/traces`, not its own primary route. The live mode is trace-level, not span-level. The frontend opens a GraphQL subscription. The BFF asks storage-read to start a private live session. Storage-read receives post-persist trace notifications, applies filter and authorization context, loads trace summaries, and sends events back through the BFF.

Changing server-side filters restarts only the GraphQL subscription operation. Presentation filters can update locally without breaking the WebSocket connection.

## Local Mode Versus Deployed Mode

Local mode:

- `CLOUDGRID_DEPLOYMENT_MODE=local`
- `CLOUDGRID_AUTH_MODE=local`
- no login page
- one local company
- multiple projects

Deployed mode:

- `CLOUDGRID_DEPLOYMENT_MODE=deployed`
- `CLOUDGRID_AUTH_MODE=sso`
- SSO providers are configured with `CLOUDGRID_AUTH_PROVIDERS=github,google,azure` or any subset
- `/login` shows one button for each configured provider: GitHub, Google, and Microsoft Azure
- BFF owns login, callback, logout, and session cookies
- frontend does not store provider tokens
- BFF normalizes provider identity into CloudGrid user id, display name, and email
- `CLOUDGRID_AUTH_COMPANY_ID` selects the deployed company boundary; the first SSO user in an empty company becomes admin, and later access is controlled by company and project memberships
- after the first admin exists, SSO company membership is invite-only; a pending email invitation becomes an active `user` membership only when the invited person signs in with a matching verified provider email
- invited users can be promoted to company `admin` only after sign-in, because pending invitations are not active members
- upstream SSO provider deprovisioning is not automatic in the default policy; explicit provider-directory sync is a future mode

## Retention Policies

Project admins can configure project-level retention policies in Project Settings. A policy has one rule for each data class:

- traces;
- logs;
- metrics;
- AI eval records;
- datasets;
- scorers;
- dashboard history;
- ingest credential audit records.

Each rule can retain data, hard-delete after a configured number of days, or soft-delete first and final-delete later. The control-plane stores and validates the policy. Actual deletion is performed only when the storage-maintenance worker is running.

## Alerting

Project-scoped alerting supports rule configuration over metrics, logs, and traces. The current product exposes alert rules, silences, and in-app alert history through `/alerts`. Notification delivery is adapter-based, with the in-app history adapter as the core reference implementation.

The alert evaluator is the component that executes rules, transitions states, and dispatches notifications. Dashboard widget thresholds are visual dashboard settings and are not alert rules.

## OTLP Protocol Support

CloudGrid accepts traces, logs, and metrics through:

- OTLP/HTTP JSON and protobuf on `4318`;
- OTLP/gRPC protobuf on `4317`.

Both protocols use the same project authorization path. Project IDs in OTLP resource, span, log, or metric attributes are ignored for routing.

Next: [Operations](../03-operations/README.md) covers configuration and running the stack reliably.
