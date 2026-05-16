# Reference

This page collects stable commands, paths, ports, and contract locations.

## Commands

| Purpose | Command |
| --- | --- |
| Install dependencies | `bun install` |
| Start Docker infra | `docker compose --env-file .env up -d nats surrealdb` |
| Start local app stack | `bun run dev:all` |
| Start BFF/frontend dev | `bun run dev` |
| Verify default checks | `bun run verify` |
| Verify full stack checks | `bun run verify:full` |
| Check contracts | `bun run contracts:check` |
| Generate contracts | `bun run contracts:generate` |
| Backend coverage | `bun run coverage:backend` |
| Frontend smoke | `bun run smoke:frontend` |
| Go workspace tests | `go test -tags surrealdb ./core/go-runtime/... ./core/go-contracts/... ./core/otlp-collector/... ./core/control-plane/... ./core/storage-read/... ./core/storage-write/...` |

## Default Ports

| Component | Port | Env var |
| --- | --- | --- |
| BFF | `3000` | `CLOUDGRID_BFF_PORT` |
| Frontend dev server | `5173` | `CLOUDGRID_FRONTEND_DEV_PORT` |
| OTLP HTTP collector | `4318` | `CLOUDGRID_OTLP_HTTP_ADDR` |
| OTLP gRPC collector | `4317` | `CLOUDGRID_OTLP_GRPC_ADDR` |
| NATS client | `4222` | `CLOUDGRID_NATS_PORT` |
| NATS monitor | `8222` | `CLOUDGRID_NATS_MONITOR_PORT` |
| SurrealDB | `8000` | `CLOUDGRID_SURREALDB_PORT` |
| storage-read health | `8081` | `CLOUDGRID_STORAGE_READ_HEALTH_PORT` |
| storage-write health | `8082` | `CLOUDGRID_STORAGE_WRITE_HEALTH_PORT` |
| control-plane health | `8084` | `CLOUDGRID_CONTROL_PLANE_HEALTH_PORT` |

## Environment Variables

| Variable | Default | Notes |
| --- | --- | --- |
| `CLOUDGRID_DEPLOYMENT_MODE` | `local` | `local` or `deployed`. |
| `CLOUDGRID_AUTH_MODE` | `local` | `local` or `sso`. |
| `CLOUDGRID_AUTH_PROVIDERS` | unset | Required for SSO. Comma-separated subset of `github`, `google`, `azure`. |
| `CLOUDGRID_AUTH_COMPANY_ID` | unset | Deployed company boundary stamped into browser SSO sessions. |
| `CLOUDGRID_AUTH_GITHUB_CLIENT_ID` | unset | GitHub OAuth App client ID. |
| `CLOUDGRID_AUTH_GITHUB_CLIENT_SECRET` | unset | GitHub OAuth App client secret. |
| `CLOUDGRID_AUTH_GITHUB_REDIRECT_URI` | unset | GitHub callback URL, usually `https://<host>/auth/callback`. |
| `CLOUDGRID_AUTH_GOOGLE_ISSUER` | unset | Google OIDC issuer, usually `https://accounts.google.com`. |
| `CLOUDGRID_AUTH_GOOGLE_AUDIENCE` | unset | Expected Google ID-token audience; defaults to the provider client ID when omitted by runtime config. |
| `CLOUDGRID_AUTH_GOOGLE_JWKS_URL` | unset | Optional Google JWKS override; default runtime behavior uses Google's public JWKS endpoint. |
| `CLOUDGRID_AUTH_GOOGLE_CLIENT_ID` | unset | Google OAuth client ID. |
| `CLOUDGRID_AUTH_GOOGLE_CLIENT_SECRET` | unset | Google OAuth client secret. |
| `CLOUDGRID_AUTH_GOOGLE_REDIRECT_URI` | unset | Google callback URL, usually `https://<host>/auth/callback`. |
| `CLOUDGRID_AUTH_AZURE_ISSUER` | unset | Azure Entra ID issuer, usually `https://login.microsoftonline.com/<tenant-id>/v2.0`. |
| `CLOUDGRID_AUTH_AZURE_AUDIENCE` | unset | Expected Azure ID-token audience; defaults to the provider client ID when omitted by runtime config. |
| `CLOUDGRID_AUTH_AZURE_JWKS_URL` | unset | Optional Azure JWKS override. |
| `CLOUDGRID_AUTH_AZURE_CLIENT_ID` | unset | Azure app registration client ID. |
| `CLOUDGRID_AUTH_AZURE_CLIENT_SECRET` | unset | Azure app registration client secret. |
| `CLOUDGRID_AUTH_AZURE_REDIRECT_URI` | unset | Azure callback URL, usually `https://<host>/auth/callback`. |
| `CLOUDGRID_SESSION_SECRET` | unset | Required for SSO sessions. |
| `CLOUDGRID_SESSION_TTL_SECONDS` | `28800` | BFF session lifetime. |
| `CLOUDGRID_NATS_URL` | `nats://localhost:4222` | Shared private message bridge. |
| `CLOUDGRID_OTLP_HTTP_ADDR` | `0.0.0.0:4318` | OTLP/HTTP bind address for traces, logs, and metrics. |
| `CLOUDGRID_OTLP_GRPC_ADDR` | `0.0.0.0:4317` | OTLP/gRPC bind address for traces, logs, and metrics. |
| `CLOUDGRID_OTLP_GRPC_MAX_MESSAGE_BYTES` | HTTP body limit | Maximum OTLP/gRPC message size. |
| `CLOUDGRID_OTLP_GRPC_COMPRESSION` | `gzip` | OTLP/gRPC compression mode: `none` or `gzip`. |
| `CLOUDGRID_STORAGE_ADAPTER` | `surrealdb` | Must match compiled Go adapter. |
| `CLOUDGRID_SURREALDB_URL` | `http://localhost:8000/rpc` | Storage/control-plane only. |
| `CLOUDGRID_SURREALDB_USERNAME` | `root` locally | Do not expose publicly. |
| `CLOUDGRID_SURREALDB_PASSWORD` | `root` locally | Do not expose publicly. |

