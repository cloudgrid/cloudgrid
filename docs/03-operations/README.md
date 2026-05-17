# Operations

This page covers day-to-day operation for local development, small shared environments, and deployed-mode preparation.

## CI/CD And Distribution Status

The repository has a baseline GitHub Actions quality workflow for pull requests
and pushes to `main`, plus a separate website deployment workflow. The product
release path is specified but not fully implemented yet: CloudGrid still needs
service images, a release workflow, Helm chart artifacts, SBOM/provenance
publication, image signing, and enterprise Kubernetes install docs before it is
ready for public or enterprise distribution.

The target distribution model is:

- local evaluation through Docker Compose using published CloudGrid service
  images, NATS, and SurrealDB;
- enterprise Kubernetes through a versioned OCI Helm chart;
- developer libraries through package registries only where they are meant to
  be imported by users.

See
[Release, CI/CD, And Distribution](../../specs/06-nfr/release-distribution.md)
for the source-of-truth delivery concept.

## Local Infrastructure

Start infrastructure:

```sh
docker compose --env-file .env up -d nats surrealdb
```

Inspect infrastructure:

```sh
docker compose --env-file .env ps
docker compose --env-file .env logs -f nats surrealdb
```

Reset all local NATS JetStream and SurrealDB data:

```sh
docker compose --env-file .env down -v
```

## Service Startup

Preferred local command:

```sh
bun run dev:all
```

Manual order:

| Step | Service | Command |
| --- | --- | --- |
| 1 | storage-write | `go run -tags surrealdb ./core/storage-write/cmd/storage-write` |
| 2 | storage-read | `go run -tags surrealdb ./core/storage-read/cmd/storage-read` |
| 3 | control-plane | `go run ./core/control-plane/cmd/control-plane` |
| 4 | BFF and frontend | `bun run dev` |
| 5 | OTLP collector | `go run ./core/otlp-collector/cmd/otlp-collector` |

The startup order avoids noisy first-load request timeouts. If the BFF starts before storage-read or control-plane has subscribed to NATS subjects, early GraphQL requests can fail with `MESSAGE_BRIDGE_TIMEOUT`.

## Health Probes

| Service | Default health port | Probes |
| --- | --- | --- |
| BFF | `3000` | `/livez`, `/readyz`, `/api/health` |
| OTLP collector HTTP | `4318` | `/livez`, `/readyz` |
| OTLP collector gRPC | `4317` | readiness is reported by the HTTP `/readyz` response |
| storage-read | `8081` | `/livez`, `/readyz` |
| storage-write | `8082` | `/livez`, `/readyz` |
| control-plane | `8084` | `/livez`, `/readyz` |

`/readyz` returns `503` while required dependencies are unavailable or a service is draining.

## Local Mode Configuration

Use local mode for development and trusted demos:

```sh
CLOUDGRID_DEPLOYMENT_MODE=local
CLOUDGRID_AUTH_MODE=local
```

Local mode has no login and must not be exposed to untrusted networks.

## Deployed SSO Configuration

Use deployed mode for shared environments:

```sh
CLOUDGRID_DEPLOYMENT_MODE=deployed
CLOUDGRID_AUTH_MODE=sso
CLOUDGRID_AUTH_PROVIDERS=github,google,azure
CLOUDGRID_AUTH_COMPANY_ID=acme
CLOUDGRID_AUTH_GITHUB_CLIENT_ID=...
CLOUDGRID_AUTH_GITHUB_CLIENT_SECRET=...
CLOUDGRID_AUTH_GITHUB_REDIRECT_URI=https://your-cloudgrid.example.com/auth/callback
CLOUDGRID_AUTH_GOOGLE_ISSUER=https://accounts.google.com
CLOUDGRID_AUTH_GOOGLE_AUDIENCE=...
CLOUDGRID_AUTH_GOOGLE_JWKS_URL=https://www.googleapis.com/oauth2/v3/certs
CLOUDGRID_AUTH_GOOGLE_CLIENT_ID=...
CLOUDGRID_AUTH_GOOGLE_CLIENT_SECRET=...
CLOUDGRID_AUTH_GOOGLE_REDIRECT_URI=https://your-cloudgrid.example.com/auth/callback
CLOUDGRID_AUTH_AZURE_ISSUER=https://login.microsoftonline.com/<tenant-id>/v2.0
CLOUDGRID_AUTH_AZURE_AUDIENCE=...
CLOUDGRID_AUTH_AZURE_CLIENT_ID=...
CLOUDGRID_AUTH_AZURE_CLIENT_SECRET=...
CLOUDGRID_AUTH_AZURE_REDIRECT_URI=https://your-cloudgrid.example.com/auth/callback
CLOUDGRID_SESSION_SECRET=...
CLOUDGRID_SESSION_TTL_SECONDS=28800
```

