---
id: TEC-BE-005
title: Runtime configuration
layer: backend
status: draft
owner: unknown@example.com
updated: 2026-05-08
provenance: inferred-draft
---

# Runtime Configuration

## Shared Environment Variables

- `CLOUDGRID_NATS_URL`, default `nats://localhost:4222`.
- `CLOUDGRID_DEPLOYMENT_MODE`, default `local`; allowed values are `local` and `deployed`.
- `CLOUDGRID_LOG_LEVEL`, default `info`; allowed values are `debug`, `info`, `warn`, `warning`, and `error`. Successful hot-path completion events are debug-only.
- `CLOUDGRID_SELF_OBSERVABILITY_ENABLED`, default `true` when `CLOUDGRID_DEPLOYMENT_MODE=local`, default `false` when `CLOUDGRID_DEPLOYMENT_MODE=deployed`.
- `CLOUDGRID_SELF_OBSERVABILITY_PROJECT_ID`, default `cloudgrid-system`.
- `CLOUDGRID_SELF_OBSERVABILITY_COMPANY_ID`, default `local` in local mode; required when self-observability is enabled in deployed mode.
- `CLOUDGRID_SELF_OBSERVABILITY_OTLP_ENDPOINT`, default `http://localhost:4318` in local mode; required when self-observability is enabled in deployed mode.
- `CLOUDGRID_SELF_OBSERVABILITY_OTLP_BEARER_TOKEN`, required whenever self-observability is enabled. In local mode it must be a token mapped to the configured self-observability project by `CLOUDGRID_OTLP_LOCAL_PROJECT_TOKENS`.
- `CLOUDGRID_SELF_OBSERVABILITY_EXPORT_INTERVAL_SECONDS`, default `10`; minimum `1`, maximum `300`.
- `CLOUDGRID_SELF_OBSERVABILITY_TRACES_ENABLED`, default `true` when self-observability is enabled.
- `CLOUDGRID_SELF_OBSERVABILITY_LOGS_ENABLED`, default `true` when self-observability is enabled.
- `CLOUDGRID_SELF_OBSERVABILITY_METRICS_ENABLED`, default `true` when self-observability is enabled.

## TypeScript BFF Variables

- `CLOUDGRID_BFF_HOST`, default `0.0.0.0`.
- `CLOUDGRID_BFF_PORT`, default `3000`.
- `CLOUDGRID_FRONTEND_SERVE_STATIC`, default `true` when `NODE_ENV=production`, otherwise `false`.
- `CLOUDGRID_FRONTEND_STATIC_DIR`, default `./apps/backend/public`.
- `CLOUDGRID_AUTH_MODE`, default `local`; allowed values are `local` and `sso`.
- `CLOUDGRID_AUTH_PROVIDERS`, required when `CLOUDGRID_AUTH_MODE=sso`; comma-separated subset of `github`, `google`, and `azure`.
- `CLOUDGRID_AUTH_COMPANY_ID`, required for deployed browser SSO until dynamic tenant provisioning contracts exist.
- `CLOUDGRID_AUTH_GITHUB_CLIENT_ID`, required when GitHub is enabled.
- `CLOUDGRID_AUTH_GITHUB_CLIENT_SECRET`, required when GitHub is enabled.
- `CLOUDGRID_AUTH_GITHUB_REDIRECT_URI`, required when GitHub is enabled.
- `CLOUDGRID_AUTH_GOOGLE_ISSUER`, required when Google is enabled.
- `CLOUDGRID_AUTH_GOOGLE_AUDIENCE`, optional; defaults to Google client ID when omitted.
- `CLOUDGRID_AUTH_GOOGLE_JWKS_URL`, optional; defaults to Google's public JWKS endpoint.
- `CLOUDGRID_AUTH_GOOGLE_CLIENT_ID`, required when Google is enabled.
- `CLOUDGRID_AUTH_GOOGLE_CLIENT_SECRET`, required when Google is enabled.
- `CLOUDGRID_AUTH_GOOGLE_REDIRECT_URI`, required when Google is enabled.
- `CLOUDGRID_AUTH_AZURE_ISSUER`, required when Azure is enabled.
- `CLOUDGRID_AUTH_AZURE_AUDIENCE`, optional; defaults to Azure client ID when omitted.
- `CLOUDGRID_AUTH_AZURE_JWKS_URL`, optional; defaults to the Azure tenant JWKS endpoint derived from issuer.
- `CLOUDGRID_AUTH_AZURE_CLIENT_ID`, required when Azure is enabled.
- `CLOUDGRID_AUTH_AZURE_CLIENT_SECRET`, required when Azure is enabled.
- `CLOUDGRID_AUTH_AZURE_REDIRECT_URI`, required when Azure is enabled.
- `CLOUDGRID_SESSION_SECRET`, required when `CLOUDGRID_AUTH_MODE=sso`; used only by the BFF for session-cookie integrity/encryption.
- `CLOUDGRID_SESSION_TTL_SECONDS`, default `28800`.
- `CLOUDGRID_PUBLIC_URL`, required in deployed mode when invitation email delivery is enabled; external browser base URL used in invitation emails.
- `CLOUDGRID_AI_CHAT_ENABLED`, default `false`; enables the BFF AI Chat route,
  stream endpoint, GraphQL chat operations, and frontend navigation.
