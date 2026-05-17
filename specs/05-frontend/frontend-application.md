---
id: TEC-FE-001
title: Frontend application
layer: frontend
status: draft
owner: unknown@example.com
updated: 2026-05-16
provenance: inferred-draft
---

# Frontend Application

`05-frontend/product-ux-concept.md` is the authoritative UX concept for shell modes, navigation ordering, onboarding, empty states, drawers, dialogs, popovers, collapsibles, and route layout. This file defines route/data behavior and must not contradict that concept.

## Routes

- `/`: redirect to `/projects` in local mode; in deployed mode redirect to `/projects` when authenticated and `/login` when unauthenticated.
- `/login`: BFF-backed SSO login start page with separate GitHub, Google, and Microsoft Azure buttons. It does not collect passwords or store tokens.
- `/auth/callback`: transient callback handling route. The BFF processes the OIDC callback; the frontend shows loading/error state only.
- `/organizations`: company list and create entry point.
- `/organizations/:organizationId`: company overview with projects, members, and settings navigation.
- `/organizations/:organizationId/members`: company user/member management.
- `/organizations/:organizationId/projects`: project management list.
- `/projects`: project overview and selected-project entry point.
- `/projects/:projectId`: compatibility redirect that selects the project and navigates to `/traces`.
- `/projects/:projectId/settings`: project settings and ingest credential metadata.
- `/traces`: trace list with filters. Live receiving is a mode of this route through `?mode=live`; there is no separate live primary route.
- `/traces/:traceId`: trace investigation view.
- `/logs`: log search with filters.
- `/metrics`: technical project metric explorer for `metricNames` and `metricSeries`; it is not a saved dashboard or widget editor.
- `/dashboards`: saved dashboard/widget workspace for reusable visual compositions.
- `/alerts`: project alert rules, alert history, silences, and trace/log/metric pivots. The route remains available but is not a primary project sidebar item.
- `/ai-eval`: AI evaluation workspace unless the AI-eval frontend feature is
  explicitly disabled with `CLOUDGRID_AI_EVAL_ENABLED=false` or
  `VITE_CLOUDGRID_AI_EVAL_ENABLED=false`.
- `/projects/:projectId/settings/ai-eval`: project AI Eval settings in the
  admin settings shell.

## Data Access

- Use TanStack Query for all GraphQL reads.
- Use GraphQL subscriptions for realtime telemetry. The frontend must not use EventSource, raw WebSocket messages, NATS clients, OTLP endpoints, or polling as the primary live trace mechanism.
- Query keys must include GraphQL operation name and normalized variables.
- Subscription operation identities must include GraphQL operation name and normalized variables.
- Do not duplicate backend schemas in component files; import generated GraphQL types from `apps/packages/ui-contracts`.
- Frontend must not call NATS, Go services, OTLP collector endpoints, or SurrealDB.
- Frontend GraphQL clients validate decoded GraphQL response envelopes before reading `data` or `errors`.
- In deployed SSO mode, browser GraphQL HTTP and WebSocket requests authenticate through the BFF HttpOnly session cookie. The frontend must not store OAuth access tokens in localStorage, sessionStorage, IndexedDB, URL parameters, or GraphQL variables.
- Login provider buttons link only to BFF `/auth/login?provider=<provider>` routes. The frontend must not perform provider discovery, token exchange, profile fetching, tenant mapping, or membership decisions.
- Login and logout are BFF routes. The frontend may link to them and render callback/error states, but it must not implement token exchange.
- Frontend error handling reads CloudGrid Problem Details from `GraphQLError.extensions.problem` when present and falls back to the GraphQL error message otherwise.
- Frontend must treat GraphQL telemetry responses as authoritative read models. It must not derive trace counts, service breakdowns, facets, span matches, related logs, critical-path flags, orphan/root structure, or backend filter results from raw spans or logs.
- Frontend must treat GraphQL metric responses as authoritative read models. It must not derive metric rates, percentiles, rollups, grouping, downsampling, cardinality reduction, or descriptor metadata from raw metric points.
- Frontend may derive local presentation-only state: expanded/collapsed rows, selected row, focused row, active tab, visible virtualized range, timeline zoom, and URL query parameters.
- Server-backed list sorting must use GraphQL input fields and backend-defined sort semantics. Frontend-local sorting is allowed only for bounded detail tables or already-loaded inspector sublists, never as a substitute for server-backed list sorting.
- Live view server filters are sent through `LiveTraceInput`. Changing those filters starts a new GraphQL subscription operation on the existing WebSocket session when supported by the GraphQL client and stops the previous operation.
- The live view may keep a bounded local buffer of received `TraceSummary` records for display continuity across filter changes. It must not compute backend-owned aggregate fields or use local filtering as a substitute for server-side live filters.
- Organization, project, user, and membership screens use GraphQL control-plane read models. The frontend must not call control-plane NATS subjects directly.
- Telemetry routes require a selected project. If no selected project exists, route to `/projects` with a visible project-required state.
- Metric routes require a selected project and reset metric query caches, selected saved view, and panel draft state when the selected project changes.
- AI-eval routes require a selected project and reset AI-eval query state when the selected project changes.
- AI-eval settings live in project settings. The AI Eval workspace links to
  settings for setup, but it must not create a second settings shell or store
  provider profiles in frontend-local state.
