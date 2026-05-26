# AI Eval Configuration And Operations

Use this reference for setup, runtime configuration, operator limits, and
troubleshooting.

## Feature Flags And Routes

Enable AI Eval surfaces:

```sh
CLOUDGRID_AI_EVAL_ENABLED=true
VITE_CLOUDGRID_AI_EVAL_ENABLED=true
```

Routes:

- `/ai-eval?tab=datasets`
- `/ai-eval?tab=evaluations`
- `/projects/:projectId/settings/ai-eval`

Production measurement is backlog and is not a primary AI Eval v2 tab.

## Service Boundary

AI Eval follows the CloudGrid private-service model:

- Frontend talks only to the TypeScript BFF.
- BFF talks to private services through NATS message contracts.
- storage-write is the only AI Eval persistence mutator.
- storage-read owns query semantics, aggregates, cursors, and live fanout.
- runner owns evaluation and optimization lifecycle.
- external adapters or harness deployments own black-box agent/workflow
  execution.
- control-plane owns project AI settings and provider profile metadata.

## External Adapter

Simple targets can run inside the AI harness. Complex agents and workflows can
use an adapter URL. The runner calls the adapter with the dataset input and
OpenTelemetry trace context, then records the returned or webhook-reported final
output as evaluation evidence.

Adapter defaults:

- propagate trace context;
- bound request timeouts;
- return schema-valid output;
- report adapter timeout as evaluation evidence;
- keep provider credentials outside CloudGrid.

## Safe Defaults

Recommend safe defaults:

- start with a small validation split;
- keep JSON Schema strict enough to catch invalid expected output;
- keep quick-shot sample sizes small and persisted;
- require full validation evidence before promotion;
- keep `test` split out of candidate generation;
- retain durable metrics, comparisons, target snapshots, and promotion records.

## Troubleshooting

AI Eval entry missing:

- Check `CLOUDGRID_AI_EVAL_ENABLED`.
- Check `VITE_CLOUDGRID_AI_EVAL_ENABLED` for frontend builds.
- Confirm a project is selected.

Dataset row rejected:

- Validate raw JSON syntax.
- Validate expected output against dataset JSON Schema.
- Use only `training`, `validation`, or `test` split values.
- Use only v2 curation statuses.

Run does not start:

- Dataset must have ready rows in the selected split.
- Target ref, metric settings, and run policy must be valid.
- Runner must reach storage-read, storage-write, and any external adapter.

Promotion disabled:

- A selected candidate target snapshot is required.
- A comparison is required.
- Full validation evidence is required; quick-shot alone is not enough.

## Verification Commands

Use the narrowest relevant checks plus contract gates for interface changes:

```sh
bun run contracts:check
bun run --cwd apps/frontend test -- ai-eval
bun run --cwd apps/packages/integration-scenarios test
bun run --cwd website build
go test -tags surrealdb ./core/storage-read/... ./core/storage-write/... ./core/ai-eval-runner/...
bun run skills:check
```
