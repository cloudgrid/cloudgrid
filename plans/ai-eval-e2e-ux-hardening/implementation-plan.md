# AI Eval E2E and UX Hardening Plan

Status: ready

Source specs:

- `specs/05-frontend/ai-eval-views.md`
- `specs/05-frontend/product-ux-concept.md`
- `specs/06-nfr/integration-test-suite.md`
- `specs/01-domains/ai-eval.md`
- `specs/04-backend/ai-eval-runner.md`
- `specs/03-contracts/graphql/public-schema.graphql`
- `specs/03-contracts/messages/message-bridge.asyncapi.yaml`

## Goal

Close the AI Eval v2 quality gaps found after the migration: shared full-stack
end-to-end testing with the deterministic harness adapter, stale legacy
integration script removal, and frontend UX labels/actions that match the
dataset/evaluation mental model.

## Current Gate State

- AI Eval v2 migration tickets are complete.
- Specs now require trace-to-dataset import entrypoints in Traces, dataset
  settings on dataset detail, unambiguous dataset/evaluation action labels, and
  v2 AI Eval full-stack integration coverage.
- Existing integration scripts still contain legacy scorer/experiment operation
  names and stale fake-service test behavior.

## Waves

1. `wave_01_shared_e2e_runtime`: replace duplicated fake AI Eval integration
   behavior with shared local E2E runtime hooks and deterministic harness
   adapter fixtures.
2. `wave_02_parallel_ai_eval_coverage`: add AI Eval v2 full-stack fake adapter
   coverage and frontend UX corrections in parallel.

## Global Rules

- Keep root/default `bun run test` hermetic and Docker-free.
- Keep Docker-backed full-stack coverage behind `bun run integration:local`.
- Use public GraphQL/HTTP/OTLP entrypoints for integration scenarios.
- Keep frontend as a dumb GraphQL client.
- Do not reintroduce Scorer, Experiment, quality overview, annotation queue, or
  live experiment concepts.

## Verification

Default:

```sh
bun run contracts:check
bun run typecheck
node /Users/sebastianwessel/.agents/skills/spec-architect/scripts/check_specs.mjs specs
node /Users/sebastianwessel/.agents/skills/implementation-planner/references/check_plan.mjs . plans/ai-eval-e2e-ux-hardening specs
```

Opt-in local integration:

```sh
bun run integration:local
```
