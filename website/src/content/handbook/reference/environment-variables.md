---
title: "Environment Variables"
description: "This table summarizes the current CloudGrid runtime variables. See Runtime environment../configuration/runtime-environment.md for validation context."
order: 2
accent: rose
eyebrow: "Handbook - Reference"
updated: 2026-05-31
---

This table summarizes the current CloudGrid runtime variables. See [Runtime environment](/handbook/configuration/runtime-environment) for validation context.

## Shared

| Variable | Default | Notes |
| --- | --- | --- |
| `CLOUDGRID_IMAGE_REGISTRY` | `ghcr.io/cloudgrid-dev` in release Compose | OCI image registry for release Compose. |
| `CLOUDGRID_IMAGE_TAG` | current release tag | OCI image tag for release Compose. |
| `CLOUDGRID_DEPLOYMENT_MODE` | `local` | `local` or `deployed`. |
| `CLOUDGRID_AUTH_MODE` | `local` | `local` or `sso`; must match deployment mode. |
| `CLOUDGRID_NATS_URL` | `nats://localhost:4222` | Private message bridge. |
| `CLOUDGRID_NATS_MAX_PAYLOAD` | `8388608` | Local Compose and bundled chart NATS payload limit; external NATS must be at least as high as `CLOUDGRID_OTLP_MAX_REQUEST_BYTES`. |
| `CLOUDGRID_STORAGE_ADAPTER` | `surrealdb` | Must match compiled Go adapter. |
| `CLOUDGRID_LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `warning`, or `error`. Keep production at `info` unless diagnosing a specific issue. |
| `CLOUDGRID_PROVIDER_SECRET_ENCRYPTION_KEY` | local development key | Stable control-plane key material for encrypted managed AI provider secrets. Required in deployed mode before storing or resolving production provider API keys. Mount only into control-plane. |

## BFF And Frontend

| Variable | Default | Notes |
| --- | --- | --- |
| `CLOUDGRID_BFF_HOST` | `0.0.0.0` | BFF bind host. |
| `CLOUDGRID_BFF_PORT` | `3000` | BFF port. |
| `CLOUDGRID_MESSAGE_BRIDGE_REQUEST_TIMEOUT_MS` | `12000` | BFF request/reply timeout for private NATS subjects. Keep this above `CLOUDGRID_STORAGE_READ_QUERY_TIMEOUT_MS` so storage-read can return bounded query failures instead of client-side bridge timeouts. |
| `CLOUDGRID_FRONTEND_DEV_PORT` | `5173` | Vite dev server port. |
| `CLOUDGRID_FRONTEND_SERVE_STATIC` | `false` in dev | BFF serves built frontend when true. |
| `CLOUDGRID_FRONTEND_STATIC_DIR` | `./apps/backend/public` | Static frontend directory. |
| `CLOUDGRID_PUBLIC_URL` | unset | External browser base URL used in invitation emails. |
| `CLOUDGRID_AI_CHAT_ENABLED` | `false` | Enables the BFF AI Chat runtime and route. |
| `VITE_CLOUDGRID_AI_CHAT_ENABLED` | unset | Frontend build-time override; set to `false` to hide the route. |
| `CLOUDGRID_AI_CHAT_HARNESS_MODE` | `provider` | BFF AI Chat harness runtime. `provider` uses configured company credentials, `mock` is only for local smoke checks, and `off` disables execution. |
| `CLOUDGRID_AI_CHAT_PROVIDER_KIND` | unset | Optional local-mode bootstrap provider kind. |
| `CLOUDGRID_AI_CHAT_MODEL` | unset | Required when local-mode AI Chat provider bootstrap is enabled. |
| `CLOUDGRID_AI_CHAT_BASE_URL` | unset | Required for local-mode `openai_compatible` and `azure_foundry` bootstrap providers. For Kimi K2.6 via Moonshot, use `https://api.moonshot.ai/v1`. |
| `CLOUDGRID_AI_CHAT_CREDENTIAL_REF` | unset | Optional local-mode bootstrap credential reference for the configured AI Chat provider. UI-managed providers normally use encrypted `managed:` refs instead. |

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
| `CLOUDGRID_OTLP_GRPC_ADDR` | `0.0.0.0:4317` | OTLP/gRPC bind address. |
| `CLOUDGRID_OTLP_MAX_REQUEST_BYTES` | `4194304` | HTTP body limit. |
| `CLOUDGRID_OTLP_GRPC_MAX_MESSAGE_BYTES` | HTTP body limit | gRPC message limit. |
| `CLOUDGRID_OTLP_GRPC_COMPRESSION` | `gzip` | `gzip` or `none`. |
| `CLOUDGRID_OTLP_LOCAL_PROJECT_ID` | `default` | Single-project local fallback. |
| `CLOUDGRID_OTLP_LOCAL_PROJECT_TOKENS` | unset | JSON bearer-token-to-project map. |
| `CLOUDGRID_OTLP_MAX_SPANS_PER_REQUEST` | `10000` | Reject oversized trace exports before publish. |
| `CLOUDGRID_OTLP_MAX_LOGS_PER_REQUEST` | `10000` | Reject oversized log exports before publish. |
| `CLOUDGRID_OTLP_MAX_METRIC_POINTS_PER_REQUEST` | `20000` | Reject oversized metric exports before publish. |
| `CLOUDGRID_OTLP_PUBLISH_TIMEOUT_MS` | `1000` | Collector NATS publish timeout. |
| `CLOUDGRID_PROJECT_STATUS_CACHE_TTL_SECONDS` | `60` | Fresh project-status authorization cache lifetime in deployed collector mode. |
| `CLOUDGRID_PROJECT_STATUS_CACHE_STALE_SECONDS` | `120` | Stale project-status cache reuse window during temporary control-plane failures. |
| `CLOUDGRID_AUTH_ISSUER` | unset | Required by the collector when `CLOUDGRID_AUTH_MODE=sso`; trusted issuer for OTLP ingest bearer tokens. |
| `CLOUDGRID_AUTH_AUDIENCE` | unset | Required by the collector when `CLOUDGRID_AUTH_MODE=sso`; expected audience for OTLP ingest bearer tokens. |
| `CLOUDGRID_AUTH_JWKS_URL` | unset | Required by the collector when `CLOUDGRID_AUTH_MODE=sso`; JWKS endpoint for OTLP ingest bearer-token signatures. |

