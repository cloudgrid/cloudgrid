---
title: "Contracts"
description: "CloudGrid implementation work is contract-first. Do not add public fields, routes, subjects, error codes, or message payloads outside the specs."
order: 5
accent: rose
eyebrow: "Handbook - Reference"
updated: 2026-05-18
---

CloudGrid implementation work is contract-first. Do not add public fields, routes, subjects, error codes, or message payloads outside the specs.

## Public Contracts

| Contract | Path |
| --- | --- |
| GraphQL schema | `specs/03-contracts/graphql/public-schema.graphql` |
| AsyncAPI message bridge | `specs/03-contracts/messages/message-bridge.asyncapi.yaml` |
| HTTP OpenAPI | `specs/03-contracts/api/http-api.openapi.yaml` |
| Error taxonomy | `specs/03-contracts/errors.yaml` |
| Entity JSON Schemas | `specs/03-contracts/entities/` |
| Generated UI contracts | `apps/packages/ui-contracts` |
| Generated Go contracts | `core/go-contracts` |

## Public GraphQL Surfaces

| Surface | Examples |
| --- | --- |
| Viewer and organization | `viewer`, `organizations`, `organizationMembers`, `organizationInvitations` |
| Projects | `projects`, `selectProject`, project member mutations |
| Telemetry | `traces`, `trace`, `logs`, `metricNames`, `metricSeries`, `richMetricSeries` |
| Live | `Subscription.liveTraces` |
| Ingest credentials | `ingestCredentials`, `createIngestCredential`, `revokeIngestCredential` |
| Dashboards | `dashboards`, `saveDashboard`, `deleteDashboard`, `setDashboardPinned`, `reorderDashboardPins` |
| Retention and alerts | `retentionPolicy`, `alertRules`, `alertHistory`, `alertSilences` |

## Contract Check

Run:

```sh
bun run contracts:check
```

This is mandatory for GraphQL, AsyncAPI, UI contract, BFF bridge, or Go message contract changes.

## Generation

Run:

```sh
bun run contracts:generate
```

Generated files must identify the spec source and must not be hand-edited once generation exists.
