---
id: TEC-BE-011
title: Control plane and project management
layer: backend
status: draft
owner: unknown@example.com
updated: 2026-05-11
provenance: user-directed
---

# Control Plane And Project Management

CloudGrid has one central control plane for companies, users, memberships, organization invitations, projects, project selection, and authz metadata. Telemetry ingestion and reads stay separate from the control plane hot path.

## Service Boundary

Target service: `core/control-plane`.

Responsibilities:

- Store and query organizations, projects, users, memberships, organization invitations, roles, project status, ingest credential metadata, dashboards, dashboard pins, AI-eval project settings, provider profile metadata, model aliases, online evaluation policies, and future low-volume project configuration.
- Own organization/project/user management mutations.
- Publish project status snapshots for fast auth validation by public boundaries.
- Never ingest, query, aggregate, or enrich telemetry records.

The BFF talks to `core/control-plane` only through NATS request/reply subjects declared in AsyncAPI. The frontend talks only to BFF GraphQL.

## Public Product Vocabulary

- UI label: company.
- GraphQL/entity name: `Organization`.
- A company owns projects.
- Users are members of companies.
- A membership grants one company-level role. All company users can see all company projects.

Use `Organization` in contracts and `company` in user-facing copy where that is clearer.

## Roles

Company roles:

- `admin`: can view all projects, ingest/read telemetry, create/update projects, and add/remove/change company users.
- `user`: can view all projects and ingest/read telemetry, but cannot administer company users.

There are no project-specific user roles in the current product. The data model must keep role assignment extensible so a later spec can add project-specific or permission-specific roles without rewriting users, companies, projects, or telemetry ownership.

Role-to-scope mapping:

- `admin`: `telemetry:read`, `telemetry:live`, `telemetry:ingest:traces`, `telemetry:ingest:logs`, `telemetry:ingest:metrics`, `company:admin`.
- `user`: `telemetry:read`, `telemetry:live`, `telemetry:ingest:traces`, `telemetry:ingest:logs`, `telemetry:ingest:metrics`.

Company admin invariant:

- The first user to sign in for a new company becomes `admin` automatically.
- Every company must always have at least one `admin`.
- Removing a user, downgrading an admin, or disabling a membership must fail with ERR-016 if it would leave the company without an admin.
- Admins may make other users admins.

Company membership in deployed SSO mode is invite-only after bootstrap:

- the first SSO user for an empty configured company becomes `admin`;
- later SSO users do not gain company access from SSO authentication alone;
- company admins invite users by email;
- invitations are always created with target role `user`;
- an invitation becomes an active membership only after an SSO provider returns a
  matching verified email;
- admin promotion is allowed only for active members.

## Project Status

Projects have status:

- `active`: ingest and reads are allowed when role/scope checks pass.
- `read_only`: reads are allowed, ingest is denied with ERR-016.
- `disabled`: ingest and reads are denied with ERR-016.

Public boundaries must check project status from the normalized auth context or a local project status cache before accepting telemetry operations in deployed `sso` mode.

## Fast Ingestion Auth

The OTLP collector must not call the control plane or SurrealDB on every ingest request. Production ingest validation is:

1. Validate JWT locally through OIDC/JWKS.
2. Normalize tenant/project/scopes.
3. Check required ingest scope.
4. Check a local in-memory project status cache keyed by `tenantId/projectId`.
5. Accept only if the cache says the project is `active`.

The cache is populated from control-plane snapshots and invalidation events. Default TTL is 60 seconds. If the cache has no entry or is older than 120 seconds in production, the collector fails closed with ERR-016. Local disabled auth mode bypasses the cache and uses `local/default`.

## BFF Project Selection

The BFF owns the selected project for browser sessions. The selected project is stored in the BFF session and mirrored in frontend route state. A selected project is valid only if the user is a member of the company that owns the project.

Project selection rules:

- If the session has no selected project, `Query.viewer` returns `selectedProject: null`.
- Telemetry routes require a selected project in deployed SSO mode.
- When the user selects a project, the frontend calls `Mutation.selectProject(projectId)`.
- The BFF validates access through control-plane, updates the session, and all subsequent GraphQL telemetry resolvers send that project in `AuthContext.projectId`.
- Direct URL access to `/projects/:projectId/...` may select the project only after BFF validation.

## Control Plane Data Model

Canonical records:

- `organization`: company metadata.
- `user`: normalized external identity profile keyed by OIDC subject.
- `project`: project metadata and status.
- `membership`: relation edge from user to organization with company role.
- `organization_invitation`: pending and terminal invite records keyed by
  organization and normalized email.
