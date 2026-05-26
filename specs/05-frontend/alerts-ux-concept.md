---
id: TEC-FE-015
title: Alerts UX concept
layer: frontend
status: draft
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-26
provenance: user-directed
depends_on: [TEC-BE-021]
---

# Alerts UX Concept

## Scope

Alerts are project-scoped operational configuration. CloudGrid core owns alert
rules, evaluation, state, history, silences, cooldowns, and canonical
notification dispatch. Delivery to Slack, Teams, email, webhooks, or other
channels is performed by notification adapters behind
`alert_evaluator.notifications.dispatch`.

The frontend manages alert rules, silences, and company-scoped notification
adapter instances through GraphQL only. It must not evaluate alert conditions,
subscribe to private alert queues, call provider APIs, or expose raw adapter
secrets.

## Route Inventory

- `/alerts`: project alert workspace with rule list, filters, selected-rule
  inspector, history, silences, and evidence pivots.
- `/alerts/new`: alert rule creation page.
- `/alerts/:ruleId/settings`: alert rule settings page.
- `/organizations/:organizationId/alert-adapters`: company alert notification
  adapter settings page for company admins.

`/alerts` remains available by URL, command palette, alert evidence links, and
explicit alert-management entry points. It is not a primary project sidebar
item.

## `/alerts`

The route uses the standard project workspace frame: breadcrumb/back row, route
header, and one primary working surface.

Header actions:

- `Create alert rule` navigates to `/alerts/new` when the viewer can administer
  project alerts.
- Refresh is icon-only and refetches alert rules.
- No other header actions are visible.

Content:

- left panel: alert rule table and filters;
- right panel: selected-rule inspector on desktop;
- mobile: inspector opens as the standard detail drawer after selecting a row.

Table columns:

- status;
- severity;
- rule name;
- kind;
- signal;
- evaluation window;
- last event;
- enabled.

Rules:

- status uses plain text for `OK`; `FIRING` and `ERROR` may use destructive
  semantic text;
- severity is text-only except `CRITICAL` may use destructive semantic text;
- enabled is a switch only for project or company admins;
- row click selects the rule and updates `ruleId` in URL state;
- backend-owned sorting and filtering must use `AlertRuleSearchInput`.

URL state:

- `ruleId`;
- `tab` for inspector tab: `overview`, `history`, or `silences`;
- `search`, `status`, `severity`, `signal`, `enabled`, and `sort`;
- alert history cursor when pagination is exposed by the route.

## Create Alert Rule

Route: `/alerts/new`.

Creation is a durable entity create page. It must not open a drawer, sheet,
dialog, popover, or inline expansion.

Tabs:

1. `Basics`
2. `Signal`
3. `Condition`
4. `Timing`
5. `Notifications`

Header actions:

- `Cancel` navigates back to `/alerts`;
- `Back` moves to the previous tab and is disabled on `Basics`;
- `Continue` validates the current tab and moves forward;
- `Create alert rule` appears on `Notifications` and submits the GraphQL
  mutation.

Required fields:

- `Basics`: name, enabled, kind, severity;
- `Signal`: the query fields required by the selected `AlertRuleKind`;
- `Condition`: the condition fields required by the selected `AlertRuleKind`;
- `Timing`: evaluation window seconds, pending-for seconds, cooldown seconds;
- `Notifications`: at least one enabled adapter ID.

Field help must be end-user focused and adjacent to the field. It must explain
the operational effect, not backend implementation details.

The page validates field-level and tab-level input before forward navigation.
Submission failures render an inline error panel above the active tab. Backend
problem codes are shown in bounded form; raw provider, adapter, or telemetry
payload details are not shown.

## Alert Rule Settings

Route: `/alerts/:ruleId/settings`.

Settings use the same tab order as creation:

1. `Basics`
2. `Signal`
3. `Condition`
4. `Timing`
5. `Notifications`
6. `Lifecycle`

The route loads the persisted `AlertRule` and saves through
`Mutation.updateAlertRule` with `expectedVersion`.

Settings-only fields:

- `Lifecycle`: delete rule action and future lifecycle controls when contracts
  define them.

Destructive delete uses a confirmation dialog and calls
`Mutation.deleteAlertRule`. It is not a regular tab save action.

Existing alert history is not duplicated in settings. It stays in the
`/alerts` inspector.

## Signals And Conditions

Rule kind determines the editable signal and condition fields.

Metric rules:

- `METRIC_THRESHOLD`: metric series query plus operator and numeric threshold;
- `METRIC_ABSENCE`: metric series query plus absence semantics from the backend
  alerting spec.

Log rules:

- `LOG_MATCH`: log filters plus minimum match count;
- `LOG_COUNT`: log filters plus operator and integer threshold.

Trace rules:

- `TRACE_MATCH`: trace filters plus minimum match count;
- `TRACE_COUNT`: trace filters plus operator and integer threshold;
- `TRACE_LATENCY`: trace filters plus operator and latency threshold;
- `TRACE_ERROR`: trace filters plus minimum error count.

The frontend may provide structured controls for common trace, log, and metric
filters. It must serialize only the contract fields accepted by
`CreateAlertRuleInput.query` and `CreateAlertRuleInput.condition`. It must not
store raw SQL, SurrealQL, JavaScript, dashboard widget JSON, provider-specific
payloads, or executable expressions.

Changing `kind` resets signal and condition drafts. If the user has edited
either draft, show a confirmation dialog before resetting.

## Notifications