## Self-Observability

| Variable | Default | Notes |
| --- | --- | --- |
| `CLOUDGRID_SELF_OBSERVABILITY_ENABLED` | `true` local, `false` deployed | Enable service telemetry export. |
| `CLOUDGRID_SELF_OBSERVABILITY_COMPANY_ID` | `local` in local | Required in deployed when enabled. |
| `CLOUDGRID_SELF_OBSERVABILITY_PROJECT_ID` | `cloudgrid-system` | Project receiving CloudGrid telemetry. |
| `CLOUDGRID_SELF_OBSERVABILITY_OTLP_ENDPOINT` | `http://localhost:4318` local | Required in deployed when enabled. |
| `CLOUDGRID_SELF_OBSERVABILITY_OTLP_BEARER_TOKEN` | unset | Required whenever self-observability is enabled; in local mode it must map to `cloudgrid-system`. |
| `CLOUDGRID_SELF_OBSERVABILITY_EXPORT_INTERVAL_SECONDS` | `10` | `1..300`. |
| `CLOUDGRID_SELF_OBSERVABILITY_TRACES_ENABLED` | `true` when enabled | Trace export toggle. |
| `CLOUDGRID_SELF_OBSERVABILITY_LOGS_ENABLED` | `true` when enabled | Log export toggle. |
| `CLOUDGRID_SELF_OBSERVABILITY_METRICS_ENABLED` | `true` when enabled | Metric export toggle. |
| `CLOUDGRID_DB_ADAPTER_TRACING_ENABLED` | `false` | Local-only deep regular database adapter child spans. A true value is rejected in deployed mode. Raw queries, parameters, responses, provider errors, credentials, and secret-store operations are never exported. |

## Benchmark Evidence

| Variable | Default | Notes |
| --- | --- | --- |
| `CLOUDGRID_ENABLE_BENCHMARKS` | unset | Must be `true` to run benchmark probes. |
| `CLOUDGRID_BENCH_DEPLOYMENT_PROFILE` | `local` | Must be `production-like` for production benchmark profiles. |
| `CLOUDGRID_BENCH_ENVIRONMENT_ID` | `local` | Required for production benchmark profiles. Identifies the promoted environment in the JSON result. |
| `CLOUDGRID_BENCH_IMAGE_TAG` | `local` | Required for production benchmark profiles. Identifies the release image in the JSON result. |
| `CLOUDGRID_BENCH_GRAPHQL_URL` | unset | Required for read and combined benchmark profiles. |
| `CLOUDGRID_BENCH_OTLP_TRACES_URL` | unset | Required for ingest and combined benchmark profiles. |
| `CLOUDGRID_BENCH_OTLP_BEARER_TOKEN` | unset | Optional ingest credential for benchmark OTLP probes. |
| `CLOUDGRID_BENCH_REQUESTS` | `1` | Integer `1..1000`. |
| `CLOUDGRID_BENCH_REQUIRED` | unset | Set to `true` to fail the command when thresholds fail. |

## Storage And Control-Plane

| Variable | Default | Notes |
| --- | --- | --- |
| `CLOUDGRID_SURREALDB_URL` | `http://localhost:8000/rpc` | Storage/control-plane only. |
| `CLOUDGRID_SURREALDB_PORT` | `8000` | Local Docker Compose host port for SurrealDB. `bun run setup:local` selects a free port and rewrites `CLOUDGRID_SURREALDB_URL` when the default is occupied. |
| `CLOUDGRID_SURREALDB_NAMESPACE` | `observability` | SurrealDB namespace. |
| `CLOUDGRID_SURREALDB_DATABASE` | `dev` | SurrealDB database. |
| `CLOUDGRID_SURREALDB_USERNAME` | local `root` | Do not expose publicly. |
| `CLOUDGRID_SURREALDB_PASSWORD` | local `root` | Do not expose publicly. |
| `CLOUDGRID_STORAGE_READ_MAX_METRIC_POINTS` | `5000` | Maximum metric points in one response. |
| `CLOUDGRID_STORAGE_READ_QUERY_TIMEOUT_MS` | `10000` | Single storage-read request deadline for trace, log, metric, facet, live-notification, and AI-eval read handlers. |
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
