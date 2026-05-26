# CloudGrid BFF

TypeScript backend-for-frontend.

Responsibilities:

- Serve `/graphql`.
- Serve `/api/health`, `/livez`, and `/readyz`.
- Serve built frontend assets in production.
- Own public error mapping and future auth/session middleware.
- Call private services only through NATS request/reply subjects.

Forbidden:

- Do not import SurrealDB clients.
- Do not import Go storage packages.
- Do not parse OTLP payloads.
- Do not implement REST telemetry read endpoints.

## Local Operation

Start after Docker infrastructure, `storage-write`, and `storage-read` are
running:

```sh
bun run dev
```

The BFF serves `/graphql`, `/api/health`, `/livez`, `/readyz`, and production
frontend assets from `apps/backend/public` on `CLOUDGRID_BFF_PORT` (`3000` by
default). The BFF does not serve a bundled GraphQL IDE.

The MVP has no authentication enforcement. Do not expose the BFF to untrusted
networks.
