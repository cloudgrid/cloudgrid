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

## Go OTLP Collector Variables

- `CLOUDGRID_OTLP_HOST`, default `0.0.0.0`.
- `CLOUDGRID_OTLP_PORT`, default `4318`.
- `CLOUDGRID_OTLP_LOCAL_PROJECT_ID`, optional single-project local ingest target used only in local mode when no project-token map is configured.
- `CLOUDGRID_OTLP_LOCAL_PROJECT_TOKENS`, optional JSON object mapping opaque bearer tokens to local project IDs. Token keys must be at least 32 characters. When set, local OTLP requests require `Authorization: Bearer <token>`.
- `CLOUDGRID_OTLP_MAX_METRIC_POINTS_PER_REQUEST`, default `20000`; rejects oversized metric exports before publish.
- `CLOUDGRID_AUTH_MODE`, default `local`; allowed values are `local` and `sso`.
- Bearer-token issuer, audience, and JWKS configuration is still provider-specific in deployed mode. The collector must use trusted service-token configuration only and must not infer browser SSO company/project access from provider profile claims.

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

## Performance And Scaling Variables

The next scaling wave owns the typed variables in `06-nfr/performance-and-scaling.md`. Until that wave implements them, services must ignore unknown scaling variables rather than partially applying them. Implementation agents must add runtime parsing, documentation, tests, and acceptance behavior in the same commit that first uses any scaling variable.
