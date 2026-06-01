---
id: REV-008
title: Enterprise product spec readiness review
layer: review
status: approved
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-28
provenance: spec-architect-review
depends_on: [IDX-001, TEC-FE-006, TEC-FE-016, IDX-002]
---

# Enterprise Product Spec Readiness Review

## Review Scope

This review covers the spec baseline after the AI Eval v2, dashboard, service
resilience, alerting, auth, and AI Chat waves landed in main-equivalent content.
It focuses on production implementation readiness, frontend UX consistency,
spec-architect skill compatibility, and gaps that would force implementation
agents to invent behavior.

## Closed Spec Gaps

| ID | Gap | Resolution |
| --- | --- | --- |
| REV8-001 | Spec tree did not match the updated spec-architect artifact shape because flows lived under `specs/02-flows`. | Flow specs moved to `specs/03-flows`; references in specs and plans were updated. |
| REV8-002 | Readiness report used the old schema and lacked explicit gate statuses, language, judge evidence, maintenance impact, and migration notes. | `specs/.readiness-report.yaml` now follows the updated gate schema and records deterministic and semantic evidence. |
| REV8-003 | Frontend spec frontmatter reused IDs across unrelated specs, weakening traceability. | Frontend IDs are unique and registry/provenance entries are aligned. |
| REV8-004 | Frontend UX rules were spread across long concept files without one concise implementation contract for onboarding, disabled states, action placement, and feedback. | `specs/05-frontend/product-experience-contract.md` centralizes global product UX requirements PEX-001 through PEX-015. |
| REV8-005 | Implementation status still marked AI Chat runtime/UI as partial even though AI Elements, json-render artifacts, and project provider settings had landed. | IR-006 is marked complete with targeted frontend and backend test evidence from 2026-05-28. |
| REV8-006 | Several specs used ambiguity phrases that allowed implementation-time interpretation. | Ambiguous language was replaced with exact behavior in AI runtime, alerting, frontend application, and service resilience specs. |
| REV8-007 | FEUX work was approved planning input but not executable under the updated implementation-planner gate. | `plans/frontend-ux-implementation/` now contains plan, registry, dependencies, status, scope, wave plans, and twelve executable tickets; plan lint passes. |
| REV8-008 | IR-001 lacked live SurrealDB retention evidence across data classes and retention modes. | Live SurrealDB adapter tests now cover every executable data class, soft delete/final delete, dry-run mutation checks, audit rows, and lease contention/reacquire. |
| REV8-009 | IR-009 lacked mapped full-service self-observability log evidence and normal Logs UI proof. | Service tests cover BFF, collector, control-plane, storage-read, storage-write, and AI-eval runner log export paths; Logs UI tests render CloudGrid service logs and trace/span pivots. |
| REV8-010 | Historical cleanup findings left AI provider and AI Chat AsyncAPI response names represented by generic Go response structs. | Named Go response structs now exist for AI provider and AI Chat response contracts, control-plane handlers return them, and `contracts:check` guards their presence. |
| REV8-011 | Error taxonomy drift checks only validated a selected subset and the BFF bridge schema rejected AI-specific error IDs. | `contracts:check` now validates every `errors.yaml` entry against runtime problem and backend bridge-schema literals; AI Eval error mapping tests pass. |

## Remaining Implementation And Evidence Gaps

These are not open product decisions; they are deployment evidence work:

- `IR-004`: production benchmark evidence must be recorded against the exact
  promoted deployment.

## Higher-Level Product Impact Points

### Project-First Product Flow

The product must optimize for project selection, ingest setup, and first signal
arrival before telemetry route depth. Implementation should treat project
selection, project settings, no-telemetry empty states, and setup snippets as
one guided path rather than isolated pages.

Planning impact: FEUX tickets should test the complete route path
`/projects -> /projects/new -> /projects/:projectId/settings/ingest -> /traces`.

### Action Availability And Enablement

Actions need consistent states: available, pending, disabled with cause,
hidden by permission, setup-required, and destructive-confirmed. Without this,
routes become hard to understand when data, permissions, provider settings, or
feature flags are missing.

