# AI Eval v2 Migration Plan

Status: contract-ready, implementation migration required

This plan tracks the remaining work required to implement AI Eval v2. The
machine-readable contracts now pass drift checks; BFF foundation, storage-write
persistence, storage-read query semantics, runner orchestration, and frontend
workspace behavior are complete. The remaining work is integration and
documentation migration from legacy Scorer/Experiment behavior to the v2
Dataset/Evaluation/Metric/Target model.

## Current Readiness

- Authoritative product, capability, flow, backend, frontend, and NFR specs are
  rewritten for AI Eval v2.
- GraphQL, AsyncAPI, entity JSON schemas, generated TypeScript subject metadata,
  and generated Go subject metadata now model the v2 Dataset, Evaluation,
  Metric, Target, Comparison, and Optimization concepts.
- Legacy entity schemas for Scorer, Experiment, ExperimentRun, EvalResult, old
  optimization refs, and dataset item runs were removed from the spec contract
  tree.
- `bun run contracts:check` passes.
- `TICKET-201`, `TICKET-202`, `TICKET-203`, `TICKET-204`, and `TICKET-205` are
  complete.

## Remaining Runtime Drift

Contract drift checks pass, and the implementation migration is now limited to
final integration fixtures, docs, and any runtime environment drift found by
those gates.

Browser verification of `TICKET-205` found one local runtime drift signal: the
current BFF schema expects v2 dataset fields such as `currentVersionId`, but the
locally available bridge/runtime data returned older dataset objects. `TICKET-206`
should make this visible in integration fixtures before declaring end-to-end
completion.

The removed product concepts are:

- `eval.scorer.*`
- `eval.experiment.*`
- `eval.manifest.resolve`
- `eval.prompt_version.promote`
- `eval.quality.overview`
- `eval.online.policy_matches.resolve`
- `annotation.queue.*`
- `annotation.item.*`

## Required Migration Waves

1. Contract completion
   - Replace runtime subject constants with v2 subjects.
   - Replace old request/response DTOs and bridge parsers with v2 Dataset,
     Evaluation, Metric, Target, Comparison, and Optimization DTOs.
   - Keep `bun run contracts:check` as the gate.

2. Storage services
   - Update storage-write persistence from experiment/scorer/result rows to
     dataset versions, item revisions, evaluation runs, item runs, metric
     results, aggregates, comparisons, target snapshots, optimization runs, and
     promotion records.
   - Update storage-read query semantics to return GraphQL view models without
     BFF-side aggregation.
   - Status: complete.

3. Runner and adapter
   - Replace experiment run handlers with evaluation run handlers.
   - Persist per-row trace refs, trajectory summaries, important steps, metric
     results, and retention roles.
   - Implement quick-shot selection and external adapter invocation exactly as
     specified.
   - Status: complete.

4. BFF bridge and GraphQL
   - Replace legacy resolver methods and validation schemas with v2 operations.
   - Keep frontend as a dumb GraphQL client and route every private operation
     through the NATS message bridge.

5. Frontend
   - Replace Scorer/Experiment UI with Dataset Evaluation, Optimization, and
     Dataset workspace views.
   - Keep production measurement out of primary navigation.
   - Keep trace-to-dataset import limited to datasets with extraction settings.
   - Status: complete.

6. Integration and docs
   - Add end-to-end dataset evaluation and optimization fixtures.
   - Update handbook docs only after the implemented behavior passes contracts.

## Gate To Execute Migration Tickets

Start implementation migration tickets from the v2 specs and keep these gates
green:

```sh
bun run contracts:check
node /Users/sebastianwessel/.agents/skills/spec-architect/scripts/check_specs.mjs specs
```

Implementation agents must not build new behavior against the legacy AI Eval
runtime shape.
