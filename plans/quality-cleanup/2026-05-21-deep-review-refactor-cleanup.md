# Deep Review Refactor Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove legacy compatibility paths, reduce oversized modules, improve public API DX, and raise verified coverage without breaking CloudGrid's spec-defined service boundaries.

**Architecture:** Work is split by repository ownership boundary so BFF, frontend, Go services, contracts, and docs can be verified independently. Specs and contracts move before implementation whenever behavior changes. No compatibility aliases are preserved unless a current spec explicitly requires them.

**Tech Stack:** Bun, TypeScript ESM, Biome, React/Vite, shadcn/ui, Go, NATS, SurrealDB, GraphQL SDL, AsyncAPI, Astro handbook docs.

---

## Progress Ledger

Use this section as the pause/resume handoff. Keep entries short, dated, and tied to task numbers.

- 2026-05-21: Initial interface inspection completed with parallel agents. Findings were folded into Task 0 and a first cleanup slice was committed as `7147322 chore: deep cleanup and interface drift fixes`.
- 2026-05-21: Continued full cleanup execution from `codex/selfobs-otlp-runtime-cleanup` with parallel ownership boundaries:
  - Task 2 public API client DX split: completed, owner `apps/packages/public-api-client`.
  - Task 3 BFF resolver/bridge decomposition: completed, owner `apps/backend`.
  - Task 4 Go coverage >80: completed, owner `core/*`; direct aggregate coverage is `80.1%`.
  - Task 5 handbook/deploy/spec cleanup: completed, owner `website`, `charts`, `deploy`, `specs`.
- 2026-05-21: Worker D completed Task 5 docs/deploy/spec cleanup: handbook navigation follows overview -> getting started -> concepts -> guides -> configuration -> operations -> architecture -> reference; extension boundaries cover auth, bridge, storage, harness, and public API clients; Helm renders collector service-token auth env for deployed SSO.
- 2026-05-21: Public API client now has a narrow documented root facade, operation metadata lives behind the `./operations` subpath, and contract checks scan operation literals across client modules.
- 2026-05-21: BFF bridge methods are split by subject family and GraphQL resolver families are composed from domain files while preserving BFF-only forwarding semantics.
- 2026-05-21: Go coverage was raised with focused branch and startup-composition tests across collector, storage-read, storage-write, and control-plane packages.
- 2026-05-21: Final repository gate passed: format, typecheck, lint, tests, contract drift checks, release artifact validation, build, Go workspace tests, BFF/backend coverage, and direct Go aggregate coverage.

## File Structure Map

- `apps/packages/public-api-client/src/index.ts`: public TypeScript API client; split into focused operation modules and add TSDoc to exported API.
- `apps/packages/public-api-client/src/dashboard-contracts.ts`: dashboard type facade; keep if it remains a meaningful DX layer, otherwise fold into generated exports with comments.
- `apps/packages/definition/src/index.ts`: contract source constants; keep as the generated metadata source and add comments only to exported public constants.
- `apps/packages/ui-contracts/src/index.ts`: public UI contract types; replace duplicated manual enum unions with generated cascade types where possible.
- `apps/backend/src/bridge.ts`: BFF message bridge client; split by subject family without changing BFF-only request/reply responsibility.
- `apps/backend/src/graphql.ts`: GraphQL resolver composition; split telemetry, control-plane, metrics, dashboard, and AI routes into resolvers/modules.
- `apps/backend/src/validation.ts`: validation schemas; split by public domain so schema ownership matches resolver ownership.
- `apps/frontend/src/routes/*.tsx`: route modules over 1,000 lines; extract route-local models and panels into feature folders while preserving UX v2 layout rules.
- `core/control-plane/internal/service.go`: control-plane service logic; split by company/user/project/membership/dashboard/AI provider domains.
- `core/storage-read/internal/adapters/surrealdb/*.go`: add focused tests around adapter query branches dragging coverage below 80%.
- `core/storage-write/internal/adapters/surrealdb/*.go`: add focused tests around writer branches dragging coverage below 80%.
- `website/src/content/handbook/**`: keep the beginner-to-expert storyline; remove obsolete env docs as behavior changes.

## Task 0: End-To-End Interface And Spec Drift Inspection

**Files:**
- Modify: `plans/quality-cleanup/2026-05-21-deep-review-refactor-cleanup.md`
- Modify only as findings demand: `specs/03-contracts/graphql/public-schema.graphql`, `specs/03-contracts/messages/message-bridge.asyncapi.yaml`, `specs/03-contracts/errors.yaml`, `specs/04-backend/*.md`, `specs/05-frontend/*.md`, `apps/backend/src/**`, `apps/frontend/src/**`, `core/**`, `website/src/content/handbook/**`

- [x] **Step 1: Trace public data flows end to end**