- `ingest_credential`: metadata for tokens or client credentials allowed to ingest into one project. Secrets are never stored in plaintext.
- `dashboard`: saved personal and project dashboard definitions. Built-in dashboards are deterministic read models and are not mutable rows.
- `dashboard_pin`: relation edge from user to dashboard with project ID and sidebar position.
- `project_ai_settings`: low-volume project AI-eval settings document.
- `ai_provider_profile`: project-scoped provider profile metadata and opaque credential references. It never stores raw provider secrets.
- `ai_model_alias`: project-scoped model aliases for judge, optimizer, embedding, replay, and default model purposes.
- `ai_online_policy`: project-scoped online evaluation policy definitions.

Memberships are graph relation tables because they are low-volume, security-sensitive relationships that benefit from explicit edges and traversal. Organization invitations are schemafull normal documents because pending invites exist before a `user` relation endpoint exists. They are indexed by `organizationId`, `email`, and `status`. At most one pending invitation may exist for one normalized email inside one organization. Telemetry records do not use graph relations on the write hot path.

## Runtime Store Selection

The production control-plane runtime must use SurrealDB as its authoritative
store. `core/control-plane/cmd/control-plane` does not expose a runtime store
selector or compatibility fallback. SurrealDB connection settings are the shared
storage settings:
  `CLOUDGRID_SURREALDB_URL`, `CLOUDGRID_SURREALDB_NAMESPACE`,
  `CLOUDGRID_SURREALDB_DATABASE`, `CLOUDGRID_SURREALDB_USERNAME`, and
  `CLOUDGRID_SURREALDB_PASSWORD`.
- Startup must apply the control-plane schema before accepting NATS requests.
  Failure to connect, authenticate, apply schema, or pass readiness returns
  ERR-006/ERR-010 and the service must not report ready.
- The `/healthz` readiness payload must report `control-store=ok` only after
  the selected adapter can run a bounded query against the configured database.

Implementation agents must not add a memory runtime adapter path or silently
fall back from SurrealDB. Fallbacks can hide data-loss bugs and invalid
deployment configuration.

## NATS Subjects

The control-plane wave must add these subjects before implementation:

- `control.viewer.get`
- `control.organizations.list`
- `control.organizations.get`
- `control.projects.list`
- `control.projects.get`
- `control.projects.create`
- `control.projects.update`
- `control.projects.select`
- `control.members.list`
- `control.members.update`
- `control.members.remove`
- `control.invitations.list`
- `control.invitations.create`
- `control.invitations.revoke`
- `control.project_members.list`
- `control.project_members.update`
- `control.project_members.remove`
- `control.project_status.snapshot`
- `control.project_status.changed`
- `control.dashboards.list`
- `control.dashboards.save`
- `control.dashboards.delete`
- `control.dashboard_pins.set`
- `control.dashboard_pins.reorder`
- `control.ai_settings.get`
- `control.ai_settings.update`

Implementation agents must not add GraphQL management fields without matching control-plane message contracts.

## Dashboard Rules

Dashboards are low-volume project configuration owned by control-plane:

- built-in dashboards are deterministic read models and are returned when `includeBuiltins=true`;
- saved dashboards are mutable rows scoped to one selected project;
- saved dashboards use first-class `Dashboard` and `DashboardWidget` contracts; the implementation must not expose `MetricView`, `MetricViewPanel`, `metricViews`, `saveMetricView`, or `deleteMetricView` compatibility aliases;
- personal dashboards are visible only to their owner; project dashboards are visible to all company members with selected-project access;
- company members may create, update, and delete their own personal dashboards;
- only company `admin` users may create, update, or delete project dashboards;
- built-in dashboards are read-only; editing one creates a new unsaved dashboard draft and save persists a personal or project dashboard depending on `SaveDashboardInput.visibility`;
- records are stored in the control-plane database table `dashboard`;
- record ID for project dashboards is `dashboard:<projectId>_project_<dashboardSlug>`;
- record ID for personal dashboards is `dashboard:<projectId>_personal_<userId>_<dashboardSlug>`;
- `(projectId, visibility, ownerUserId, slug)` is unique, with `ownerUserId` set only for personal dashboards;
- `version` starts at `1` and increments on every successful save;
- updates require the client to send the current `version` when `id` is present; stale versions fail with ERR-001 and do not overwrite newer changes;
- deleting a saved dashboard removes the `dashboard` row and any `dashboard_pin` relation edges pointing at it; it never deletes telemetry;
- deleting a built-in dashboard returns ERR-016;
- read requires company membership and selected-project access;
- save validation checks widget count, widget IDs, layout bounds, supported widget kind, exactly one matching widget config per kind, metric names, metric aggregation compatibility, grouping keys, filters, chart type, table columns, time-window bounds, and trace/log/live limits before persistence;
- live dashboard widgets store only a bounded `LiveTraceInput`-compatible filter. They do not persist live events or replay buffers.