Notification delivery is adapter-based and core-owned. Alert rules select
company adapter instance IDs. Company admins configure those instances under
company settings.

Visible adapters on alert rule pages come from the project-effective
`alertNotificationAdapters(projectId)` contract. The list exposes only safe
metadata:

- company adapter instance ID;
- adapter definition ID;
- display label;
- kind: `in_app`, `email`, `webhook`, or `bridge`;
- configured/enabled status;
- short user-facing description;
- optional disabled reason.

The project-effective list must not expose secrets, endpoint query strings,
bearer tokens, SMTP credentials, webhook signing secrets, Slack tokens, Teams
tokens, or provider-specific raw configuration.

Until company adapter instance contracts are implemented, the UI must show only
`in_app` as a checked, read-only adapter and submit
`notificationAdapterIds: ["in_app"]`. It must not hard-code Slack, Teams,
email, webhook, SMS, or incident-management choices.

When company adapter settings are implemented:

- users can select one or more enabled adapters;
- disabled adapters are visible only when they help explain why delivery is not
  available;
- adapter-specific configuration links navigate to
  `/organizations/:organizationId/alert-adapters`;
- the alert rule page must not collect adapter secrets;
- bridge adapters such as Slack or Teams are represented by their configured
  company adapter instance ID and label, not by frontend-owned integration
  logic.

## Company Adapter Settings

Route: `/organizations/:organizationId/alert-adapters`.

This is a company admin settings page, not a project telemetry page. It lists
installed adapter definitions and configured company adapter instances.

Adapter definitions come from `alertNotificationAdapterDefinitions`. Each
definition supplies field schema, required flags, help text, validation hints,
and secret markers. The UI renders the fields from the schema without
inventing provider-specific form fields.

Creating or editing an instance uses a route/settings form with these groups:

1. `Identity`: display label, enabled state, adapter definition.
2. `Configuration`: non-secret fields from the adapter definition.
3. `Secrets`: secret fields from the adapter definition.
4. `Test`: optional test action when the adapter definition supports tests.

The form follows the durable entity settings pattern: header actions at the top,
wizard-like tabs, required field markers, field-level errors, tab-level error
badges, focused end-user help text, and no footer action bar.

Secret field rules:

- existing secret values are never shown;
- secret fields show `Set` or `Missing`;
- leaving an existing secret field blank keeps the stored value;
- clearing a secret requires an explicit clear action;
- saved secrets are sent only through `secretConfig` mutation input;
- secret values must not appear in validation summaries, toast messages, logs,
  URLs, copied text, screenshots, or generated assets.

Instances are company-scoped. They are available to all projects in that company
when enabled. Project-specific adapter allowlists are out of scope until a
future spec defines them.

The frontend must send non-secret values in `config` and secret values in
`secretConfig`. It must never merge secret values into draft JSON that can be
shown, copied, logged, persisted in URL state, or rendered in a review summary.

## Silences

Silences are contextual child records of an alert rule, not durable top-level
entities. Creating a silence may use a focused dialog from the selected-rule
inspector.

Required fields:

- reason;
- start time;
- end time.

Deleting an active or scheduled silence uses a destructive confirmation dialog.
Expired silences are read-only history.

## Multitenancy And Authorization

All alert routes require a selected project. Every GraphQL operation includes
the selected project ID or an alert rule ID that resolves to the selected
project server-side.

Frontend rules:

- never infer authorization from route params alone;
- show create, update, enable, delete, and silence actions only to project or
  company admins;
- keep read-only list, history, and evidence views available to users with
  selected-project read access;
- after project switch, clear alert filters, selected rule, drafts, and
  inspector state;
- never show alert data from a previous selected project while new project data
  is loading.

Backend rules remain authoritative. The UI must handle authorization failures
with the standard problem panel.

## Empty, Error, And Loading States

- No rules: `No alert rules yet` with `Create alert rule` only for admins.
- No filter matches: `No alert rules match these filters` with `Clear filters`.
- No selected rule: inspector explains that selecting a rule shows overview,
  history, and silences.
- Rule not found: clear `ruleId` and show a bounded not-found state.
- History load failure: inspector-local retry, not whole-route failure.
- Catalog load failure: notifications tab shows a field-level error and blocks
  create/update because delivery target selection is unresolved.

## Dashboard Relationship

Dashboard alert widgets are read-only alert evidence surfaces. They may link to
`/alerts?ruleId=<id>` and use `alertSummary` or `alertHistory`. Dashboard
editing must not create, update, enable, disable, silence, or delete alert
rules.

Dashboard threshold display settings are not alert rules.

## Required Implementation Checks

Frontend tests must prove:

- `/alerts` stays out of primary project sidebar navigation;
- `Create alert rule` navigates to `/alerts/new` and does not open a sheet;
- `/alerts/new` renders the five create tabs and header actions;
- `/alerts/:ruleId/settings` renders the six settings tabs and uses
  `expectedVersion`;
- the Notifications tab submits only selected adapter IDs and never provider
  secrets;
- without company adapter instance contracts, only read-only `in_app` is
  selectable;
- company alert adapter settings render fields from adapter definition schemas,
  split secret and non-secret values, preserve existing secrets when blanks are
  submitted, and expose explicit clear actions for stored secrets;
- changing kind resets signal and condition only after confirmation when dirty;
- rule filtering uses `AlertRuleSearchInput` and does not locally filter
  server-backed rule lists;
- dashboard alert widgets never mutate alert rules.
