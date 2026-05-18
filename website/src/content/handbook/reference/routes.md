---
title: "Routes"
description: "There is no /live primary route. Live trace receiving is a mode inside /traces."
order: 4
accent: rose
eyebrow: "Handbook - Reference"
updated: 2026-05-18
---

## Product Routes

| Route | Purpose |
| --- | --- |
| `/projects` | Select or create a project. |
| `/projects/:projectId` | Selects the project and redirects to `/traces`. |
| `/traces` | Trace history and live trace receiving modes. |
| `/traces/:traceId` | Trace investigation and span detail. |
| `/logs` | Project log search, selected-log inspector, and trace/span pivots. |
| `/metrics` | Metric explorer for descriptors, series queries, group-by, filters, and exemplars. |
| `/dashboards` | Saved and built-in dashboards using typed metric, log, trace, and live widgets. |
| `/alerts` | Project alert rules, silences, and in-app alert history records. |
| `/ai-eval` | Optional AI evaluation workspace. |
| `/projects/:projectId/settings` | Project general settings. |
| `/projects/:projectId/settings/ingest` | Project API key setup and key management. |
| `/projects/:projectId/settings/members` | Project-specific membership and roles. |
| `/projects/:projectId/settings/retention` | Project retention policy settings. |
| `/projects/:projectId/settings/ai-eval` | Project AI evaluation settings when enabled. |

There is no `/live` primary route. Live trace receiving is a mode inside `/traces`.

## Public Backend Routes

| Route | Purpose |
| --- | --- |
| `/graphql` | Public GraphQL endpoint and GraphQL subscriptions. |
| `/auth/login` | Starts deployed SSO login. |
| `/auth/callback` | Handles provider callback. |
| `/auth/logout` | Clears BFF session. |
| `/livez` | Liveness. |
| `/readyz` | Readiness. |
| `/api/health` | BFF health response. |

## OTLP Routes

| Route | Signal |
| --- | --- |
| `POST /v1/traces` | OTLP traces. |
| `POST /v1/logs` | OTLP logs. |
| `POST /v1/metrics` | OTLP metrics. |