- `CLOUDGRID_AI_CHAT_TRACING_ENABLED`, default `true` in local mode and `false`
  in deployed mode.
- `CLOUDGRID_AI_CHAT_HARNESS_MODE`, default `provider`; allowed values are
  `provider`, `mock`, and `off`. `provider` executes the configured AI provider
  with the request-time credential resolved from `managed:` or `env:` refs.
  `mock` is only for local smoke checks and automated integration tests.
- `CLOUDGRID_AI_CHAT_PROVIDER_KIND`, optional local-mode bootstrap provider
  kind: `anthropic`, `openai`, `azure_foundry`, `aws_bedrock`, or
  `openai_compatible`.
- `CLOUDGRID_AI_CHAT_MODEL`, required when local-mode AI Chat provider bootstrap
  is used.
- `CLOUDGRID_AI_CHAT_CREDENTIAL_REF`, required when local-mode AI Chat provider
  bootstrap is used. It must use `env:<NAME>` or `external:<provider>/<path>`.
- `CLOUDGRID_AI_CHAT_BASE_URL`, required for local-mode `azure_foundry` and
  `openai_compatible` bootstrap providers.
- `CLOUDGRID_AI_CHAT_AZURE_DEPLOYMENT`, required for local-mode
  `azure_foundry` bootstrap providers.
- `CLOUDGRID_AI_CHAT_AWS_REGION`, required for local-mode `aws_bedrock`
  bootstrap providers.
- `CLOUDGRID_AI_CHAT_SANDBOX_MAX_INPUT_BYTES`, default `104857600`.
- `CLOUDGRID_AI_CHAT_SANDBOX_MAX_ARTIFACT_BYTES`, default `52428800`.

## Invitation Email Variables

Control-plane owns invitation email delivery configuration because it owns
organization invitations, project invitation grants, and the email outbox.

- `CLOUDGRID_INVITATION_EMAIL_MODE`, allowed values `disabled` and `smtp`; default `disabled` in local mode and `smtp` in deployed SSO mode.
- `CLOUDGRID_INVITATION_EMAIL_REQUIRE_DELIVERY`, boolean; default `false` in local mode and `true` in deployed SSO mode.
- `CLOUDGRID_INVITATION_EMAIL_FROM`, required when email mode is `smtp`.
- `CLOUDGRID_INVITATION_EMAIL_REPLY_TO`, optional.
- `CLOUDGRID_INVITATION_EMAIL_SMTP_HOST`, required when email mode is `smtp`.
- `CLOUDGRID_INVITATION_EMAIL_SMTP_PORT`, required when email mode is `smtp`.
- `CLOUDGRID_INVITATION_EMAIL_SMTP_USERNAME`, optional unless the SMTP server requires auth.
- `CLOUDGRID_INVITATION_EMAIL_SMTP_PASSWORD`, optional unless the SMTP server requires auth.
- `CLOUDGRID_INVITATION_EMAIL_SMTP_TLS`, allowed values `starttls`, `tls`, and `none`; default `starttls` in deployed mode.
- `CLOUDGRID_INVITATION_EMAIL_SMTP_TIMEOUT_MS`, default `10000`; minimum `1000`, maximum `60000`.
- `CLOUDGRID_INVITATION_EMAIL_MAX_ATTEMPTS`, default `5`; minimum `1`, maximum `20`.
- `CLOUDGRID_INVITATION_EMAIL_RETRY_BASE_SECONDS`, default `60`; minimum `5`, maximum `3600`.

