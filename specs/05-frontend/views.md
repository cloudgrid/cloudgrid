---
id: TEC-FE-002
title: Frontend views
layer: frontend
status: draft
owner: unknown@example.com
updated: 2026-05-16
provenance: inferred-draft
---

# Frontend Views

All views follow `05-frontend/product-ux-concept.md`. That spec owns shell modes, topbar placement, onboarding, empty-state structure, drawers, dialogs, popovers, collapsibles, and responsive route layout. Trace search, trace detail, and metrics inner-view UX follows `05-frontend/traces-and-metrics-ux-concept.md`.

## Login

The login view presents CloudGrid product identity, current auth error state if present, and a single sign-in action that navigates to BFF `/auth/login`. It does not render username/password fields and does not store tokens.

## Company And Project Navigation

The authenticated app shell contains:

- company selector;
- project selector;
- primary navigation for Traces, Logs, Metrics, Dashboards, and AI Eval after a project is selected; Live is a mode inside Traces;
- user/session menu with logout.

The selected project is visually persistent across telemetry pages. Switching projects calls GraphQL `Mutation.selectProject` and then refreshes project-scoped telemetry queries/subscriptions.

When no project is selected, telemetry navigation is hidden and `/projects` is the main workspace selection surface. In local single-instance mode the company label is `Personal`.

## Project Selection And Settings

`/projects` is the project selection and creation surface. `/projects/:projectId` selects the project and redirects to `/traces`; there is no project overview route.

Project setup and onboarding live in `/projects/:projectId/settings/ingest` and in no-telemetry empty states. The settings root `/projects/:projectId/settings` is the General settings page, not a separate overview subpage.

## Project Management

Project management pages allow authorized users to create projects, rename projects, change status, create/list/revoke multiple titled ingest API keys, and navigate to member access. Secret values are shown only once in the create-key success state; stored secrets are never displayed.

Traces, logs, metrics, and dashboards with no project telemetry link to the selected project ingest settings page. Filtered empty states keep their clear-filter action and do not show setup guidance as the primary action.

## Company User Management

Company member pages list active users, company roles, pending invitations, terminal invitation state, and last activity when available. Admins invite users by email from a drawer. Invitations are always created as `user`; admin promotion is shown only for active members after first sign-in. Role changes call GraphQL control-plane mutations and show optimistic UI only after the mutation succeeds. The current roles are `admin` and `user`; the UI must not expose project-specific role controls until a later granular-permissions spec adds them.

## Trace List

Concrete layout, row visualization, facet rail behavior, states, and acceptance criteria are defined in `05-frontend/traces-and-metrics-ux-concept.md`.

Columns: service, operation/root span, trace ID, started time, duration, status, span count, error span count, log count, and service count. Row click opens `/traces/:traceId`.

Filters: free text query, service, operation/span name, time range, status, duration range, attribute filters, and sort.

## Trace Investigation

Concrete trace header, service strip, waterfall visualization, span inspector tabs, and responsive behavior are defined in `05-frontend/traces-and-metrics-ux-concept.md`.

Sections: summary header, trace overview, virtualized trace tree waterfall, selected span detail panel, and related logs. The waterfall renders orphan spans under a deterministic missing-parent group and marks them as missing-parent.

The selected span is controlled by `spanId` in the URL. Selecting a span updates the URL without a full navigation.

The span detail panel exposes Overview, Attributes, Events, Exceptions, Links, and Logs tabs.

## Logs

Columns: timestamp, severity, service, trace link, span link, body. Logs with trace and span IDs link to `/traces/:traceId?spanId=:spanId`.

Filters: free text search, service, trace ID, span ID, severity, time range, attribute filters, and sort.

## Metrics

Concrete metrics workspace and dashboard behavior are defined in `05-frontend/logs-metrics-dashboards-ux-concept.md`. That route-specific concept supersedes the older saved-view wording in this file.

The metrics view is a focused technical explorer, not a saved dashboard or generic query-language surface.

Default layout:

- metric list with search and descriptor filters;
- metric query/result surface with controls that map to `MetricSeriesInput`;
- metric inspector for descriptor, attributes, returned series, and exemplars.

The UI loads metric names through `Query.metricNames` and charts through `Query.metricSeries`. It never renders charts from local raw metric arrays and does not load saved dashboard definitions in `/metrics`.

Metric query controls expose only fields that map directly to `MetricSeriesInput`: metric name, aggregation, group-by, filters, time window, interval, and chart preview type. Invalid combinations are shown inline from GraphQL validation errors.

Empty states distinguish "no metrics ingested yet", "this view has no data for the selected range", and "filters removed all series".

Dashboards own saved visualization composition through `/dashboards`. Unsaved dashboard draft state, drag-resize layout editing, built-in dashboard duplication, and rich metric query widgets are specified in `05-frontend/dashboard-widgets.md` and `05-frontend/logs-metrics-dashboards-ux-concept.md`.

## Live Traces

The live trace view streams `Subscription.liveTraces` events and displays trace-level rows using the same concise field names and column vocabulary as the trace list.

Columns: event time, event type, service, operation/root span, trace ID, started time, duration, status, span count, error span count, log count, and service count. Row click opens `/traces/:traceId`.

Server filters: free text query, service, operation/span name, lower-bound time, status, duration range, attribute filters, and limit. These map directly to `LiveTraceInput`.

Controls:

- pause/resume live event rendering without closing the existing GraphQL WebSocket session;
- clear local buffer;
- restart subscription when server filters change;
- show connection state from GraphQL subscription lifecycle;
- preserve the local buffer across subscription operation restarts unless the user clears it.

The live view does not show `to`, sort, cursor, or historical pagination controls. Users switch to `/traces` for closed-range history and pagination.

## Filter Facets

The UI may call `Query.telemetryFacets` to populate bounded suggestions for services, operations, span names, severities, and attribute keys. Manual text entry remains available when facet suggestions are absent.

## Payload Display

Attributes and bodies render in a monospace JSON viewer with collapsed root by default for objects over 20 keys. Attribute tables include copy and pivot actions.

Primary trace and log list tables are workspace surfaces, not card content. They must use the full available route width and remaining viewport height. In populated list states the page itself should not scroll; only the table content area scrolls, with table headers remaining sticky.

## Surface Consistency

Route-primary surfaces are not card content. Use:

- workspace surfaces for trace/log/live/metric/eval primary content;
- inspector drawers for span details, log previews, metric editors, setup guides, and AI-eval details;
- dialogs for confirmation and short focused tasks;
- popovers for compact anchored choices;
- collapsibles for optional secondary groups such as facets and advanced filters.

Do not create new modal/drawer/popover usage rules inside route components. Update `05-frontend/product-ux-concept.md` first when a route needs a new interaction pattern.