`CLOUDGRID_AUTH_PROVIDERS` controls which buttons appear on `/login`. Use any subset of:

- `github`
- `google`
- `azure`

GitHub uses the OAuth App web flow and the GitHub user/email APIs. Google and Azure use OIDC ID-token validation plus userinfo. Provider access tokens and ID tokens stay inside the BFF; the frontend only links to `/auth/login?provider=<provider>`.

`CLOUDGRID_AUTH_COMPANY_ID` is the deployed company boundary used until dynamic tenant provisioning exists. The first SSO user in an empty configured company becomes company admin. Later SSO users are created as CloudGrid users, but company and project access still comes from company/project membership administration.

### SSO Member Administration

After the first company admin is bootstrapped, deployed SSO mode is invite-only. A successful SSO login proves identity, creates or updates the CloudGrid user profile, and starts a browser session, but it does not grant company or project access by itself.

Company admins invite users by normalized email address. Each invitation is company-scoped, starts as `pending`, and creates a company `user` membership only after the invited person signs in with a matching verified SSO email. Pending invitations are not active members: they cannot be promoted, demoted, added to projects, or used for telemetry access. Admins can list pending and historical invitations separately from active members, and can revoke pending invitations.

Invitations always create the `user` company role in the first version. To make an invited person a company admin, wait until that person signs in and becomes an active company member, then promote the active member. This keeps admin promotion tied to a real CloudGrid user record and preserves final-admin protection.

Project access remains separate from company invitation acceptance. Company admins can see and manage projects across the company. Non-admin users still need project-specific membership before they can use project telemetry workspaces.

Removing a user from the upstream SSO provider does not currently remove CloudGrid access. The default lifecycle policy is manual: admins remove members in CloudGrid, and normal provider login failure must not mutate CloudGrid memberships. Provider-driven deprovisioning is reserved for a future explicit `sso_sync` mode, disabled by default, backed by trusted directory sync contracts such as SCIM or provider admin APIs.

Invalid combinations fail startup with `ERR-009 CONFIG_INVALID`:

- local deployment with SSO auth
- deployed mode with local auth
- SSO auth without `CLOUDGRID_AUTH_PROVIDERS`
- enabled providers without their required `CLOUDGRID_AUTH_<PROVIDER>_*` values

The browser login flow uses BFF-owned authorization code flow. Google and Azure use PKCE. The BFF stores session state in an HttpOnly, Secure, SameSite=Lax cookie. The frontend never stores OAuth access tokens.

## Storage Configuration

SurrealDB is the implemented storage adapter:

```sh
CLOUDGRID_STORAGE_ADAPTER=surrealdb
CLOUDGRID_SURREALDB_URL=http://localhost:8000/rpc
CLOUDGRID_SURREALDB_USERNAME=root
CLOUDGRID_SURREALDB_PASSWORD=root
```

Storage services must be built or run with the SurrealDB build tag:

```sh
go run -tags surrealdb ./core/storage-read/cmd/storage-read
go run -tags surrealdb ./core/storage-write/cmd/storage-write
```

SurrealDB credentials belong only in storage/control-plane service configuration. They must not appear in frontend bundles, BFF responses, collector logs, generated assets, or public docs examples with real values.

The control-plane always uses the SurrealDB metadata store and applies its schema before it subscribes to NATS.

## Ingesting Telemetry

OTLP HTTP endpoints:

- `POST /v1/traces`
- `POST /v1/logs`
- `POST /v1/metrics`

Content types:

- `application/json`
- `application/x-protobuf`

OTLP/gRPC services are exposed on `CLOUDGRID_OTLP_GRPC_ADDR`, default
`0.0.0.0:4317`:

- `opentelemetry.proto.collector.trace.v1.TraceService/Export`
- `opentelemetry.proto.collector.logs.v1.LogsService/Export`
- `opentelemetry.proto.collector.metrics.v1.MetricsService/Export`

Local development uses plaintext gRPC on loopback or Docker networking. Put TLS
termination in front of the collector, or configure collector TLS only after the
deployment templates define that explicitly.

In deployed mode, machine ingest callers use project API keys validated by the collector. A project may have multiple ingest credentials/API keys for different services or environments. Create and revoke project API keys from Project settings > API Keys; the full key is shown once on creation and never displayed again. Each accepted credential must resolve to one authorized project and the required ingest scopes. In local single-project mode, ingest uses `CLOUDGRID_OTLP_LOCAL_PROJECT_ID` or `default` and does not need a project API key.

For local multi-project ingest, configure `CLOUDGRID_OTLP_LOCAL_PROJECT_TOKENS` as a JSON object whose keys are 32+ character bearer tokens and whose values are local project IDs. Each token maps to exactly one local project.