- The app shell has project selection mode and project workspace mode as defined in `05-frontend/product-ux-concept.md`.
- In project selection mode, the topbar must not show `Live`, `Traces`, `Logs`, `Metrics`, or `AI Eval`.
- In project workspace mode, primary navigation order is `Traces`, `Logs`, `Metrics`, `Dashboards`, and `AI Eval` when enabled. AI Eval is enabled by default and may be explicitly disabled with the AI-eval frontend feature flags. `Live` is a mode inside `Traces`; `Alerts` remains available at `/alerts` but is not a primary project sidebar item; there is no project Overview route. Company/member management and settings are reached through context menus or explicit management routes, not mixed into telemetry navigation.

## Development GraphQL UI

- The BFF may expose GraphiQL at `/graphql` only in development or when `CLOUDGRID_GRAPHQL_UI=true`.
- The Vite frontend development server may proxy `/graphql` and `/auth` to the local BFF to keep frontend code on same-origin BFF GraphQL and auth routes.
- The production frontend must not require direct GraphQL tooling routes beyond the BFF-owned `/graphql` endpoint.

## Required States

Every route implements loading, empty, error, and populated states. Retry buttons refetch the relevant TanStack Query.

Authenticated control-plane routes implement unauthorized, forbidden, empty, and populated states. Forbidden states must show a stable CloudGrid problem code and must not leak hidden organization/project names.

The live route implements connecting, live, reconnecting, paused, empty, error, and populated states. The connection indicator reflects GraphQL subscription state, not NATS or storage-read internals.

The screen/component implementation breakdown for the next frontend wave is defined in `05-frontend/frontend-execution-spec.md`.

## Presentation

- Use shadcn/ui components with the default shadcn theme.
- Follow the enterprise UX concept in `05-frontend/product-ux-concept.md`; route-primary tables, trace waterfall, and metric grids must not be nested inside cards.
- Use dialogs only for focused confirmations or short interruption tasks, right/bottom sheets for contextual details and editors, popovers for compact anchored choices, and collapsibles for optional secondary groups.
- Copy, save, create, update, delete, pin/unpin, and toggle actions must surface success and failure feedback through accessible route-local status, inline validation/problem details, or compact toast/status messaging as appropriate to the action.
- Support light and dark mode. Theme selection must persist locally and respect the user's system preference before any explicit selection.
- Support multiple UI languages through a frontend translation layer. English is the default locale for MVP.
- General charts use the shadcn `chart` component with Recharts. Trace tree waterfall and trace minimap visualizations remain custom React/SVG/CSS components because they require hierarchy-specific interaction, timeline synchronization, keyboard tree behavior, and virtualization.
- Large span, trace, or log row sets use `@tanstack/react-virtual` instead of rendering unbounded DOM rows.
- Live trace rows use virtualization and a bounded buffer. The default buffer limit is 100 and the maximum user-selectable limit is 500, matching `LiveTraceInput.limit`.

## Navigation Enhancements

The app shell may include a command palette for local route, filter, preset, copy-link, and GraphQL-UI actions. The command palette is frontend-only and must not introduce a backend search contract.

The detailed requirements for visualization and navigation enhancements are defined in `05-frontend/ui-enhancements-and-visualizations.md`.

## URL State

Filters and cursors are represented in URL query parameters.

Live route URL state:

- `service`
- `query`
- `operationName`
- `spanName`
- `from`
- `status`
- `minDurationMs`
- `maxDurationMs`
- `limit`
- `paused`

Metrics route URL state:

- `metricName`
- `from`
- `to`
- `aggregation`
- `groupBy`
- `tab`

Metrics route state is a technical explorer state only. Saved dashboard/view identifiers do not belong
in `/metrics`; dashboards own saved visualization composition through `/dashboards`.

Project route state:

- `organizationId`
- `projectId`
- `tab`

Project onboarding presentation state may store dismissed/collapsed checklist state locally in the browser. It must not be treated as project data and must not store tokens, secrets, or telemetry.

Telemetry route state in deployed SSO mode always resolves against the BFF session selected project, not a trusted frontend-supplied project ID.

Trace investigation state is also represented in URL query parameters:

- `spanId`
- `tab`
- `spanQuery`
- `spanService`
- `spanName`
- `spanStatus`
- `minSpanDurationMs`
- `maxSpanDurationMs`
- `showMatchesOnly`
- `criticalPathOnly`
- `errorsOnly`
