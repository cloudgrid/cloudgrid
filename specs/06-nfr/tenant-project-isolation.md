---
id: NFR-007
title: Tenant and project isolation
category: security
status: draft
provenance: user-directed
target: Multi-tenant CloudGrid deployments prevent cross-tenant and cross-project telemetry reads or writes at API, message, and persistence boundaries.
measurement: Authorization tests, message contract tests, storage adapter isolation tests, and negative cross-tenant read/write tests pass before enabling CLOUDGRID_AUTH_MODE=sso in production.
applies_to: [CAP-ING-*, CAP-OBS-*, CAP-STO-*]
enforcement: blocking-for-production-auth
---

# Tenant And Project Isolation

## Requirement

CloudGrid must support tenants with multiple projects. A user or ingest credential scoped to one tenant/project must not read or write telemetry for another tenant/project.

## Isolation Model

Tenant/project values are trusted only after authentication. Production contracts must carry both:

- `tenantId`
- `projectId`

These identifiers must exist at every boundary where telemetry ownership or access is evaluated:

- public ingest authentication context,
- GraphQL auth/session context,
- NATS bridge envelopes,
- JetStream subjects or message headers,
- storage records,
- indexes,
- audit logs,
- UI route/filter context,
- live subscription state and sink subjects.

## Persistence Strategy

The implementation-ready default is central control-plane storage plus physically separated telemetry databases:

- one control-plane namespace/database for organizations, users, memberships, project metadata, and project status;
- one SurrealDB namespace per tenant;
- one strict SurrealDB database per project inside that tenant namespace.

Telemetry records also carry tenant/project fields as defense-in-depth metadata and for routing.

Required record ownership fields:

- `tenantId`
- `projectId`

Required index prefixes for read-heavy project databases:

- `tenantId, projectId, startedAt` for traces.
- `tenantId, projectId, traceId` for trace detail lookup.
- `tenantId, projectId, timestamp` for logs.
- `tenantId, projectId, serviceName` for bounded facets and service filters.

Separate encryption keys per tenant are allowed only as future deployment hardening and must be implemented behind storage adapters without changing public GraphQL, NATS, or entity contracts.

## Security Rules

- Tenant/project IDs must not be optional in production multi-tenant mode.
- Public clients must never provide trusted tenant/project IDs without auth-derived validation.
- GraphQL inputs may include project selectors only after the BFF proves the project is present in the validated auth context. The BFF sends exactly one normalized `projectId` to storage-read per request.
- OTLP resource attributes may contain tenant/project-like keys, but they are telemetry attributes only and never become trusted ownership fields.
- Storage-read must include tenant/project constraints on every query.
- Storage-read must include tenant/project constraints on every live subscription registration, notification match, and emitted live event.
- Storage-write must include tenant/project constraints on every persisted record.
- Storage-write post-persist notifications must include only tenant/project routing metadata required for storage-read fanout and must not include telemetry payload data.
- Logs must not leak tenant/project secrets or cross-tenant data in error details.
- Integration tests must include negative cross-tenant and cross-project access cases.

## Local Mode

`CLOUDGRID_AUTH_MODE=local` uses `tenantId=local`, `companyId=local`, and a selected local `projectId` with namespace `cloudgrid_local` and one database per local project. Storage code may physically omit these fields in the MVP only while auth is local, but any deployed SSO implementation must add them before enabling `sso`.

## Authorization Test Matrix

Before production auth can be marked ready:

- A read token for project A cannot query traces, logs, facets, trace detail, or live traces for project B.
- An ingest token for project A cannot write records owned by project B.
- A token without `telemetry:live` cannot open `Subscription.liveTraces`.
- A token without `telemetry:read` cannot query or subscribe to telemetry.
- A token without `telemetry:ingest:traces` cannot ingest traces.
- A token without `telemetry:ingest:logs` cannot ingest logs.
- Public error responses for denied cross-project access contain ERR-016 and no telemetry record fields.

## MVP Status

The local MVP remains single-tenant and single-project. This spec prevents new contracts from making production isolation impossible and defines the implementation-ready default when auth enforcement is enabled.
