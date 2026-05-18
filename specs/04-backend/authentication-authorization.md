---
id: TEC-BE-009
title: Authentication and authorization model
layer: backend
status: draft
owner: unknown@example.com
updated: 2026-05-11
provenance: inferred-standard
---

# Authentication And Authorization Model

This spec defines the production auth shape. Implementation agents must follow
these boundaries instead of inventing auth modes, token formats, trust rules, or
service-specific policy engines. Local mode keeps auth enforcement disabled only
for single-instance development.

## Modes

CloudGrid supports exactly these auth modes:

- `local`: local single-instance mode. No login is shown or required. CloudGrid creates or assumes exactly one local company and supports multiple projects inside it. Runtime code may emit `AuthContext.mode = "anonymous"` and must treat tenant/company/project context as local defaults until a project is selected.
- `sso`: deployed mode. Browser users authenticate through BFF-owned SSO authorization-code + PKCE. The BFF stores the authenticated browser session in an HttpOnly, Secure, SameSite=Lax cookie. Machine/API callers may use `Authorization: Bearer <jwt>`.

No other auth mode, cookie session format, API key format, or policy engine may be added without updating this spec, `runtime-config.schema.json`, `message-bridge.asyncapi.yaml`, and `errors.yaml`.

## Deployment Modes

The deployment mode is selected by `CLOUDGRID_DEPLOYMENT_MODE`:

- `local`: single running instance, no login, one local company, multiple projects, all local users are treated as admins if a local user context is needed.
- `deployed`: login required, multiple companies, SSO identities, centralized company/user/project management.

`CLOUDGRID_AUTH_MODE` must be `local` when deployment mode is `local` and `sso` when deployment mode is `deployed`.

## Browser Login

The frontend login page is a route shell only. It does not collect usernames or passwords and does not store OAuth tokens. It starts the BFF SSO login flow:

1. Browser visits `/login`.
2. Frontend shows separate SSO provider buttons for GitHub, Google, and Microsoft Azure Entra ID. Each button links to BFF `GET /auth/login?provider=<provider>&returnTo=<relative-path>`.
3. BFF creates PKCE verifier, CSRF state, nonce, and short-lived login transaction cookie.
4. Browser is redirected to the configured SSO provider.
5. Provider redirects to `GET /auth/callback`.
6. BFF validates state, nonce, issuer, audience, signature, expiry, and PKCE.
7. BFF stores a server-side session keyed by an opaque session ID in an HttpOnly cookie.
8. Browser returns to the original relative route or `/projects`.

Logout uses `POST /auth/logout` and clears the session cookie. The BFF may also redirect to provider logout when configured, but local session clearing is mandatory.

Supported SSO providers:

- GitHub OAuth App web application flow.
- Google OIDC.
- Microsoft Azure Entra ID OIDC.

The implementation must normalize provider-specific profile claims into CloudGrid `User` fields and must not expose provider tokens to the frontend.

Deployed SSO configuration enables one or more providers with:

- `CLOUDGRID_AUTH_PROVIDERS`: comma-separated provider IDs from `github`, `google`, and `azure`.
- `CLOUDGRID_AUTH_<PROVIDER>_CLIENT_ID`.
- `CLOUDGRID_AUTH_<PROVIDER>_CLIENT_SECRET` when the provider requires a confidential client secret.
- `CLOUDGRID_AUTH_<PROVIDER>_REDIRECT_URI`.
- `CLOUDGRID_AUTH_<PROVIDER>_ISSUER`, `CLOUDGRID_AUTH_<PROVIDER>_AUDIENCE`, and optional `CLOUDGRID_AUTH_<PROVIDER>_JWKS_URL` for OIDC providers.
- `CLOUDGRID_AUTH_COMPANY_ID` for the deployment-owned initial company boundary until organization provisioning contracts define dynamic tenant routing.

The BFF rejects login attempts for providers not named in `CLOUDGRID_AUTH_PROVIDERS`. Provider access tokens and ID tokens are exchanged and validated only inside the BFF. The BFF stores only the CloudGrid session and forwards `AuthContext.principalId`, `principalDisplayName`, `principalEmail`, and configured `companyId` to the control-plane bridge.

## GraphQL Auth

GraphQL HTTP requests and GraphQL WebSocket connection initialization are authenticated by the BFF in this order:

1. Same-origin HttpOnly session cookie.
2. `Authorization: Bearer <jwt>` for machine/API callers.

The frontend must not place access tokens in localStorage, sessionStorage, IndexedDB, URL parameters, or GraphQL variables. GraphQL WebSocket clients rely on the same-origin cookie by default. If Bearer mode is used for a non-browser client, the token is sent in `connection_init` payload field `authorization`.

