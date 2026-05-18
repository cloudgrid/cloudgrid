# Environment Variables

This table summarizes the current CloudGrid runtime variables. See [Runtime environment](../configuration/runtime-environment.md) for validation context.

## Shared

| Variable | Default | Notes |
| --- | --- | --- |
| `CLOUDGRID_IMAGE_REGISTRY` | `ghcr.io/cloudgrid-dev` in release Compose | OCI image registry for release Compose. |
| `CLOUDGRID_IMAGE_TAG` | current release tag | OCI image tag for release Compose. |
| `CLOUDGRID_DEPLOYMENT_MODE` | `local` | `local` or `deployed`. |
| `CLOUDGRID_AUTH_MODE` | `local` | `local` or `sso`; must match deployment mode. |
| `CLOUDGRID_NATS_URL` | `nats://localhost:4222` | Private message bridge. |
| `CLOUDGRID_STORAGE_ADAPTER` | `surrealdb` | Must match compiled Go adapter. |

## BFF And Frontend

| Variable | Default | Notes |
| --- | --- | --- |
| `CLOUDGRID_BFF_HOST` | `0.0.0.0` | BFF bind host. |
| `CLOUDGRID_BFF_PORT` | `3000` | BFF port. |
| `CLOUDGRID_GRAPHQL_MAX_DEPTH` | `12` | Reject deeper GraphQL operations before resolver or bridge execution. |
| `CLOUDGRID_GRAPHQL_MAX_COMPLEXITY` | `500` | Reject GraphQL operations with more selected fields than the configured limit. |
| `CLOUDGRID_GRAPHQL_RESPONSE_MEDIA_TYPE` | `compatible` | `compatible` keeps JSON responses; `graphql-response-json` emits `application/graphql-response+json`. |
| `CLOUDGRID_FRONTEND_DEV_PORT` | `5173` | Vite dev server port. |
| `CLOUDGRID_FRONTEND_SERVE_STATIC` | `false` in dev | BFF serves built frontend when true. |
| `CLOUDGRID_FRONTEND_STATIC_DIR` | `./apps/backend/public` | Static frontend directory. |
| `CLOUDGRID_GRAPHQL_UI` | dev-enabled | Enable GraphiQL for trusted sessions. |
| `CLOUDGRID_PUBLIC_URL` | unset | External browser base URL used in invitation emails. |

## SSO

| Variable | Default | Notes |
| --- | --- | --- |
| `CLOUDGRID_AUTH_PROVIDERS` | unset | Comma-separated subset of `github`, `google`, `azure`; required for SSO. |
| `CLOUDGRID_AUTH_COMPANY_ID` | unset | Deployed company boundary. |
| `CLOUDGRID_SESSION_SECRET` | unset | Required for SSO sessions. |
| `CLOUDGRID_SESSION_TTL_SECONDS` | `28800` | Session lifetime. |
| `CLOUDGRID_AUTH_GITHUB_CLIENT_ID` | unset | Required when GitHub is enabled. |
| `CLOUDGRID_AUTH_GITHUB_CLIENT_SECRET` | unset | Required when GitHub is enabled. |
| `CLOUDGRID_AUTH_GITHUB_REDIRECT_URI` | unset | Usually `https://<host>/auth/callback`. |
| `CLOUDGRID_AUTH_GOOGLE_ISSUER` | unset | Usually `https://accounts.google.com`. |
| `CLOUDGRID_AUTH_GOOGLE_AUDIENCE` | client ID fallback | Expected ID-token audience. |
| `CLOUDGRID_AUTH_GOOGLE_JWKS_URL` | provider default | Optional JWKS override. |
| `CLOUDGRID_AUTH_GOOGLE_CLIENT_ID` | unset | Required when Google is enabled. |
| `CLOUDGRID_AUTH_GOOGLE_CLIENT_SECRET` | unset | Required when Google is enabled. |
| `CLOUDGRID_AUTH_GOOGLE_REDIRECT_URI` | unset | Usually `https://<host>/auth/callback`. |
| `CLOUDGRID_AUTH_AZURE_ISSUER` | unset | Usually `https://login.microsoftonline.com/<tenant-id>/v2.0`. |
| `CLOUDGRID_AUTH_AZURE_AUDIENCE` | client ID fallback | Expected ID-token audience. |
| `CLOUDGRID_AUTH_AZURE_JWKS_URL` | derived from issuer | Optional JWKS override. |
| `CLOUDGRID_AUTH_AZURE_CLIENT_ID` | unset | Required when Azure is enabled. |
| `CLOUDGRID_AUTH_AZURE_CLIENT_SECRET` | unset | Required when Azure is enabled. |
| `CLOUDGRID_AUTH_AZURE_REDIRECT_URI` | unset | Usually `https://<host>/auth/callback`. |

