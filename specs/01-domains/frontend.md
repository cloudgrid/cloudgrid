---
id: DOM-005
title: Frontend
layer: domain
status: draft
owner: unknown@example.com
updated: 2026-05-08
provenance: inferred-draft
---

# Frontend

## Purpose

The frontend domain renders project-scoped observability, AI evaluation, control-plane, onboarding, and filter workflows using the public GraphQL contract and UI view models.

## Main Entities

- ENT-001: Trace
- ENT-002: Span
- ENT-003: LogEvent
- ENT-006: TraceSearchQuery
- ENT-007: LogSearchQuery

## Key Invariants

- Telemetry investigation surfaces are read-only except for project-scoped configuration workflows explicitly declared in specs, such as project management and dashboard management.
- GraphQL contracts are consumed through generated or shared TypeScript types.
- Empty, loading, and error states are implemented for every data view.
- The enterprise UX concept in `05-frontend/product-ux-concept.md` owns shell modes, onboarding, navigation, route layout, and surface taxonomy.

## Boundaries

- Does not ingest OTLP.
- Does not access SurrealDB.
- Does not define backend API routes.

## Capabilities

- CAP-FE-001: Render trace list.
- CAP-FE-002: Render trace detail.
- CAP-FE-003: Render log search.
- CAP-FE-004: Render filters.
- CAP-FE-005: Render span waterfall.
- CAP-FE-006: Render trace investigation.
- Project selection and onboarding are defined by `05-frontend/product-ux-concept.md` and control-plane specs.
- Dashboard widget configuration is defined by `05-frontend/dashboard-widgets.md`; metric explorer behavior is defined by `05-frontend/logs-metrics-dashboards-ux-concept.md`.
- Feature-gated AI evaluation workspace behavior is defined by `05-frontend/ai-eval-views.md`.