`Query.viewer`, organization/project queries, telemetry reads, and `Subscription.liveTraces` require an authenticated viewer when `CLOUDGRID_AUTH_MODE=sso`.

## Token Validation

In `sso` mode, the BFF validates session tokens and the OTLP collector validates bearer JWTs with the same claim rules:

- `iss` must equal the configured issuer for the selected provider.
- `aud` must include the service audience from `CLOUDGRID_AUTH_AUDIENCE` or the configured client ID where the provider uses client ID as audience.
- Signature must validate against `CLOUDGRID_AUTH_JWKS_URL` or the OIDC discovery JWKS URI.
- `exp`, `nbf`, and `iat` are enforced with at most 60 seconds clock skew.
- `sub` is required and becomes `AuthContext.principalId`.
- `scope` may be a space-delimited string or array and is normalized into `AuthContext.scopes`.
Company/project access for browser users is resolved through the control plane, not trusted directly from provider claims. The configured deployment company ID is trusted runtime configuration, not a provider claim. The first SSO user for an empty configured company becomes company admin so the deployment can bootstrap member administration. Later SSO users are created as CloudGrid users but only gain company access through existing company membership or a pending organization invitation accepted by verified email. Invitation acceptance and lifecycle rules are defined in [Organization invitations and SSO membership lifecycle](./organization-invitations.md). Machine ingest tokens may carry `company_id` and `project_id` claims only when the issuer is configured as trusted for service tokens.

The implementation must not trust tenant or project values from GraphQL inputs, URL parameters, headers other than the validated bearer token, or OTLP resource attributes.

## Scope Model

Scopes are runtime-enforceable permissions, not UI labels:

- `telemetry:read`: query trace, log, and facet data.
- `telemetry:live`: open live telemetry subscriptions.
- `telemetry:ingest:traces`: ingest OTLP traces.
- `telemetry:ingest:logs`: ingest OTLP logs.
- `telemetry:ingest:metrics`: ingest OTLP metrics.

Read operations require `telemetry:read`. Live subscriptions require both `telemetry:read` and `telemetry:live`. Trace ingestion requires `telemetry:ingest:traces`. Log ingestion requires `telemetry:ingest:logs`. Metrics ingestion requires `telemetry:ingest:metrics`.

## Project Ingest API Keys

Project ingest API keys are opaque bearer credentials managed from the selected
project settings page. A project may have multiple active keys. Each key has a
required human title, fixed all-signal ingest scopes `telemetry:ingest:traces`,
`telemetry:ingest:logs`, and `telemetry:ingest:metrics`, creation metadata,
optional last-used metadata, and optional revocation metadata.

The public GraphQL contract exposes exactly these selected-project operations:

- `Query.ingestCredentials`: lists metadata for keys in the selected project.
- `Mutation.createIngestCredential(input: { title })`: creates a key and returns
  the full secret exactly once in `CreatedIngestCredential.secret`.
- `Mutation.revokeIngestCredential(id)`: revokes one key and returns the updated
  metadata.

There is no v1 rotate mutation. Rotation is intentionally modeled as create a
new key, deploy the new key to emitters, then revoke the old key.

The full secret must never be returned by list, revoke, viewer, project,
organization, telemetry, dashboard, or error responses. Persisted records store
only `secretHash`, not the secret. UI lists show `secretPreview`, which is a
non-sensitive prefix/last-four display value and is not accepted as a bearer
credential.

Creation validation:

- `title` is trimmed, required, and limited to 80 Unicode scalar values.
- Generated secrets use cryptographically secure random bytes and an explicit
  `cgk_` prefix.
- The stored hash is one-way SHA-256 over the full secret for the local MVP.
- The creator is `AuthContext.principalId` or the local user id.

Revocation validation:

- Revoking an unknown key returns ERR-016 without revealing whether the key
  exists in another project.
- Revoking an already revoked key is idempotent and returns existing metadata.
- Revoked keys remain listed with `revokedAt` so users can audit setup history.

## Production Hardening Package

Production auth hardening is implementation-ready when these items are present:

- BFF session validation for GraphQL HTTP, GraphQL WebSocket connection init,
  static app shell requests that require a viewer, and auth route redirects;
- BFF authorization checks for company membership, selected-project membership,
  project admin mutations, company admin mutations, and final-admin safeguards;
- collector bearer validation for deployed ingest tokens and local opaque
  project tokens;
- storage-read enforcement of normalized read/live auth context on every query
  and live registration;
- storage-write persistence of tenant/company/project routing supplied by the
  authorized ingest boundary;
