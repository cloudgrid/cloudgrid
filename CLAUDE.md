# Claude Guidance

Follow [AGENTS.md](./AGENTS.md). Specs in `specs/` are authoritative.

Do not invent implementation details when the specs are silent. Update the relevant spec first, then implement.

For frontend UX work, follow `specs/05-frontend/product-ux-concept.md`, `specs/05-frontend/logs-metrics-dashboards-ux-concept.md`, `specs/05-frontend/dashboard-widgets.md`, and `DESIGN.md`. Do not invent alternate navigation, onboarding, empty-state, drawer/dialog/popover, or route layout patterns in components. Preserve UX v2: global topbar, project/domain sidebar navigation, independent scroll containers, centered project-card picker, admin settings shell, flat shadcn/Tailwind styling, explicit button hierarchy, no card-in-card layouts, and local `Personal` admin safety.

Telemetry reads follow the dumb-client, smart-backend model in `specs/04-backend/telemetry-query-semantics.md`: frontend renders GraphQL view models, the BFF maps GraphQL to NATS without telemetry aggregation, and storage-read/database adapters own query semantics and pushdown. Metrics exploration belongs in `/metrics`; saved visual composition belongs in `/dashboards` through `Dashboard` and `DashboardWidget` contracts. Do not add or preserve `MetricView` compatibility surfaces.

Live telemetry uses GraphQL subscriptions from the frontend. The BFF owns transport only and must not consume telemetry streams directly; storage-read owns live filtering, authorization preparation, and event fanout.
