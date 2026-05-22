---
id: TEC-BE-015
title: AI evaluation query semantics
layer: backend
status: approved
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-22
provenance: from-user
depends_on: [DOM-006, TEC-BE-008]
---

# AI Evaluation Query Semantics

## Ownership

Storage-read owns AI-eval read semantics, including agent-run search, dataset
item filtering, dataset health, split leakage checks, scorer lookup,
experiment manifest resolution, experiment scoreboard aggregation, eval-result
search, transcript view-model derivation, production quality summaries, online
policy matching, dataset candidate search, failure clustering, coverage-gap
analysis, anonymization provenance views, item quarantine views, and annotation
queue facets.

Storage-read also owns scorer-specific result analytics and display view models:
classification accuracy and confusion matrices, JSON/schema issue summaries,
LLM-judge fact and rubric coverage, RAG grounding and recall metrics,
tool-correctness summaries, trajectory/workflow step summaries, human review
distribution, and composite gate breakdowns.

## Required Pushdown

Storage-read adapters must push down supported filters, sorting, cursor predicates, counts, and bounded facets for:

- Agent runs by agent ID, agent name, status, time range, duration, token totals, cost estimate range, experiment run ID, and free text over safe indexed fields.
- Dataset items by dataset ID, version, split, review status, source trace/span
  presence, tags, metadata text, target shape, content treatment,
  anonymization policy, duplicate candidate status, synthetic flag, quarantine
  status, token-limit status, flaky status, and schema validation status.
- Eval results by scorer ID, scorer version, target kind, target ID, pass/fail, score range, time range, and experiment run ID.
- Eval result analytics by scorer family, label/category, rubric criterion,
  fact importance, schema path, tool name, trajectory step, workflow phase, RAG
  document/source, and composite gate.
- Experiments and runs by dataset, split selector, scorer, solver, prompt
  version, skill snapshot, tool snapshot, provider profile, status, tag, and
  time range.
- Annotation queue by status, reason, assignee, target kind, and time range.
- Production quality summaries by agent, environment, route, service, tool,
  retrieval source, model, provider profile, prompt version, policy, scorer,
  and time bucket.
- Online policy matching by project ownership, policy selector, projection kind,
  source trace/span, agent identity, model/provider, tool name, retrieval source,
  service, route, environment, and safe indexed attributes.
- Dataset candidates by source kind, source trace/span, scorer, policy,
  experiment run, failure cluster, status, dataset ID, target shape,
  content treatment, anonymization policy, review owner, and time range.
- Coverage gaps by dataset, route, service, tool, retrieval source, model,
  prompt version, workflow, scorer, split, and production segment.

## Allowed Adapter-Side Derivations

- Score histogram buckets when the database lacks native histogram functions.
- Dataset item by run cross-tab shape when the database cannot pivot cleanly.
- Transcript messages from already bounded source span events and OpenInference message attributes.
- Final scoreboard summary shape from pushed-down aggregate rows.
- Confusion matrices from pushed-down `(expectedLabel, predictedLabel)` counts.
- LLM-judge coverage summaries from pushed-down fact/criterion result rows.
- RAG, tool, trajectory, workflow, and composite scorer breakdowns from bounded
  scorer-specific metric rows.
- Dataset health view models from pushed-down counts and bounded duplicate
  candidates.
- Production quality view models from pushed-down aggregate rows.
- Manifest resolution from stored dataset, scorer, settings, prompt, skill, and
  tool references.
- Failure cluster and dataset candidate summaries from pushed-down source result
  groups and bounded representative evidence.
- Quarantine recommendations from repeated item-specific technical failures,
  token-limit failures, invalid JSON, missing required evidence, and unsupported
  target shapes.
- Coverage-gap view models from pushed-down production and dataset segment
  counts.

All derivations remain inside storage-read. The BFF and frontend render returned view models only.

## Aggregation View Models

Storage-read aggregation payloads must conform to
`specs/03-contracts/entities/ai/eval-aggregation.schema.json`.

Experiment run summary:

- `itemCounts` counts only item-run terminal/current states and separates
  model-quality states from skipped, quarantined, errored, and review states.
- `scoreSummaries` are grouped by `(scorerId, scorerVersion)` and include pass
  rate, mean score, p50/p95 where meaningful, support, result kind, and the
  scorer-specific visualization payload.
- `problemCounts` separates `modelQuality`, `itemQuality`, `scorerConfig`, and
  `infrastructure`.
- `budgetUsage` is derived from persisted item runs and eval results, not from
  frontend estimates.
- `regressions` are computed against the manifest baseline only when the
  baseline is present and comparable.

Production quality overview:

- `segments` are pushed-down aggregates by the requested dimensions only:
  agent, environment, route, service, tool, retrieval source, model, provider
  profile, prompt version, policy, and scorer.
- `trend` uses storage-read-selected time buckets over the requested time
  window.
- `skippedReasons` count skipped production measurements without treating them
  as model-quality failures.
- `candidateSuggestions` are summaries of reviewable dataset candidates or
  coverage gaps; they are not dataset mutations.

The BFF must not reshape these aggregates beyond GraphQL field naming and
authorization filtering already defined by the bridge. The frontend must not
join raw eval rows to recreate aggregate values.

## Forbidden Derivations Outside Storage-Read

The BFF and frontend must not derive:

- dataset split counts or leakage state;
- production quality trend lines;
- online policy matches;
- experiment manifests;
- scoreboard deltas;
- confusion matrices;
- per-category accuracy;
- fact coverage summaries;
- scorer-specific visualization data;
- prompt or tool regression summaries;
- scorer calibration summaries;
- token or cost totals from raw span rows.
- dataset candidate clusters;
- coverage gaps;
- anonymization status summaries;
- item quarantine eligibility.