- control-plane membership and invitation checks for organization/project
  membership mutations;
- sanitized errors using `ERR-015` for unauthenticated and `ERR-016` for
  authenticated-but-forbidden cases.

Default tests use signed local JWT fixtures and in-memory JWKS fixtures. Real
OIDC discovery is opt-in only through the test variables listed below.

## Boundary Responsibilities

### BFF

- Validates read credentials in `sso` mode before executing GraphQL queries or subscriptions.
- Builds `BridgeEnvelope.authContext` for every storage-read request.
- Rejects missing or invalid credentials with ERR-015.
- Rejects missing required scopes or unresolved project access with ERR-016.
- Does not make storage query decisions beyond this normalized auth context.

### OTLP Collector

- Validates ingest credentials in `sso` mode before accepting OTLP trace or log payloads.
- Builds `BridgeEnvelope.authContext` or command auth context for storage-write.
- Rejects missing or invalid credentials with ERR-015.
- Rejects missing ingest scopes or unresolved project access with ERR-016.
- Does not infer tenant/project from OTLP resource attributes.

The collector rejects unauthenticated or unauthorized ingest before reading, decoding, normalizing, or publishing the OTLP body. Method, path, content-type, and configured request-size checks may run first because they do not inspect telemetry content.

Bearer validation stays on the collector hot path only:

- deployed JWT validation is local signature and claim validation against cached JWKS material;
- project status authorization uses an in-memory cache, never per-request control-plane or storage calls;
- local project-token configuration is parsed at startup and compared without logging or returning token values;
- token-derived project routing is written only into `AuthContext`, not into telemetry attributes.

### Storage-Read

- Enforces `AuthContext.readAllowed = true` or equivalent normalized read scopes before query execution and live registration in `sso` mode.
- Applies `tenantId` and `projectId` constraints to every trace, log, facet, trace-detail, and live candidate query in tenant-scoped modes.
- Revalidates live subscription auth context before emitting events when auth context is present.

### Storage-Write

- Persists tenant/project ownership metadata supplied by the validated ingest boundary.
- Does not evaluate read authorization.
- Publishes post-persist notifications with trace IDs plus tenant/project routing hints only.

## Local Defaults

When `CLOUDGRID_AUTH_MODE=local`, services use:

- `AuthContext.mode = "anonymous"`
- `tenantId = "local"`
- `companyId = "local"`
- `projectId = selected local project for browser/read flows; configured, token-bound, or "default" project for OTLP ingest`
- `scopes = []`
- `ingestAllowed = true` at ingest boundaries
- `readAllowed = true` at read boundaries

Implementations may omit the auth context in local mode only when the receiving service explicitly normalizes missing context to these defaults.

Local multi-project OTLP ingest uses the standard OTLP HTTP `Authorization: Bearer <token>` header. The collector maps each configured opaque token of at least 32 characters to exactly one local project before publishing the storage-write command. Routing inputs follow [OTLP mapping](./otlp-mapping.md#project-routing).

When local project tokens are configured, the collector must fail closed:

- Missing `Authorization` header returns ERR-015.
- Unknown bearer token returns ERR-016.
- The token value is never logged, persisted in telemetry, copied into attributes, or returned in an error body.
- The resulting command `AuthContext` uses `tenantId=local`, `companyId=local`, and the project ID bound to the validated token.

When no local project tokens are configured, local ingest may use
`CLOUDGRID_OTLP_LOCAL_PROJECT_ID` and otherwise falls back to
`projectId=default`. This fallback is for single-project local development only.
Self-observability must not change this fallback to `cloudgrid-system`; routing
CloudGrid's own telemetry to the system project requires a local token mapping
or deployed-mode bearer token.

## Error Mapping

- Missing session or bearer token in `sso` mode: ERR-015.
- Invalid signature, issuer, audience, expiry, or malformed claims: ERR-015.
- Valid token without required scope: ERR-016.
- Valid token without access to the requested project: ERR-016.
- Tenant/project mismatch between auth context and storage record: ERR-016 and no record data in the response.

Provider validation details, token contents, and claim values must not appear in public error messages or default logs.

## Tests

Default unit and CI tests must run without external identity providers by using signed local JWT fixtures and in-memory JWKS fixtures. Real OIDC discovery tests are opt-in only and require:

- `CLOUDGRID_TEST_AUTH_OIDC=1`
- `CLOUDGRID_AUTH_ISSUER`
- `CLOUDGRID_AUTH_AUDIENCE`
- `CLOUDGRID_AUTH_JWKS_URL`

Root verification commands must not require those variables.
