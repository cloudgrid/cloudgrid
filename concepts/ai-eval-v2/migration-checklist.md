# AI Eval v2 Migration Checklist

Date: 2026-05-24

Status: intermediate checklist, not implementation plan

## Source Artifacts

- Concept source: [concept-spec.md](./concept-spec.md)
- Brainstorm source: [../../brainstorm/ai-eval](../../brainstorm/ai-eval/README.md)

## Decisions Locked For Initial Spec Edits

- `expectedJsonSchema` is required when `expectedType = json`.
- `inputJsonSchema` is optional when `inputType = json`.
- v2 uses one `curationStatus` enum.
- rows without corrected `expected` are not evaluation-eligible.
- evaluation runs reference immutable dataset versions and item revisions.
- v1 metric capabilities cover classification, extraction, freeform answer,
  and always-on trajectory metrics.
- v1 target kinds are `prompt` and `external_adapter`.
- CloudGrid owns evaluation prompt snapshots.
- external adapter targets use trace context propagation and sync or async
  polling result retrieval.
- optimization objective is explicit and persisted.
- quick-shot uses selected item IDs, strategy, seed, and minimum sample rules.
- default retention profile is `balanced` with concrete TTL defaults.

See [Decisions](./decisions.md) for the current answers. The remaining
implementation-level detail is exact field naming and generated contract shape,
not product direction.

## Later Decisions

- Harness agent/workflow/skill discovery mechanism.
- Webhook support for external adapters.
- Skill/tool/workflow optimization semantics.
- Production quality expected-output/success source model.

## Spec Files Likely To Change

Dataset and flows:

- `specs/02-capabilities/ai-eval/curate-datasets.md`
- `specs/02-capabilities/ai-eval/annotate-traces.md`
- `specs/03-flows/ai-eval/dataset-curation-and-splits.md`
- `specs/03-flows/ai-eval/dataset-import-export.md`

Evaluation and optimization:

- `specs/01-domains/ai-eval.md`
- `specs/02-capabilities/ai-eval/evaluate-offline.md`
- `specs/02-capabilities/ai-eval/optimize-prompts.md`
- `specs/03-flows/ai-eval/offline-experiment-run.md`
- `specs/03-flows/ai-eval/live-experiment-subscription.md`

Backend:

- `specs/04-backend/ai-eval-runner.md`
- `specs/04-backend/ai-eval-query-semantics.md`
- `specs/04-backend/ai-eval-message-contracts.md`
- `specs/04-backend/ai-eval-dataset-transfer.md`
- `specs/04-backend/data-retention-policy.md`

Frontend:

- `specs/05-frontend/ai-eval-views.md`
- `specs/05-frontend/ai-eval-ux-concept.md`

Contracts:

- `specs/03-contracts/graphql/public-schema.graphql`
- `specs/03-contracts/messages/message-bridge.asyncapi.yaml`
- `specs/03-contracts/entities/ai/dataset-item-shape.schema.json`
- `specs/03-contracts/entities/ai/eval-result-payload.schema.json`
- existing scorer, experiment, run, manifest, prompt-version schemas.

## Migration Steps

1. Rename/reframe product model in specs:
   - remove primary UX dependence on Scorers and Experiments;
   - introduce Datasets and Evaluations as primary model;
   - move Production quality to backlog/consumer role where appropriate.

2. Rewrite dataset model:
   - dataset-level schemas;
   - dataset versions and item revisions;
   - `evaluationFamily`;
   - `observedOutput`;
   - `reason`;
   - curation status;
   - simplified splits;
   - trace extraction settings.

3. Introduce evaluation target model:
   - `EvaluationTargetRef`;
   - target snapshots;
   - target part snapshots;
   - target diffs;
   - promotion records;
   - candidate target snapshots;
   - external adapter target contract with trace context propagation and async
     polling shape;
   - external adapter auth, idempotency, status, error, timeout, cancellation,
     and conformance semantics.

4. Replace scorer concept:
   - remove Scorers as user-facing project assets;
   - define internal metric capabilities;
   - define metric settings and metric result records;
   - define typed metric payload schemas and shared problem taxonomy.

5. Replace experiment concept:
   - define dataset evaluation definitions;
   - define dataset evaluation runs;
   - define item runs;
   - define comparisons.

6. Define trace-backed item runs:
   - trace/root-span refs;
   - actual output;
   - trajectory summary;
   - important steps;
   - evidence refs;
   - content/reasoning policy.

7. Define optimization:
   - objective schema;
   - candidate snapshots;
   - quick-shot evaluation;
   - full validation/test evaluation;
   - promotion decision records.

8. Define retention:
   - profiles;
   - roles;
   - default TTLs;
   - pinning;
   - pruning.

9. Update GraphQL and AsyncAPI contracts.

10. Update entity schemas and contract tests.

11. Update frontend UX specs.

12. Update implementation plans by ownership boundary.

## Guardrails

- Do not implement from this folder directly.
- Do not add compatibility layers for old scorer/experiment UX unless a spec
  explicitly requires migration support.
- Keep BFF as GraphQL/message bridge only.
- Keep metric aggregation/comparison in storage-read.
- Keep row validation/versioning in storage-write.
- Keep harness execution in runner/harness.
- Keep external adapter execution behind runner-owned target adapter ports.