See [.env.example](../../.env.example) for the complete current set.

## Repository Paths

| Path | Purpose |
| --- | --- |
| `apps/backend` | TypeScript BFF, GraphQL, auth routes, health, static serving. |
| `apps/frontend` | React/Vite frontend. |
| `apps/packages/definition` | Contract definition source and generator. |
| `apps/packages/runtime` | Shared TypeScript runtime helpers. |
| `apps/packages/ui-contracts` | Generated UI/GraphQL contracts. |
| `core/otlp-collector` | Go OTLP HTTP/gRPC collector. |
| `core/control-plane` | Go company/user/project, project membership, ingest credential, dashboard, retention policy, and alerting foundation service. |
| `core/storage-read` | Go telemetry read service. |
| `core/storage-write` | Go telemetry write service. |
| `core/go-contracts` | Generated/shared Go contracts. |
| `specs` | Source-of-truth implementation specs. |
| `tooling` | Repository scripts and contract checks. |

## Public Contracts

| Contract | Path |
| --- | --- |
| GraphQL schema | `specs/03-contracts/graphql/public-schema.graphql` |
| AsyncAPI message bridge | `specs/03-contracts/messages/message-bridge.asyncapi.yaml` |
| HTTP OpenAPI | `specs/03-contracts/api/http-api.openapi.yaml` |
| Error taxonomy | `specs/03-contracts/errors.yaml` |
| Generated UI contracts | `apps/packages/ui-contracts/src/generated.ts` |
| Generated Go contracts | `core/go-contracts/generated_contracts.go` |

## Primary Product Routes

| Route | Purpose |
| --- | --- |
| `/projects` | Select or create a project. |
| `/projects/:projectId` | Selects the project and redirects to `/traces`. |
| `/traces` | Trace history and live trace receiving modes. |
| `/traces/:traceId` | Trace investigation and span detail. |
| `/logs` | Project log search, selected-log inspector, and trace/span pivots. |
| `/metrics` | Metric explorer for descriptors, series queries, group-by, filters, and exemplars. |
| `/dashboards` | Saved and built-in dashboards using typed metric/log/trace/live widgets. |
| `/alerts` | Project alert rules, silences, and in-app alert history. |
| `/projects/:projectId/settings/ingest` | Project ingest API key setup and key management. |
| `/projects/:projectId/settings/members` | Project-specific membership and roles. |
| `/projects/:projectId/settings/retention` | Project retention policy settings. |

There is no `/live` primary route; live trace receiving is a mode inside `/traces`. There is no `MetricView` compatibility API; dashboard work uses `Dashboard` and `DashboardWidget`.

## External References Used For Scaling Specs

- [NATS JetStream consumers](https://docs.nats.io/nats-concepts/jetstream/consumers)
- [NATS JetStream concepts](https://docs.nats.io/nats-concepts/jetstream)
- [SurrealDB performance best practices](https://surrealdb.com/docs/learn/querying/performance/performance-best-practices)
- [SurrealDB DEFINE INDEX](https://surrealdb.com/docs/reference/query-language/statements/define/indexes)
- [GraphQL over HTTP draft](https://graphql.github.io/graphql-over-http/draft/)
- [OpenTelemetry Collector configuration](https://opentelemetry.io/docs/collector/configuration/)
