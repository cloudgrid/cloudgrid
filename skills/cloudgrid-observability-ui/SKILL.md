---
name: cloudgrid-observability-ui
description: Implements or reviews CloudGrid observability UI, BFF, docs, and contracts. Use when working on traces, logs, metrics, dashboards, widgets, pins, log-to-trace links, metric exemplars, live trace receiving, project API keys, retention/alerting UI boundaries, or removal of old MetricView surfaces.
---

# CloudGrid Observability UI And Dashboard Work

Use this skill when implementing, reviewing, or documenting CloudGrid
observability workflows for traces, logs, metrics, dashboards, widgets, and
live trace receiving.

## Source Order

Read the source and public docs before editing:

1. `DESIGN.md`
2. `website/src/content/handbook/guides/`
3. `website/src/content/handbook/reference/routes.md`
4. `apps/frontend/src/routes`
5. `apps/frontend/src/features`
6. `apps/backend/src`
7. `apps/packages/public-api-client`
8. `apps/packages/ui-contracts`
9. `core/storage-read`, `core/storage-write`, and `core/control-plane`

If the requested behavior is not documented or implemented, report it as a
product gap. Do not invent GraphQL fields, routes, subjects, widget kinds,
project routing, retention behavior, alert rules, or error codes.

## Product Route Split

Keep these jobs separate:

- `/traces`: trace history and live trace receiving modes.
- `/traces/:traceId`: trace investigation, span detail, waterfall, related logs, and copied references.
- `/logs`: project log search, selected-log inspector, and same-project trace/span pivots.
- `/metrics`: technical metric explorer for descriptors, `MetricSeriesInput`, aggregation previews, group-by, filters, returned series, and exemplars.
- `/dashboards`: saved visual composition workspace with dashboard rail, widget grid, widget inspector/editor, explicit save, built-in duplication, personal/project visibility, and dashboard pin actions.

Do not merge `/metrics` and `/dashboards`. Metrics exploration is technical discovery; dashboards are reusable presentation/composition.

## Work Locations

Use the owning module:

| Surface | Location |
| --- | --- |
| React UI | `apps/frontend/src/routes`, `apps/frontend/src/features`, shared UI components. |
| GraphQL/BFF mapping | `apps/backend/src`, BFF bridge clients, public API client descriptors. |
| Shared public operations | `apps/packages/public-api-client`. |
| Generated UI contracts | `apps/packages/ui-contracts`. |
| Public GraphQL operations and generated types | `apps/packages/public-api-client` and `apps/packages/ui-contracts`. |
| Public docs | `website/src/content/handbook/` when behavior changes. |

Do not define route-local GraphQL documents or direct `/graphql` calls when a
shared public API client operation exists or should be added.

## Dashboard Contract Rules

Dashboards use first-class `Dashboard` and `DashboardWidget` contracts.

Required behavior:

- Use `Query.dashboards`, `Mutation.saveDashboard`, `Mutation.deleteDashboard`, `Mutation.setDashboardPinned`, and `Mutation.reorderDashboardPins` when the implementation scope includes dashboard persistence or pins.
- Render metric widgets through `Query.metricSeries`.
- Render log widgets through `Query.logs`.
- Render trace widgets through `Query.traces`.
- Render live trace widgets through `Subscription.liveTraces`.
- Store live widget filters only; never persist live events or replay buffers.
- Keep built-in dashboards read-only. Editing a built-in creates an unsaved draft until the user saves it as personal or project visibility.
- Save dashboards explicitly. Prompt before closing, switching routes, or switching projects when dirty edits would be lost.

Forbidden compatibility:

- Do not add or preserve `MetricView`.
- Do not add or preserve `MetricViewPanel`.
- Do not add or preserve `metricViews`, `saveMetricView`, or `deleteMetricView`.
- Do not alias dashboard contracts to metric-view names.

Forbidden dashboard content:

- executable code;
- raw SQL, SurrealQL, GraphQL, JavaScript, or template strings;
- arbitrary JSON widget configuration;
- iframe/embed URLs or external script URLs;
- bearer tokens, session IDs, API keys, cookies, Authorization headers, SurrealDB credentials, or secret-looking values.

## Logs And Correlation

`/logs` maps controls directly to `LogSearchInput`.