Inspect each user-visible and service-visible flow from source contract through implementation and consumer:

```text
frontend GraphQL operation -> BFF resolver -> NATS bridge request/reply -> Go service handler -> store adapter -> response DTO -> BFF GraphQL response -> frontend view model
OTLP HTTP ingest -> collector decoding -> NATS ingest command -> storage-write consumer -> SurrealDB write model -> storage-read query -> GraphQL response
live telemetry subscription -> BFF GraphQL subscription -> storage-read live-session subjects -> frontend live view
AI Chat and AI Eval flows -> GraphQL/AsyncAPI/spec contracts -> BFF bridge -> Go/runtime handlers -> frontend routes
runtime configuration -> specs/env docs -> .env examples/deploy manifests -> BFF/Go config loaders -> handbook
```

- [x] **Step 2: Verify interface shape alignment**

Compare GraphQL SDL, frontend generated/UI types, BFF resolver argument/result shapes, AsyncAPI message payloads, generated Go contracts, Go NATS handlers, and handbook/spec descriptions. Record every drift item as a concrete plan update before changing behavior.

- [x] **Step 3: Update the plan from findings**

Add or refine downstream tasks when inspection finds missing tests, stale docs, mismatched field names, unregistered subjects, inconsistent errors, or behavior not covered by specs. Specs remain source of truth; if implementation needs behavior not covered by specs, update the spec before implementation.

- [x] **Step 4: Verify drift checks**

Run the relevant checks for touched contract surfaces:

```sh
bun run contracts:check
bun run typecheck
go test -tags surrealdb ./core/go-runtime/... ./core/go-contracts/... ./core/otlp-collector/... ./core/control-plane/... ./core/storage-read/... ./core/storage-write/...
```

Expected:

```text
Contract generation and service interface tests pass, or the plan records remaining drift with owners and verification commands.
```

**Inspection findings added 2026-05-21:**

- Release Compose disabled self-observability in `deploy/compose/cloudgrid.env.example` but did not propagate the flag or bearer token placeholder into Go services and collector. Fix Compose env propagation and add `docker compose --env-file deploy/compose/cloudgrid.env.example -f deploy/compose/cloudgrid.compose.yaml config` to verification.
- Helm chart defaults still used `CLOUDGRID_OTLP_PORT` and older bundled NATS/SurrealDB tags. Replace the legacy variable with `CLOUDGRID_OTLP_HTTP_ADDR` and align bundled dependency tags with `.env.example`.
- Helm deployed SSO collector startup needs explicit `CLOUDGRID_AUTH_ISSUER`, `CLOUDGRID_AUTH_AUDIENCE`, and `CLOUDGRID_AUTH_JWKS_URL` values. Add chart values/docs and template assertions instead of relying on browser SSO provider settings.
- Runtime config specs and handbook reference omit implemented collector limits, publish timeout, gRPC settings, and project status cache variables. Sync specs/docs to parser behavior and `.env.example`.
- Frontend alert rule filters were URL-backed and route-wired but the public API client dropped `AlertRuleSearchInput` and query keys ignored filter state. Fix `getAlertRules(projectId, input?)`, pass `$input` in the operation, include filters in `queryKeys.alertRules`, and add a client variables assertion.
- Public client coverage for SDL/BFF-supported operations is incomplete (`updateProject`, `updateProjectAiProviderSettings`, `archiveAiChatConversation`). Add a public-client SDL parity decision: either cover every public SDL operation or document the intentional subset.
- Trace detail frontend still has presentation filtering that can duplicate backend `TraceDetailInput` semantics. Add a UI/model test proving `showMatchesOnly` keeps ancestors needed for tree rendering, or move visibility fully to storage-read response shape.
- AsyncAPI AI Chat conversation get/create/archive responses described `data` as a direct conversation while Go control-plane and BFF use `data.conversation`. Align the spec to the wrapper and extend contract checks to validate response wrappers, not only request structs.
- Named AsyncAPI response contracts for AI provider and AI Chat subjects are not generated or used as Go response types. Decide whether response payloads should be generated contract types or explicitly generic implementation schemas.
- Control-plane AI Chat not-found paths currently use trace-specific `ERR-004` / `TRACE_NOT_FOUND`. Add a generic or AI Chat-specific not-found taxonomy entry and focused bridge error tests before changing the mapping.
- `contracts:check` validates only a selected error taxonomy subset. Extend it to parse all `errors.yaml` IDs and require runtime/public mapping or an explicit private-only allowlist.
- Go aggregate coverage is 70.6%. Packages below 80% are `storage-write/cmd/storage-write`, `storage-read/cmd/storage-read`, `control-plane/internal/adapters/surrealdb`, `control-plane/cmd/control-plane`, `otlp-collector/cmd/otlp-collector`, `control-plane/internal`, `storage-write/internal/adapters/surrealdb`, `storage-read/internal/adapters/surrealdb`, and `storage-write/internal/ingest`.
- Storage-read SurrealDB adapter serializes reads through a package-level mutex and `GetProjectTelemetryOverviews` performs sequential per-project queries. Add a benchmark/performance follow-up before changing the SDK session model.