In deployed SSO mode, `disabled` invitation email mode is allowed only when
`CLOUDGRID_INVITATION_EMAIL_REQUIRE_DELIVERY=false`. This is for private
operator testing and must surface `suppressed` delivery status in admin UI.

## Go OTLP Collector Variables

- `CLOUDGRID_OTLP_HTTP_ADDR`, default `0.0.0.0:4318`.
- `CLOUDGRID_OTLP_GRPC_ADDR`, default `0.0.0.0:4317`.
- `CLOUDGRID_OTLP_LOCAL_PROJECT_ID`, optional single-project local ingest target used only in local mode when no project-token map is configured.
- `CLOUDGRID_OTLP_LOCAL_PROJECT_TOKENS`, optional JSON object mapping opaque bearer tokens to local project IDs. Token keys must be at least 32 characters. When set, local OTLP requests require `Authorization: Bearer <token>`.
- `CLOUDGRID_OTLP_MAX_REQUEST_BYTES`, default `4194304`; rejects oversized OTLP/HTTP exports before decoding.
- `CLOUDGRID_OTLP_GRPC_MAX_MESSAGE_BYTES`, default equal to `CLOUDGRID_OTLP_MAX_REQUEST_BYTES`; rejects oversized OTLP/gRPC exports before decoding.
- `CLOUDGRID_OTLP_GRPC_COMPRESSION`, default `gzip`; allowed values are `gzip` and `none`.
- `CLOUDGRID_OTLP_MAX_SPANS_PER_REQUEST`, default `10000`; rejects oversized trace exports before publish.
- `CLOUDGRID_OTLP_MAX_LOGS_PER_REQUEST`, default `10000`; rejects oversized log exports before publish.
- `CLOUDGRID_OTLP_MAX_METRIC_POINTS_PER_REQUEST`, default `20000`; rejects oversized metric exports before publish.
- `CLOUDGRID_OTLP_PUBLISH_TIMEOUT_MS`, default `1000`; bounds collector NATS publish attempts.
- `CLOUDGRID_PROJECT_STATUS_CACHE_TTL_SECONDS`, default `60`; bounds fresh project-status authorization cache entries in deployed collector mode.
- `CLOUDGRID_PROJECT_STATUS_CACHE_STALE_SECONDS`, default `120`; bounds stale project-status cache reuse during temporary control-plane failures.
- `CLOUDGRID_AUTH_MODE`, default `local`; allowed values are `local` and `sso`.
- `CLOUDGRID_AUTH_ISSUER`, required by the collector when `CLOUDGRID_AUTH_MODE=sso`; trusted issuer for OTLP ingest bearer tokens.
- `CLOUDGRID_AUTH_AUDIENCE`, required by the collector when `CLOUDGRID_AUTH_MODE=sso`; expected audience for OTLP ingest bearer tokens.
- `CLOUDGRID_AUTH_JWKS_URL`, required by the collector when `CLOUDGRID_AUTH_MODE=sso`; JWKS endpoint used to validate OTLP ingest bearer-token signatures.

Collector bearer-token issuer, audience, and JWKS configuration is service-token
configuration. The collector must not infer browser SSO company/project access
from provider profile claims or browser SSO provider client settings.

### Local OTLP Token Initialization

Local multi-project development is initialized by `bun run setup:local`.

The command owns only local developer convenience configuration:

- It creates or updates `.env` in the repository root.
- It generates opaque URL-safe bearer tokens with at least 32 bytes of entropy.
- It writes `CLOUDGRID_OTLP_LOCAL_PROJECT_TOKENS` as JSON mapping token values
  to project IDs.
- It must include mappings for `default` and `cloudgrid-system`.
- It writes `CLOUDGRID_OTLP_LOCAL_PROJECT_ID=default` for explicit
  single-project fallback.
- It writes `CLOUDGRID_PROJECT_API_KEY` to the token mapped to `default` for
  local fixture scripts and examples. Fixture scripts also accept
  `CLOUDGRID_OTLP_BEARER_TOKEN` when a caller wants a command-specific token.