Implement or document:

- free-text, time range, service, severity, trace ID, span ID, attributes, exact log ID, and sort filters;
- active removable filter chips that update URL state;
- selected-log inspector tabs: Body, Attributes, Correlation;
- copy actions for log ID, trace ID, span ID, body, attribute keys, and attribute values;
- `Open trace` and `Open span` only when the selected log has correlation;
- missing, expired, unauthorized, or unavailable trace/span targets as target-route missing states.

Never search another project to satisfy log correlation.

## Metrics Explorer

`/metrics` maps controls directly to metric GraphQL inputs.

Implement or document:

- metric discovery through `Query.metricNames`;
- descriptor details, attribute keys, first seen, and last seen;
- series execution through `Query.metricSeries`;
- aggregation compatibility from returned metric descriptor metadata and
  backend validation;
- group-by keys only from `MetricDescriptor.attributeKeys`;
- exemplar trace/span links using selected-project pivot behavior;
- backend warnings and validation errors inline without clearing the selected metric.

The frontend and BFF must not calculate rates, percentiles, rollups, counts, grouping, downsampling, descriptor metadata, or exemplar correlation from raw records.

## Security And Project Scope

Every telemetry and dashboard workflow is project-scoped.

- Browser/frontend code talks only to the TypeScript BFF.
- The BFF talks to storage-read and control-plane through message bridge request/reply.
- Storage-read owns trace/log/metric query semantics and live trace fanout.
- Control-plane owns dashboards, dashboard pins, ingest credential metadata, projects, companies, users, and roles.
- The OTLP collector handles ingest auth before body decode except method, content-type, and request-size checks.
- Deployed ingest uses validated bearer JWTs with ingest scopes.
- Local multi-project ingest uses `Authorization: Bearer <local-project-token>` where each configured opaque token maps to one project.
- Projects may expose multiple ingest credentials/API keys for different emitters, but every credential resolves to one authorized project and secret values are never stored in plaintext or copied into telemetry/dashboard data.
- Project IDs in OTLP resource, span, log, or metric attributes are ignored for routing.

Do not expose SurrealDB credentials, provider tokens, bearer values, session cookies, or raw Authorization headers in UI, docs examples, logs, dashboard definitions, generated assets, or skill output.

## Implementation Workflow

1. Read the current route implementation, public docs, and generated contracts.
2. Identify whether the change is UI-only, BFF mapping, public contract, or
   private service behavior.
3. Update contracts and public docs first if a new field, input, widget kind, route state,
   error, or subject is needed.
4. Keep frontend state presentational: selection, focus, tabs, URL params,
   virtualization, and inspector state are allowed.
5. Put telemetry query semantics in storage-read, not frontend or BFF.
6. Add focused tests for the changed route, view model, or bridge mapping.
7. Update the website handbook if the user workflow changes.

## Current TODO Boundaries

Document these as future work, not hidden features:

- Retention policy enforcement is project-scoped with editable policies,
  per-data-class rules, and admin-selected hard delete or
  soft-delete-then-delete. Do not invent retention behavior outside checked-in
  docs and implementation.
- Alerting is project-scoped for metrics/logs/traces rules, adapter-based
  notifications, and in-app alert history as the core reference adapter. Do not
  invent alert widgets or external notification adapters outside checked-in docs
  and implementation.
- Full OTLP compatibility uses HTTP JSON/protobuf on `4318` and gRPC protobuf
  on `4317` for traces, logs, and metrics.

## Review Checklist

Before finishing:

1. Confirm the docs or code describe `/metrics` as explorer and `/dashboards` as saved composition.
2. Confirm dashboards use `Dashboard`/`DashboardWidget`, not MetricView names.
3. Confirm log and metric pivots stay in the selected project.
4. Confirm dashboard pins use dashboard contracts and pin mutations, not localStorage as truth.
5. Confirm retention, alerting, and full OTLP compatibility are described only within their implemented or TODO boundaries.
6. Confirm frontend operations are shared through the public API client when the
   route uses a public endpoint.
7. Run the narrowest relevant checks. Contract/BFF bridge changes require
   `bun run contracts:check`; frontend UX changes usually need focused frontend
   tests and, when visual behavior is material, `bun run smoke:frontend`.