## Invitation Email

These variables configure the control-plane SMTP invitation delivery path.
Invite mutations write the invitation and outbox row first; the worker sends
and retries email asynchronously.

| Variable | Default | Notes |
| --- | --- | --- |
| `CLOUDGRID_INVITATION_EMAIL_MODE` | `disabled` local, `smtp` deployed SSO | `disabled` or `smtp`. |
| `CLOUDGRID_INVITATION_EMAIL_REQUIRE_DELIVERY` | `false` local, `true` deployed SSO | Fails invitation mutations when required delivery cannot be enqueued. |
| `CLOUDGRID_INVITATION_EMAIL_FROM` | unset | Sender identity; required for SMTP mode. |
| `CLOUDGRID_INVITATION_EMAIL_REPLY_TO` | unset | Optional reply-to address. |
| `CLOUDGRID_INVITATION_EMAIL_SMTP_HOST` | unset | Required for SMTP mode. |
| `CLOUDGRID_INVITATION_EMAIL_SMTP_PORT` | unset | Required for SMTP mode. |
| `CLOUDGRID_INVITATION_EMAIL_SMTP_USERNAME` | unset | Optional unless the SMTP provider requires auth. |
| `CLOUDGRID_INVITATION_EMAIL_SMTP_PASSWORD` | unset | Optional unless the SMTP provider requires auth. |
| `CLOUDGRID_INVITATION_EMAIL_SMTP_TLS` | `starttls` deployed | `starttls`, `tls`, or `none`. |
| `CLOUDGRID_INVITATION_EMAIL_SMTP_TIMEOUT_MS` | `10000` | Valid range `1000..60000`. |
| `CLOUDGRID_INVITATION_EMAIL_MAX_ATTEMPTS` | `5` | Valid range `1..20`. |
| `CLOUDGRID_INVITATION_EMAIL_RETRY_BASE_SECONDS` | `60` | Valid range `5..3600`. |

## OTLP Collector

| Variable | Default | Notes |
| --- | --- | --- |
| `CLOUDGRID_OTLP_HTTP_ADDR` | `0.0.0.0:4318` | OTLP/HTTP bind address. |
| `CLOUDGRID_OTLP_HOST` | `0.0.0.0` | Fallback host when `CLOUDGRID_OTLP_HTTP_ADDR` is unset. |
| `CLOUDGRID_OTLP_PORT` | `4318` | Fallback port when `CLOUDGRID_OTLP_HTTP_ADDR` is unset. |
| `CLOUDGRID_OTLP_GRPC_ADDR` | `0.0.0.0:4317` | OTLP/gRPC bind address. |
| `CLOUDGRID_OTLP_MAX_REQUEST_BYTES` | `4194304` | HTTP body limit. |
| `CLOUDGRID_OTLP_MAX_SPANS_PER_REQUEST` | `10000` | Reject oversized trace exports before publish. |
| `CLOUDGRID_OTLP_MAX_LOGS_PER_REQUEST` | `10000` | Reject oversized log exports before publish. |
| `CLOUDGRID_OTLP_MAX_METRIC_POINTS_PER_REQUEST` | `20000` | Reject oversized metric exports before publish. |
| `CLOUDGRID_OTLP_PUBLISH_TIMEOUT_MS` | `1000` | JetStream publish acknowledgement timeout. |
| `CLOUDGRID_OTLP_GRPC_MAX_MESSAGE_BYTES` | HTTP body limit | gRPC message limit. |
| `CLOUDGRID_OTLP_GRPC_COMPRESSION` | `gzip` | `gzip` or `none`. |
| `CLOUDGRID_PROJECT_STATUS_CACHE_TTL_SECONDS` | `60` | Deployed-mode project status freshness window. |
| `CLOUDGRID_PROJECT_STATUS_CACHE_STALE_SECONDS` | `120` | Deployed-mode fail-closed staleness boundary; must be greater than or equal to the TTL. |
| `CLOUDGRID_OTLP_LOCAL_PROJECT_ID` | `default` | Single-project local fallback. |
| `CLOUDGRID_OTLP_LOCAL_PROJECT_TOKENS` | unset | JSON bearer-token-to-project map. |

## Self-Observability

