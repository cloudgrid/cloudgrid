# CloudGrid Frontend

React/Vite frontend for CloudGrid.

Responsibilities:

- Render trace list, trace detail, span waterfall, log search, and filters.
- Call only the TypeScript BFF GraphQL endpoint.
- Use generated GraphQL types from `apps/packages/ui-contracts`.

Forbidden:

- Do not call NATS.
- Do not call Go services.
- Do not call SurrealDB.
- Do not call OTLP collector endpoints from UI code.

Production builds emit static assets into `apps/backend/public` so the BFF can
serve the browser application from the same deployable package. In development,
Vite serves the frontend and proxies `/graphql` to the BFF.
The default dev port is `5173`; override it with `CLOUDGRID_FRONTEND_DEV_PORT`.