## Task 1: Baseline Gate And Legacy Scan

**Files:**
- Modify: `plans/quality-cleanup/2026-05-21-deep-review-refactor-cleanup.md`
- Modify only as findings demand: `specs/04-backend/runtime-configuration.md`, `website/src/content/handbook/reference/environment-variables.md`

- [x] **Step 1: Run baseline checks**

Run:

```sh
bun run typecheck
bun run test
bun run coverage:backend
go test -tags surrealdb -coverprofile=/tmp/cloudgrid-go-backend.out ./core/otlp-collector/... ./core/storage-read/... ./core/storage-write/... ./core/control-plane/...
```

Expected current result before cleanup:

```text
bun run typecheck exits 0
bun run test fails on config-token isolation and one icon discipline assertion
bun run coverage:backend fails on the same config-token tests but reports BFF line coverage above 80%
go test fails in collector command config-token tests and reports several Go packages below 80%
```

- [x] **Step 2: Remove confirmed legacy env aliases**

Remove implementation and docs references to:

```text
CLOUDGRID_OTLP_HOST
CLOUDGRID_OTLP_PORT
CLOUDGRID_OTLP_TOKEN
```

Keep:

```text
CLOUDGRID_OTLP_HTTP_ADDR
CLOUDGRID_OTLP_BEARER_TOKEN
CLOUDGRID_PROJECT_API_KEY
```

- [x] **Step 3: Re-run legacy scan**

Run:

```sh
rg -n "CLOUDGRID_OTLP_HOST|CLOUDGRID_OTLP_PORT|CLOUDGRID_OTLP_TOKEN|legacy-token|legacy host" apps core tooling specs website README.md .env.example deploy --glob '!**/node_modules/**' --glob '!**/dist/**'
```

Expected:

```text
No matches.
```

## Task 2: Public API Client DX Split

**Files:**
- Modify: `apps/packages/public-api-client/src/index.ts`
- Create: `apps/packages/public-api-client/src/client.ts`
- Create: `apps/packages/public-api-client/src/graphql-transport.ts`
- Create: `apps/packages/public-api-client/src/ai-chat.ts`
- Create: `apps/packages/public-api-client/src/observability.ts`
- Create: `apps/packages/public-api-client/src/control-plane.ts`
- Create: `apps/packages/public-api-client/src/dashboards.ts`
- Test: `apps/packages/public-api-client/src/ai-chat-stream.test.ts`
- Test: create `apps/packages/public-api-client/src/client.test.ts`

- [x] **Step 1: Write API export snapshot tests**

Add a test that imports the package entrypoint and asserts the intended public exports:

```ts
import { describe, expect, test } from "bun:test";
import * as api from ".";

describe("public API client exports", () => {
  test("exposes the stable CloudGrid client surface", () => {
    expect(Object.keys(api).sort()).toEqual([
      "CloudGridGraphQLError",
      "createControlPlaneGraphQLClient",
      "createTelemetryGraphQLClient",
      "isCloudGridProblemError",
    ]);
  });
});
```

- [x] **Step 2: Extract transport without changing behavior**

Move fetch, GraphQL envelope parsing, and problem-error mapping into `graphql-transport.ts`. Export only typed helpers used by client modules.

- [x] **Step 3: Extract operation families**

Move telemetry reads into `observability.ts`, control-plane mutations/queries into `control-plane.ts`, dashboard operations into `dashboards.ts`, and SSE stream handling into `ai-chat.ts`.

- [x] **Step 4: Add TSDoc to public exports**

Every exported public function and class from `apps/packages/public-api-client/src/index.ts` must have TSDoc describing purpose, parameters, error behavior, and return type semantics.

- [x] **Step 5: Verify**

Run:

```sh
bun test apps/packages/public-api-client/src
bun run --cwd apps/packages/public-api-client typecheck
```

Expected:

```text
All public API client tests pass and typecheck exits 0.
```

## Task 3: BFF Resolver And Bridge Decomposition

**Files:**
- Modify: `apps/backend/src/bridge.ts`
- Create: `apps/backend/src/bridge/telemetry-client.ts`
- Create: `apps/backend/src/bridge/control-plane-client.ts`
- Create: `apps/backend/src/bridge/ai-eval-client.ts`
- Create: `apps/backend/src/bridge/ai-chat-client.ts`
- Create: `apps/backend/src/graphql/resolvers/telemetry.ts`
- Create: `apps/backend/src/graphql/resolvers/control-plane.ts`
- Create: `apps/backend/src/graphql/resolvers/metrics.ts`
- Create: `apps/backend/src/graphql/resolvers/dashboards.ts`
- Modify: `apps/backend/src/graphql.ts`
- Test: `apps/backend/src/bridge.test.ts`
- Test: `apps/backend/src/graphql.test.ts`
- Test: `apps/backend/src/graphql-control.test.ts`