| Variable | Default | Notes |
| --- | --- | --- |
| `CLOUDGRID_SELF_OBSERVABILITY_ENABLED` | `true` local, `false` deployed | Enable service telemetry export. |
| `CLOUDGRID_SELF_OBSERVABILITY_COMPANY_ID` | `local` in local | Required in deployed when enabled. |
| `CLOUDGRID_SELF_OBSERVABILITY_PROJECT_ID` | `cloudgrid-system` | Project receiving CloudGrid telemetry. |
| `CLOUDGRID_SELF_OBSERVABILITY_OTLP_ENDPOINT` | `http://localhost:4318` local | Required in deployed when enabled. |
| `CLOUDGRID_SELF_OBSERVABILITY_OTLP_BEARER_TOKEN` | unset | Required in deployed and local token mode. |
| `CLOUDGRID_SELF_OBSERVABILITY_EXPORT_INTERVAL_SECONDS` | `10` | `1..300`. |
| `CLOUDGRID_SELF_OBSERVABILITY_TRACES_ENABLED` | `true` when enabled | Trace export toggle. |
| `CLOUDGRID_SELF_OBSERVABILITY_LOGS_ENABLED` | `true` when enabled | Log export toggle. |
| `CLOUDGRID_SELF_OBSERVABILITY_METRICS_ENABLED` | `true` when enabled | Metric export toggle. |

## Storage And Control-Plane

| Variable | Default | Notes |
| --- | --- | --- |
| `CLOUDGRID_SURREALDB_URL` | `http://localhost:8000/rpc` | Storage/control-plane only. |
| `CLOUDGRID_SURREALDB_NAMESPACE` | `observability` | SurrealDB namespace. |
| `CLOUDGRID_SURREALDB_DATABASE` | `dev` | SurrealDB database. |
| `CLOUDGRID_SURREALDB_USERNAME` | local `root` | Do not expose publicly. |
| `CLOUDGRID_SURREALDB_PASSWORD` | local `root` | Do not expose publicly. |
| `CLOUDGRID_STORAGE_READ_MAX_METRIC_POINTS` | `5000` | Maximum metric points in one response. |
| `CLOUDGRID_STORAGE_READ_QUERY_TIMEOUT_MS` | `1500` | Query timeout applied by storage-read before SurrealDB calls. |
| `CLOUDGRID_STORAGE_READ_MAX_PAGE_SIZE` | `200` | Maximum trace/log/facet page size. |
| `CLOUDGRID_LIVE_MAX_SUBSCRIPTIONS` | `2000` | Maximum active live trace subscriptions per storage-read process. |
| `CLOUDGRID_LIVE_EVENT_BUFFER_SIZE` | `100` | Configured per-subscription live event buffer size for bounded live delivery. |
| `CLOUDGRID_STORAGE_WRITE_HEALTH_HOST` | `0.0.0.0` | storage-write health bind host. |
| `CLOUDGRID_STORAGE_WRITE_HEALTH_PORT` | `8082` | storage-write health port. |
| `CLOUDGRID_STORAGE_MAINTENANCE_HEALTH_HOST` | `0.0.0.0` | storage-maintenance health bind host. |
| `CLOUDGRID_STORAGE_MAINTENANCE_HEALTH_PORT` | `8087` | storage-maintenance health port. |
| `CLOUDGRID_RETENTION_SCHEDULER_ENABLED` | `false` | Enables scheduled retention batches in storage-maintenance. |
| `CLOUDGRID_RETENTION_SCHEDULER_INTERVAL_SECONDS` | `3600` | Retention scheduler tick cadence, 300..86400. |
| `CLOUDGRID_RETENTION_SCHEDULER_PROJECT_IDS` | unset | Required comma-separated project IDs when the retention scheduler is enabled. |
| `CLOUDGRID_RETENTION_BATCH_LIMIT` | `1000` | Maximum rows processed per scheduled project/data-class batch. |
| `CLOUDGRID_RETENTION_LEASE_SECONDS` | `900` | Lease duration for project/data-class scheduler ownership. |

Storage-read uses the live buffer setting to bound per-subscription publish work. A live subscription is dropped with retryable `ERR-014` when its delivery path stalls or its buffer is full.

## AI Evaluation

| Variable | Default | Notes |
| --- | --- | --- |
| `CLOUDGRID_AI_EVAL_ENABLED` | `false` | Enables AI evaluation surfaces and runner integration. |
| `CLOUDGRID_AI_EVAL_RUNNER_HEALTH_HOST` | `0.0.0.0` | Runner health bind host. |
| `CLOUDGRID_AI_EVAL_RUNNER_HEALTH_PORT` | `8085` | Runner health port. |
| `CLOUDGRID_AI_EVAL_HARNESS_URL` | unset | Required when AI eval uses a harness adapter. |

See [.env.example](../../.env.example) for the current example file.
