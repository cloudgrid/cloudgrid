---
id: TEC-BE-015
title: AI evaluation query semantics
layer: backend
status: approved
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-31
provenance: from-user
depends_on: [DOM-006, TEC-BE-016, CAP-AIE-012, CAP-AIE-013]
---

# AI Evaluation Query Semantics

## Ownership

Storage-read owns every AI Eval read model:

- dataset search and row search;
- dataset health;
- dataset version reads;
- candidate search;
- evaluation definition search;
- evaluation run detail;
- item run search;
- metric aggregation;
- comparisons;
- optimization detail;
- prompt optimization family diagnosis, prompt/example step detail, rejected
  change summaries, and prompt/example diff view models;
- skill optimization step detail, rejected-edit summaries, best skill artifact
  refs, and skill diff view models;
- target snapshot reads and diffs;
- live run fanout.

BFF forwards GraphQL query inputs. Frontend renders returned view models.
Neither BFF nor frontend may recompute aggregate metrics or compare runs from
full item result sets.

## Dataset Reads

Dataset search supports project scope, name/text query, family, schema health,
curation counts, split counts, updated range, and cursor pagination.

Row search supports project/dataset/version scope, text query over safe indexed
previews, curation status, split, source ref, content treatment, validation
status, and cursor pagination.

Dataset health returns:

- row counts by curation status and split;
- schema validity counts;
- missing expected counts;
- duplicate/leakage warnings;
- input schema warning when JSON input has no schema;
- trace intake compatibility status;
- anonymization coverage;
- test split leakage warnings for optimization.

## Evaluation Reads

Run detail returns:

- run metadata and status;
- dataset version and target snapshot refs;
- aggregate metric cards;
- metric breakdowns by label/field/problem where applicable;
- item run table with actual output preview, expected preview, problems, and
  trace links;
- trajectory summary and important-step previews;
- effective retention role and expiry in advanced details.

Comparison reads return:

- baseline and candidate run IDs;
- target snapshot IDs;
- metric deltas;
- hard constraint results;
- tradeoff summary;
- regression and improvement examples;
- recommendation summary when available.

## Optimization Reads

Optimization detail returns:

- run metadata, status, objective, search policy, and budget snapshot;
- baseline, current, selected, and promoted target snapshot refs;
- caused evaluation run refs and comparison refs;
- quick-shot policy when present;
- skill optimization detail when `optimizerKind = skill_text_edit`;
- prompt optimization detail when `optimizerKind` is `bootstrap_fewshot` or
  `critic_mutate_judge_pick` for classification or extraction datasets;
- effective retention role and expiry in advanced details.

Prompt optimization detail returns:

- family: `classification` or `extraction`;
- baseline, current, and best target snapshot IDs;
- accepted/rejected/skipped/failed step counts;
- latest family diagnosis summary;
- paginated prompt optimization step rows ordered by epoch and step;
- proposed, selected, and rejected prompt/example changes with bounded previews;
- quick-shot and validation run refs;
- gate decision, training score, validation score, and problem summary per step;
- target diff refs for accepted and selected candidates.

Skill optimization detail returns:

- baseline, current, and best skill digests;
- best target snapshot ID and exported skill content ref when present;
- accepted/rejected/skipped/failed step counts;
- paginated step rows ordered by epoch and step;
- selected edits and rejected edit summaries with bounded content previews;
- gate decision, training score, validation score, and problem summary per step;
- target diff refs for accepted and selected candidates.

Storage-read owns Markdown diff preparation for skill parts when both baseline
and candidate content refs are readable under retention policy. The BFF and
frontend must not fetch full target snapshots and compute route-primary diffs
locally. If content expired or policy forbids returning it, storage-read returns
a degraded diff state with digests, summaries, and retention explanation.

Storage-read also owns prompt/example diff preparation for classification and
extraction prompt optimization. If content expired or policy forbids returning
it, storage-read returns a degraded diff state with target part digests,
summaries, and retention explanation.

## Aggregation Rules

Storage-read groups and aggregates metric results by metric ID/version, family,
label, JSON field path, problem code, step kind, tool name, split, target
snapshot, and run where requested.

Aggregation must honor metric payload types. Unknown JSON payloads are not
aggregated except as opaque evidence refs.

## Live Fanout

GraphQL subscriptions use storage-read live subjects. Runner and storage-write
publish durable progress changes; storage-read authorizes and fans out
GraphQL-ready events. BFF must not subscribe directly to runner internals.