Planning impact: add shared frontend primitives for disabled action reasons,
setup-required state, route-local action status, and canonical problem panels
before route-specific FEUX work.

### Evidence Pivot Continuity

Traces, logs, metrics, dashboards, AI Chat, AI Eval, and alerts are strongest
when they preserve selected project, URL state, and evidence context across
pivots. The user should not need to rebuild filters after moving between
evidence surfaces.

Planning impact: route tickets should include URL-state and pivot tests for
trace/log/metric/dashboard/AI Eval/AI Chat evidence links.

### Setup And Feature Readiness

Feature-disabled and missing-provider states need exact enablement paths:
ingest setup for telemetry, company provider setup for AI Chat, project
provider/model-alias setup for AI Eval, adapter setup for notifications, and
benchmark evidence for production readiness.

Planning impact: each route ticket should include missing-setup and disabled
feature states with one primary action and no unrelated onboarding panels.

### Flat Enterprise Visual Grammar

The strongest UX risk is route bloat: nested cards, marketing-style helper
panels, duplicate sidebars, and route-primary surfaces that scroll with the
browser page. The product experience contract now blocks those patterns.

Planning impact: FEUX QA must include static scans and screenshots for
card-wrapped primary surfaces, page-level scrolling, hidden mobile navigation,
and unreadable dense tables.

### Self-Observability As Product Proof

The self-observability project should be a normal project that demonstrates
CloudGrid's own logs, traces, metrics, and alert behavior. This is both an
operator feature and a product-quality signal.

Planning impact: FEUX Logs and cross-route QA tickets must preserve the normal
project-scoped Logs route behavior for `cloudgrid-system`; the current evidence
is captured in `apps/frontend/test/logs-route.test.tsx`.

### Production Readiness Evidence

Specs now distinguish code completion from deployment readiness. Production is
not complete until benchmark JSON, release identity, image tag, thresholds, and
pass/fail status are attached to a specific promoted environment.

Planning impact: release plans must include benchmark artifact collection and
must not treat local passing tests as production performance evidence.

## Implementation Planning Input

The FEUX planning pass produced:

- one FEUX plan root with ticket registry, dependency graph, status file, and
  one owner/write scope per ticket;
- FEUX-01 shared shell/action/disabled-state primitives before route work;
- route tickets for Projects/Settings, Traces, Trace Detail, Logs, Metrics,
  Dashboards, AI Chat, AI Eval, and Alerts;
- cross-route QA ticket with desktop/tablet/mobile screenshots, keyboard
  checks, URL-state checks, no-card-primary-surface scan, no `window.confirm`
  scan, and raw-copy scan.

Production benchmark evidence remains outside repository-local closure until a
specific deployment is promoted.

## Verification Evidence

- `node /Users/sebastianwessel/.agents/skills/spec-architect/scripts/check_specs.mjs specs`
- `bun test apps/frontend/test/ai-chat-route.test.tsx apps/frontend/test/ux-v2-projects.test.ts`
- `bun test apps/backend/src/ai-chat-catalog.test.ts apps/backend/src/ai-chat-stream.test.ts`
- `node /Users/sebastianwessel/.agents/skills/spec-implementation-planner/references/check_plan.mjs . plans/frontend-ux-implementation specs`
- `CLOUDGRID_ENABLE_SURREALDB_RETENTION_TESTS=true go test -count=1 -tags surrealdb ./core/storage-maintenance/internal/adapters/surrealdb`
- `bun test apps/backend/src/self-observability.test.ts apps/frontend/test/logs-route.test.tsx`
- `go test -tags surrealdb ./core/go-runtime/... ./core/otlp-collector/... ./core/control-plane/... ./core/storage-read/... ./core/storage-write/... ./core/ai-eval-runner/...`
- `bun test tooling/scripts/bench.test.mjs`
- `bun run contracts:check`
- `go test -tags surrealdb ./core/control-plane/... ./core/go-contracts/...`
- `bun test apps/packages/runtime/src/problem.test.ts apps/backend/src/bridge.test.ts`
- `go test -tags surrealdb ./core/ai-eval-runner/internal/runtime`
