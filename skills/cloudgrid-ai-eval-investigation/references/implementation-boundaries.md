# AI Eval Implementation Boundaries

Use this reference when changing AI Eval code or explaining why behavior belongs
in a specific service.

## Ownership Map

| Surface | Owner | Notes |
| --- | --- | --- |
| GraphQL operations and generated types | `apps/packages/public-api-client`, `apps/packages/ui-contracts` | Public BFF contract |
| Message subjects and Go structs | `core/go-contracts` plus BFF bridge code | NATS request/reply and progress contracts |
| BFF GraphQL | `apps/backend` | Validates inputs, routes to approved NATS subjects |
| Frontend | `apps/frontend` | Renders GraphQL view models and route state only |
| storage-write | `core/storage-write` | Dataset versions, item revisions, evaluation runs, metrics, comparisons, target snapshots, optimization runs, and promotions |
| storage-read | `core/storage-read` | Search, cursors, aggregates, run detail view models, comparison view models, and live fanout |
| runner | `core/ai-eval-runner` | Evaluation lifecycle, optimization lifecycle, quick-shot, adapter invocation, retention roles |
| external adapter or harness | deployment-specific | Black-box target execution and provider credentials |

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
- Do not let the frontend call NATS, adapters, SurrealDB, or provider SDKs.
- Do not reintroduce primary Scorer, Experiment, Check, Gate, or Production
  Quality concepts into AI Eval v2 UX.

## Required Behavior

Storage-write:

- validates dataset schemas and row values;
- creates immutable dataset item revisions and dataset versions;
- persists evaluation runs, item runs, metric results, aggregates, comparisons,
  target snapshots, optimization runs, and promotion records;
- enforces expected dataset version and idempotency.

Storage-read:

- owns filtering, sorting, pagination, grouping, counts, and bounded facets;
- returns GraphQL-ready aggregate summaries and run detail view models;
- returns comparison and optimization progress view models;
- threads auth context through read queries.

Runner:

- handles start, pause, resume, cancel, and optimization;
- records quick-shot selected item revision IDs and seed;
- invokes external adapters with trace context;
- rejects use of `test` split during candidate generation;
- persists only through storage-write subjects.

Frontend:

- uses public GraphQL operations only;
- exposes Datasets and Evaluations primary tabs;
- edits JSON schemas as raw JSON text;
- validates row input locally where possible and relies on storage-write for
  authoritative validation;
- renders returned view models without local metric or health derivation.

## Test Expectations

Add focused tests in the owning layer:

- contract drift: `tooling/scripts/check-contracts.mjs`;
- BFF subject routing and validation: `apps/backend/src/ai-eval.test.ts`;
- frontend route/client behavior: `apps/frontend/test`;
- integration scenario fixtures: `apps/packages/integration-scenarios`;
- storage query/persistence: Go tests under `core/storage-read` and
  `core/storage-write`;
- runner and adapter lifecycle: Go runner tests plus opt-in adapter tests.

Before claiming completion, run the plan-level gates from
`plans/ai-eval-v2-migration/implementation-plan.md`.
