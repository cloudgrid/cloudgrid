# AI Eval Implementation Boundaries

Use this reference when changing AI Eval code or explaining why a behavior
belongs in a specific service.

## Ownership Map

| Surface | Owner | Notes |
| --- | --- | --- |
| GraphQL operations and generated types | `apps/packages/public-api-client`, `apps/packages/ui-contracts` | Public BFF contract |
| Message subjects and Go structs | `core/go-contracts` plus BFF bridge code | NATS request/reply and progress contracts |
| UI contracts | `apps/packages/ui-contracts` | Generated/typed frontend view models |
| Go contracts | `core/go-contracts` | Shared request/response structs |
| BFF GraphQL | `apps/backend` | Validates inputs, routes to approved NATS subjects |
| Frontend | `apps/frontend` | Renders GraphQL view models and route state only |
| Public API client | `apps/packages/public-api-client` | Public GraphQL operations only |
| storage-write | `core/storage-write` | Dataset, candidate, scorer, experiment, result persistence |
| storage-read | `core/storage-read` | Search, cursors, manifests, policy matches, aggregates |
| runner | `core/ai-eval-runner` | Run lifecycle, policy enforcement, harness calls |
| harness adapter | `apps/packages/cloudgrid-harness-adapter` | Execution/scoring/optimization/sandbox lifecycle |

## Do Not Drift

- Do not add GraphQL fields without updating SDL, UI contracts, public API
  client operations, BFF validation, tests, and `bun run contracts:check`.
- Do not add NATS subjects without AsyncAPI, Go contracts, subject lists,
  handlers, BFF bridge payload tests, and contract checks.
- Do not compute AI Eval aggregates in the BFF or frontend.
- Do not read or write AI Eval SurrealDB tables outside storage-read and
  storage-write ownership.
- Do not let the runner import storage adapters, SurrealDB clients, provider
  SDKs, or BFF code.
- Do not let the frontend call NATS, harness, SurrealDB, or provider SDKs.

## Required Behavior

Storage-write:

- handles dataset item update, candidate prepare, candidate commit, scorer
  create, experiment create, result persist, and prompt promotion subjects;
- validates scorer definitions and eval result payloads;
- enforces expected dataset version and idempotency;
- rejects non-ready, cross-project, or stale-anonymization candidates.

Storage-read:

- owns candidate search ordering and cursor pagination;
- returns GraphQL-ready aggregate summaries;
- resolves stable experiment manifests with schema, version, digest, canonical
  snapshot, and run policy;
- resolves online policy matches and warnings;
- threads auth context through read queries.

Runner:

- handles start, pause, resume, cancel, optimization, and online projections;
- uses idempotent run-control requests;
- rejects terminal resume with `ERR-AIE-001`;
- rejects stale manifest digest with `ERR-AIE-002`;
- starts, aborts, and cleans up harness sandboxes;
- persists only through storage-write subjects.

Frontend:

- uses public GraphQL operations only;
- shows dataset candidates, scorer templates, experiment run controls, result
  visualizations, production quality summaries, and settings links;
- renders returned view models without local score or health derivation.

## Test Expectations

Add focused tests in the owning layer:

- contract drift: `tooling/scripts/check-contracts.mjs`;
- BFF subject routing and validation: `apps/backend/src/ai-eval.test.ts`;
- frontend route/client behavior: `apps/frontend/test` and `apps/frontend/e2e`;
- fake-service integration: `tooling/scripts/ai-eval-fake-service-integration.test.mjs`;
- storage query/persistence: Go tests under `core/storage-read` and
  `core/storage-write`;
- runner and harness lifecycle: Go runner tests plus Bun harness adapter tests.

Before claiming completion, run the plan-level gates from
`plans/implementation-plan.md`.