- [x] **Step 1: Add parity tests before extraction**

For each bridge subject family, assert the exact AsyncAPI top-level payload shape currently emitted by BFF bridge methods.

- [x] **Step 2: Extract bridge clients by subject family**

Move methods without changing exported behavior. Keep NATS adapter code under `apps/backend/src/bridge/adapters/nats.ts`.

- [x] **Step 3: Extract resolver families**

Move resolver bodies into domain files and compose them from `graphql.ts`. The BFF must continue to validate, map, and forward only; no telemetry filtering, aggregation, ranking, or enrichment is allowed.

- [x] **Step 4: Verify**

Run:

```sh
bun test apps/backend/src/bridge.test.ts apps/backend/src/graphql.test.ts apps/backend/src/graphql-control.test.ts
bun run contracts:check
```

Expected:

```text
Focused BFF tests and contract check pass.
```

## Task 4: Go Coverage Above 80%

**Files:**
- Test: `core/storage-read/internal/adapters/surrealdb/*_test.go`
- Test: `core/storage-write/internal/adapters/surrealdb/*_test.go`
- Test: `core/control-plane/internal/*_test.go`
- Test: `core/control-plane/internal/adapters/surrealdb/*_test.go`
- Test: `core/*/cmd/*/*_test.go`

- [x] **Step 1: Measure package coverage after baseline fixes**

Run:

```sh
go test -tags surrealdb -coverprofile=/tmp/cloudgrid-go-backend.out ./core/otlp-collector/... ./core/storage-read/... ./core/storage-write/... ./core/control-plane/...
go tool cover -func=/tmp/cloudgrid-go-backend.out | tail -1
```

- [x] **Step 2: Add focused branch tests for packages below 80%**

Prioritize packages shown below 80% in the measured output. Cover validation branches, error mapping, query construction, readiness, and startup composition branches without adding production-only test hooks.

- [x] **Step 3: Verify aggregate coverage**

Run:

```sh
go test -tags surrealdb -coverprofile=/tmp/cloudgrid-go-backend.out ./core/otlp-collector/... ./core/storage-read/... ./core/storage-write/... ./core/control-plane/...
go tool cover -func=/tmp/cloudgrid-go-backend.out | tail -1
```

Expected:

```text
total: (statements) >80.0%
```

## Task 5: Handbook Storyline And API Reference

**Files:**
- Modify: `website/src/content/handbook/index.md`
- Modify: `website/src/content/handbook/overview/*.md`
- Modify: `website/src/content/handbook/getting-started/*.md`
- Modify: `website/src/content/handbook/concepts/*.md`
- Modify: `website/src/content/handbook/guides/*.md`
- Modify: `website/src/content/handbook/configuration/**/*.md`
- Modify: `website/src/content/handbook/operations/*.md`
- Modify: `website/src/content/handbook/architecture/*.md`
- Modify: `website/src/content/handbook/reference/*.md`
- Modify: `website/src/lib/handbook-navigation.ts`

- [x] **Step 1: Audit navigation order**

Ensure navigation follows:

```text
overview -> getting started -> concepts -> guides -> configuration -> operations -> architecture -> reference
```

- [x] **Step 2: Remove obsolete or duplicate setup guidance**

Delete references to removed env aliases, deleted `docs/`, fake compatibility surfaces, and unsupported storage or API behavior.

- [x] **Step 3: Add extension/developer path**

Ensure adapter and extension pages explain how to extend auth, bridge, storage, harness, and public API clients without violating the service boundaries in `specs/00-conventions.md`.

- [x] **Step 4: Verify website**

Run:

```sh
bun run --cwd website build
```

Expected:

```text
Astro build exits 0.
```

## Task 6: Final Verification Gate

**Files:**
- Modify only files changed by previous tasks.

- [x] **Step 1: Run full repository gate**

Run:

```sh
bun run format:check
bun run typecheck
bun run lint
bun run test
bun run contracts:check
bun run release:validate
bun run build
bun run go:test
bun run coverage:backend
go test -tags surrealdb -coverprofile=/tmp/cloudgrid-go-backend.out ./core/otlp-collector/... ./core/storage-read/... ./core/storage-write/... ./core/control-plane/...
go tool cover -func=/tmp/cloudgrid-go-backend.out | tail -1
```

Expected:

```text
All commands exit 0, BFF coverage is above 80%, and Go aggregate coverage is above 80%.
```