Dashboard flexibility is limited to the validated `widgets` structure in `dashboard.schema.json`. Agents must not add arbitrary executable expressions, raw database queries, JavaScript snippets, SQL/SurrealQL, template strings, iframe/embed URLs, external script URLs, or custom chart code to dashboard definitions. Future customization must extend the schema with typed fields and validation rules first.

Dashboards are not secrets. They must not contain bearer tokens, session IDs, SurrealDB credentials, provider API keys, raw Authorization header values, or arbitrary HTTP headers. Control-plane validation rejects any string field or filter value whose key is `authorization`, `cookie`, `set-cookie`, `x-api-key`, `api_key`, `token`, `secret`, or `password` with ERR-001.

## Dashboard Pin Rules

Dashboard pins are user preferences for project navigation:

- a pin belongs to one user and one project;
- a user may pin built-in, project, or personal dashboards visible to that user;
- a project sidebar shows at most five pinned dashboards ordered by `dashboard_pin.position`;
- `Mutation.setDashboardPinned` adds or removes one pin;
- `Mutation.reorderDashboardPins` replaces the order for the current user's visible pins in the selected project;
- pin writes require selected-project access and fail with ERR-016 if the dashboard is not visible to the user;
- pin writes are not shared project configuration and must not require company `admin`;
- deleting a dashboard removes only pins targeting that dashboard;
- collapsed/expanded sidebar state is browser-local presentation state and is not persisted.

## Organization Invitations

Control-plane owns invite-only membership according to
[Organization invitations and SSO membership lifecycle](./organization-invitations.md).

Public GraphQL and BFF bridge contracts must expose:

- `Query.organizationMembers(organizationId)` for active members;
- `Query.organizationInvitations(organizationId)` for admin-visible invitations;
- `Mutation.inviteOrganizationMember(input: { organizationId, email })`;
- `Mutation.revokeOrganizationInvitation(id)`.

The old `updateOrganizationMember` mutation remains only for changing active
member roles. It must not create members for unknown users and must not create
pending invitations.

SSO provider deprovisioning is useful for enterprise deployments, but it is a
separate `sso_sync` lifecycle policy. It must not be inferred from login
failure. Until provider sync contracts exist, CloudGrid uses manual member
removal.

## AI Evaluation Project Settings

Control-plane owns AI-eval settings according to
`specs/04-backend/ai-eval-project-settings.md`.

Rules:

- AI-eval settings are project-scoped and low-volume.
- Reads require selected-project access.
- Updates require project `admin` or company `admin`.
- Settings use optimistic concurrency through `version`.
- Control-plane returns an effective redacted view with derived defaults and
  missing-configuration warnings.
- Provider profiles store metadata and opaque `credentialRef` values only.
- Raw provider API keys, bearer tokens, refresh tokens, cookies, Authorization
  headers, and provider secret JSON must not be persisted, returned, logged, or
  bundled.
- Online policy definitions are declarative. Control-plane validates shape and
  ownership; storage-read owns match semantics during evaluation.

GraphQL, AsyncAPI, JSON Schema, and generated contracts for these settings must
be added before implementation. Agents must not create frontend-local AI settings
state or bypass control-plane for project AI settings.

## SurrealDB Control-Plane Schema

The control-plane SurrealDB database uses SurrealDB's multi-model features deliberately:

- `organization`, `user`, `project`, `organization_invitation`,
  `ingest_credential`, `project_membership`, `retention_policy`,
  `project_ai_settings`, `alert_rule`, `alert_silence`, `alert_event`, and
  `project_status_event` are `SCHEMAFULL TYPE NORMAL` document tables with
  `PERMISSIONS NONE`.
- `membership` and `dashboard_pin` are relation tables. Membership relates
  `user -> organization`; dashboard pins relate `user -> dashboard`.