```sh
export CLOUDGRID_OTLP_LOCAL_PROJECT_TOKENS='{
  "dev-checkout-token-000000000000000001": "checkout",
  "dev-worker-token-0000000000000000002": "worker"
}'
```

Then configure each instrumented service with the project API key and OTLP endpoint:

```sh
export CLOUDGRID_PROJECT_API_KEY='<project-token>'
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
```

For gRPC exporters:

```sh
export CLOUDGRID_PROJECT_API_KEY='<project-token>'
export OTEL_EXPORTER_OTLP_PROTOCOL=grpc
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
```

Do not put CloudGrid project IDs in span/resource/metric attributes. The collector ignores telemetry attributes for project routing.

Dashboard customizations are stored as project-scoped `Dashboard` records in the control-plane database, with typed `DashboardWidget` configuration for metric, log, trace, and live trace widgets. There is no `MetricView` compatibility surface. Dashboard definitions never store bearer tokens or secret values; save requests that include secret-looking keys such as `authorization`, `token`, `secret`, or `password` are rejected.

## Working With Logs, Metrics, And Dashboards

- Logs: use `/logs` to search project logs, inspect the selected log body and attributes, and open same-project trace/span detail when correlation exists.
- Metrics: use `/metrics` to discover metric descriptors and query raw series. This route is not a dashboard editor.
- Dashboards: use `/dashboards` to view built-in dashboards, create personal or project dashboards, edit typed widgets, and manage dashboard pins.

Dashboard builder mode opens at `/dashboards?dashboard=<dashboardId>` or from a new unsaved draft. It keeps widget edits and drag-resize layout changes local until explicit save. The widget editor is a drawer or sheet with `Data`, `Display`, and `Thresholds` groups. Rich metric widgets use typed query rows, typed formulas, and `Query.richMetricSeries`; storage-read computes timestamp alignment, formulas, warnings, and returned chart-ready series.

Log-to-trace, trace-to-log, metric exemplar-to-trace, and dashboard-to-log/trace/metric pivots must stay inside the selected project. Missing, expired, or unauthorized targets show the target route's missing state instead of searching another project.

For examples and dashboard editor details, see [Metrics And Dashboards](../02-core-concepts/metrics-and-dashboards.md).

## Monitoring The Message Bridge

NATS monitor defaults to `http://localhost:8222`.

Useful checks:

- stream and consumer presence for telemetry ingest
- pending JetStream messages for storage-write
- redelivery counts and max-delivery advisories
- request/reply timeout spikes in BFF logs

Storage-write acknowledges messages only after persistence succeeds. Repeated redeliveries usually mean SurrealDB is unavailable, schema readiness failed, or a message violates validation.

## Retention

Project-level editable retention policies are available in Project settings. The control-plane stores one policy per project and validates that every data class has one rule. Project admins can choose retain, hard delete, or soft-delete-then-final-delete per data class.

Retention deletion is executed by the storage-maintenance boundary. Until that worker is running, policy changes are saved and visible in the UI but do not remove telemetry from SurrealDB.

## Alerting

Project-scoped alerting is available as an alert configuration and history workspace at `/alerts`. Rules can target metrics, logs, or traces, and project admins can create rules and silences. Notification delivery is adapter-based, with in-app alert history as the core reference adapter.

The alert evaluator owns rule execution, state transitions, and notification dispatch. If the evaluator is not running, configured rules remain stored but do not fire. Dashboard widget thresholds are visual configuration only and do not execute alert rules.

## Troubleshooting

| Problem | What to check |
| --- | --- |
| Frontend shows no telemetry | Confirm a project is selected, fixture ingest returned `200`, storage-write is ready, and storage-read `/readyz` is healthy. |
| Metrics explorer has no series | Confirm `/v1/metrics` ingest returned `200`, the selected time range includes the points, and storage-read can query `telemetry.metrics.names` and `telemetry.metrics.query`. |
| Dashboard widget is empty | Open the same metric in `/metrics` or the same log/trace filters in `/logs` or `/traces`; dashboard widgets execute the same project-scoped GraphQL queries. |
| BFF logs `MESSAGE_BRIDGE_TIMEOUT` | Confirm storage-read/control-plane are running and connected to the same NATS URL. |
| Collector rejects ingest in deployed mode | Confirm Bearer token validity, project status cache freshness, and project status is `active`. |
| Live view stalls | Check storage-write post-persist notifications, storage-read live consumer, and BFF WebSocket logs. |
| GraphiQL missing | It is disabled by default in production. Set `CLOUDGRID_GRAPHQL_UI=true` only for trusted operator sessions. |

Next: [Architecture](../04-architecture/README.md) explains why these operational boundaries exist.