- It writes `CLOUDGRID_SELF_OBSERVABILITY_PROJECT_ID=cloudgrid-system`,
  `CLOUDGRID_SELF_OBSERVABILITY_COMPANY_ID=local`, and
  `CLOUDGRID_SELF_OBSERVABILITY_OTLP_BEARER_TOKEN` to the token mapped to
  `cloudgrid-system`.

The command is idempotent: when existing valid mappings for `default` and
`cloudgrid-system` are present, it preserves those token values. Rotation, if
added, must be an explicit flag and must be documented before implementation.
The command must not print full token values to stdout or logs.

## Go Storage Service Variables

- `CLOUDGRID_STORAGE_ADAPTER`, default `surrealdb`. The configured value must match the adapter compiled into the storage service binary. The MVP SurrealDB build uses `go build -tags surrealdb` or `go run -tags surrealdb`.
- `CLOUDGRID_STORAGE_READ_MAX_METRIC_POINTS`, default `5000`; maximum metric points returned by one GraphQL metric series query.
- `CLOUDGRID_SURREALDB_URL`, required.
- `CLOUDGRID_SURREALDB_NAMESPACE`, default `observability`.
- `CLOUDGRID_SURREALDB_DATABASE`, default `dev`.
- `CLOUDGRID_SURREALDB_USERNAME`, optional.
- `CLOUDGRID_SURREALDB_PASSWORD`, optional.

## Validation

Each service validates only its owned config before startup. Validation failure blocks startup with ERR-009. Root/default verification commands must use `CLOUDGRID_DEPLOYMENT_MODE=local` and `CLOUDGRID_AUTH_MODE=local` or unset auth variables; real SSO integration tests are opt-in and must not run from default CI.

Invalid combinations:

- `CLOUDGRID_DEPLOYMENT_MODE=local` with `CLOUDGRID_AUTH_MODE=sso`.
- `CLOUDGRID_DEPLOYMENT_MODE=deployed` with `CLOUDGRID_AUTH_MODE=local`.
- `CLOUDGRID_AUTH_MODE=sso` without `CLOUDGRID_AUTH_PROVIDERS`.
- `CLOUDGRID_AUTH_MODE=sso` with an enabled provider missing required `CLOUDGRID_AUTH_<PROVIDER>_*` values.
- Collector `CLOUDGRID_AUTH_MODE=sso` without `CLOUDGRID_AUTH_ISSUER`,
  `CLOUDGRID_AUTH_AUDIENCE`, or `CLOUDGRID_AUTH_JWKS_URL`.
- `CLOUDGRID_DEPLOYMENT_MODE=deployed` with invitation email mode `smtp` and missing `CLOUDGRID_PUBLIC_URL`, sender, or required SMTP host/port values.
- `CLOUDGRID_DEPLOYMENT_MODE=deployed` with invitation email mode `disabled` and `CLOUDGRID_INVITATION_EMAIL_REQUIRE_DELIVERY=true`.
- `CLOUDGRID_DEPLOYMENT_MODE=deployed` with `CLOUDGRID_SELF_OBSERVABILITY_ENABLED=true` and missing `CLOUDGRID_SELF_OBSERVABILITY_COMPANY_ID`, `CLOUDGRID_SELF_OBSERVABILITY_PROJECT_ID`, `CLOUDGRID_SELF_OBSERVABILITY_OTLP_ENDPOINT`, or `CLOUDGRID_SELF_OBSERVABILITY_OTLP_BEARER_TOKEN`.
- `CLOUDGRID_SELF_OBSERVABILITY_EXPORT_INTERVAL_SECONDS` outside `1..300`.
- `CLOUDGRID_AI_CHAT_ENABLED=true` with malformed AI Chat sandbox byte limits.
- Any `CLOUDGRID_AI_CHAT_PROVIDER_KIND` outside the supported provider kinds.
- Local-mode AI Chat provider bootstrap with missing provider-specific required
  fields.

## Performance And Scaling Variables

The next scaling wave owns the typed variables in `06-nfr/performance-and-scaling.md`. Until that wave implements them, services must ignore unknown scaling variables rather than partially applying them. Implementation agents must add runtime parsing, documentation, tests, and acceptance behavior in the same commit that first uses any scaling variable.