- `dashboard` is a `SCHEMAFULL TYPE NORMAL` document table. It stores the typed widget tree as one validated document because dashboards are loaded and versioned as one configuration unit. The schema defines each widget's top-level identity, kind, and layout fields; service-validated widget configuration objects are stored as flexible nested objects so new typed widget contracts do not require ad hoc storage migrations for every nested filter field.
- `dashboard_pin` is a `SCHEMAFULL TYPE RELATION IN user OUT dashboard` graph relation. It stores `projectId`, `position`, `createdAt`, and `updatedAt`; graph traversal gives the current user's pinned dashboards without scanning all dashboards.
- Deterministic record IDs give key-value-style direct lookup for `dashboard:<projectId>_project_<slug>` and `dashboard:<projectId>_personal_<userId>_<slug>`.
- SQL-like indexed predicates support list/search: `dashboard.projectId`, `dashboard.visibility`, `dashboard.ownerUserId`, `dashboard.slug`, `dashboard.updatedAt`, `dashboard.searchText`, `dashboard.tags`, and `dashboard_pin.in, dashboard_pin.projectId, dashboard_pin.position`.
- Unique indexes enforce `(projectId, visibility, ownerUserId, slug)` for dashboards and `(in, out, projectId)` for pins.
- `project_ai_settings` stores the complete redacted settings document as
  a flexible `settings` object, plus first-class `projectId`, `version`,
  `updatedAt`, and `updatedByUserId` fields. It is indexed uniquely by
  `projectId`.
- Table permissions are `NONE`; only the control-plane service credential reads or mutates these records.

## Project Membership

Project-specific membership and roles are required. Company membership grants organization visibility, but project access is controlled by project membership unless the user is a company `admin`.

Control-plane owns `project_membership` records and must follow [Project membership and roles](./project-membership.md). Project settings member pages are placeholders only until GraphQL, message, and SurrealDB contracts for project members are generated.

## Ingest Credential Management

The control-plane service owns project ingest API key metadata and secret hash
persistence. It exposes request/reply bridge operations for the selected project:

- `control.ingest_credentials.list` with `BridgeEnvelope` returns
  `{ items: IngestCredential[] }`.
- `control.ingest_credentials.create` with `BridgeEnvelope` and `title` returns
  `{ credential, secret }`, where `secret` is the only response that may contain
  a full key.
- `control.ingest_credentials.revoke` with `BridgeEnvelope` and `credentialId`
  returns `{ credential }`.

All three operations require selected-project access. Creation and revocation
require project `admin` or company `admin` role for the selected project organization. List returns
metadata for active and revoked keys for the selected project only. `secretHash`
is never serialized over NATS responses, GraphQL responses, logs, metrics, or
frontend assets.

Ingest credentials always carry the fixed all-signal ingest scopes for traces,
logs, and metrics. Rotation is create-new-key plus revoke-old-key; no rotate
operation is exposed in v1.

The SurrealDB `ingest_credential` table is schemafull and stores:
`projectId`, `secretHash`, `displayName`, `createdByUser`, `createdAt`,
`disabledAt`, and `lastUsedAt`. Control-plane adapters must provide indexed
lookup by `projectId` for settings lists and future collector key cache
snapshots.
- Schema initialization uses explicit current schema declarations, then verifies
  definitions through `INFO` before reporting readiness. Additive tables, fields,
  and indexes use `IF NOT EXISTS`; intentional pre-1.0 field shape changes use
  explicit `DEFINE FIELD OVERWRITE` statements for the authoritative definition.
  The service must not keep compatibility fallbacks for obsolete field shapes.

## Project Telemetry Overview

Control-plane project records always include the GraphQL `telemetry` object for schema stability, but control-plane does not own telemetry counts. For viewer, organization, project list, project detail, project create/update, and project selection responses, the BFF must request storage-read `telemetry.projects.overview` with the explicit `{ tenantId, companyId, projectId }` targets that came from authorized control-plane records and merge the returned overview into the GraphQL project model.

Storage-read computes `traceCount`, `logCount`, `metricCount`, `serviceCount`, and `lastIngestAt` from SurrealDB telemetry tables. The BFF must not count, aggregate, or infer these fields locally. If storage-read cannot provide the overview, the GraphQL operation must surface the bridge error rather than silently replacing real telemetry with static zeros.

## Verification

Control-plane implementation requires:

- GraphQL auth tests for cookie session and Bearer paths.
- Project selection tests proving telemetry queries use the selected project.
- Company bootstrap tests proving first user becomes admin.
- Admin invariant tests proving the final admin cannot be removed or downgraded.
- Negative tests for disabled project ingest/read.
- Collector auth cache tests for hit, stale, missing, disabled, read_only, and active statuses.
- Storage tests proving telemetry cannot cross project database boundaries.
