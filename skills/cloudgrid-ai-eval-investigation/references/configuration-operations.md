# AI Eval Configuration And Operations

Use this reference for setup, runtime configuration, operator limits, and
troubleshooting.

## Feature Flags And Routes

Enable AI Eval surfaces and runner integration:

```sh
CLOUDGRID_AI_EVAL_ENABLED=true
CLOUDGRID_AI_EVAL_HARNESS_URL=http://localhost:8090
```

The frontend may also use `VITE_CLOUDGRID_AI_EVAL_ENABLED` where the build-time
surface requires it.

Routes:

- `/ai-eval?tab=datasets`
- `/ai-eval?tab=scorers`
- `/ai-eval?tab=experiments`
- `/ai-eval?tab=production`
- `/projects/:projectId/settings/ai-eval`
- `/projects/:projectId/settings/ai-providers`

## Service Boundary

AI Eval follows the same CloudGrid private-service model:

- Frontend talks only to the TypeScript BFF.
- BFF talks to private services through NATS message contracts.
- storage-write is the only AI Eval persistence mutator.
- storage-read owns query semantics, manifest resolution, policy matching,
  aggregates, cursors, and live fanout.
- runner owns experiment lifecycle and calls the harness adapter.
- harness adapter owns model/provider execution and sandbox lifecycle.
- control-plane owns project AI settings and provider profile metadata.

## Harness Adapter

The runner calls the trusted-network harness adapter over HTTP:

- `POST /v1/run`
- `POST /v1/score`
- `POST /v1/optimize`
- `POST /v1/sandboxes/start`
- `POST /v1/sandboxes/pause`
- `POST /v1/sandboxes/resume`
- `POST /v1/sandboxes/abort`
- `POST /v1/sandboxes/cleanup`
- `GET /healthz`
- `GET /v1/agents`

The sandbox profile for v1 AI Eval is ephemeral. Durable replay is out of
scope for v1 and must not be described as enabled unless product behavior
changes.

## Safe Defaults

Recommend safe defaults before production policies:

- deterministic scorer first;
- low sample rate for online scoring;
- daily and per-run budget limits;
- max parallel request cap;
- timeout and retry policy;
- explicit target filters before enabling online policies;
- no automatic dataset commit from candidates.

## Troubleshooting

AI Eval entry missing:

- Check `CLOUDGRID_AI_EVAL_ENABLED`.
- Check frontend build flag if the UI hides feature-gated routes.
- Confirm a project is selected.

Run does not start:

- Dataset must exist and have a usable version.
- At least one scorer must exist.
- Solver and provider/model refs must be valid.
- Runner must reach storage-read, storage-write, control-plane, and harness.
- Harness URL must be set when AI Eval is enabled.

Candidate commit fails:

- Reload dataset for current version.
- Confirm candidates are ready and belong to the project.
- Check anonymization provenance and stale policy versions.
- Do not retry by bypassing `expectedDatasetVersion`.

Production quality empty:

- Confirm the policy is enabled.
- Check target filters and sample rate.
- Check skipped reasons returned by `aiQualityOverview`.
- Confirm runner and storage-read are reachable through the message bridge.

Privacy issue suspected:

- Do not print raw prompts, completions, provider payloads, tokens, cookies,
  Authorization headers, or raw retrieved documents.
- Use IDs, summaries, bounded excerpts, and route links.
- Check logs for canonical error IDs, not raw provider errors.

## Verification Commands

Use the narrowest relevant checks plus contract gates for interface changes:

```sh
bun run contracts:check
bun test --coverage apps/backend/src
bun run --cwd apps/frontend test
bun run --cwd apps/frontend smoke -- ai-eval.e2e.ts
bun run --cwd website build
go test -tags surrealdb ./core/storage-read/... ./core/storage-write/... ./core/ai-eval-runner/...
bun run skills:check
```
