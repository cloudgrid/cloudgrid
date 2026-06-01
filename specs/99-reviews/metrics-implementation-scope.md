---
id: REV-009
title: Metrics implementation scope
layer: review
status: draft
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-28
provenance: user-directed
depends_on: [DOM-008, TEC-BE-017, TEC-FE-011]
---

# Metrics Implementation Scope

## Required Workstreams

1. Contracts: update generated TypeScript and Go contract outputs from GraphQL, AsyncAPI, OpenAPI, and entity schemas.
2. Collector: add `/v1/metrics`, JSON/protobuf OTLP decode, auth-before-decode, size/count limits, metric normalization, and `telemetry.ingest.metrics` publish.
3. Storage-write: add metric schema initialization, descriptor/point persistence, cardinality policy, command deduplication, and readiness checks.
4. Storage-read: add metric name search, metric series query, aggregation compatibility, grouping, downsampling, exemplar links, and tests.
5. Control-plane: add dashboard list/save/delete/pin subjects, built-in dashboards, personal/project visibility rules, and validation.
6. BFF: add GraphQL resolvers for `metricNames`, `metricSeries`, `dashboards`, `saveDashboard`, `deleteDashboard`, `setDashboardPinned`, and `reorderDashboardPins` with request/reply mapping only.
7. Frontend: add `/metrics`, topbar navigation, built-in view selection, saved view list, panel editor, chart rendering, empty/error/loading states, and project-change reset behavior.
8. Docs: update local OTLP exporter examples, project metrics usage, and operator troubleshooting.
9. Verification: run contract, TypeScript, Go, frontend, and focused metrics tests.

## Agent Ownership

- Contract agent owns `specs/03-contracts`, generated outputs, and contract tests.
- Collector agent owns `core/otlp-collector`.
- Storage-write agent owns `core/storage-write`.
- Storage-read agent owns `core/storage-read`.
- Control-plane agent owns `core/control-plane`.
- BFF agent owns `apps/backend` and TypeScript bridge client code.
- Frontend agent owns `apps/frontend`, `apps/packages/ui-contracts`, and metric UX tests.
- Docs agent owns `docs`.

Agents must not cross ownership boundaries except to consume generated contracts. If a required behavior is missing from specs, update the spec before code.

## Drift Guards

- No metric implementation is complete until GraphQL, AsyncAPI, OpenAPI, entity schemas, generated TypeScript contracts, generated Go contracts, tests, and docs agree.
- No frontend chart may compute backend-owned aggregations.
- No public REST metric read API may be added.
- No project routing may use metric attributes.
- No saved dashboard or dashboard pin may be stored only in browser storage.
