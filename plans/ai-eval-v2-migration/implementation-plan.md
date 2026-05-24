# AI Eval v2 Implementation Migration Plan

Status: ready

Source specs:

- `specs/01-domains/ai-eval.md`
- `specs/03-contracts/ai-eval-v2-contract-rewrite.md`
- `specs/03-contracts/graphql/public-schema.graphql`
- `specs/03-contracts/messages/message-bridge.asyncapi.yaml`
- `specs/04-backend/ai-eval-*.md`
- `specs/05-frontend/ai-eval-*.md`
- `specs/06-nfr/ai-eval-*.md`

## Goal

Replace the legacy Scorer/Experiment implementation behavior with the v2
Dataset, Evaluation, Metric, Target, Comparison, and Optimization model while
preserving CloudGrid service boundaries.

## Current Gate State

- `bun run contracts:check` passes.
- `bun run typecheck` passes.
- Legacy subject literals are removed from the contract registry gate.
- Remaining work is behavioral migration in runner, frontend, integration
  tests, and docs.
- `TICKET-202` and `TICKET-203` are complete; wave 03 can start from durable
  storage-write v2 persistence and storage-read v2 query semantics.

## Waves

1. `wave_01_backend_foundation`: BFF validation, bridge methods, resolvers, and
   compatibility-shell removal.
2. `wave_02_parallel_services`: storage-write persistence and storage-read
   query semantics in parallel.
3. `wave_03_runner_frontend`: runner orchestration and frontend UX migration in
   parallel after service contracts are implemented.
4. `wave_04_integration_docs`: end-to-end tests, handbook docs, and final gates.

## Global Rules

- Do not reintroduce public `Scorer`, `Experiment`, `ExperimentRun`,
  `EvalResult`, `reviewStatus`, `targetShape`, `dev`, `optimization`,
  `regression`, or `holdout` as v2 product concepts.
- Keep frontend as a dumb GraphQL client.
- Keep BFF private service access through NATS request/reply only.
- Keep storage-write as the only SurrealDB mutator and storage-read as the only
  telemetry/evaluation query owner.
- Keep production measurement backlog-only except for reusable metric/result
  infrastructure.

## Verification

Default gates:

```sh
bun run contracts:check
bun run typecheck
node /Users/sebastianwessel/.agents/skills/spec-architect/scripts/check_specs.mjs specs
```

Service gates are listed per ticket. External adapter/provider tests are opt-in
and must not run in default root scripts.
