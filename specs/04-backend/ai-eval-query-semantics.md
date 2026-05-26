---
id: TEC-BE-017
title: AI evaluation query semantics
layer: backend
status: approved
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-24
provenance: from-user
depends_on: [DOM-006, TEC-BE-016]
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
- trace extraction compatibility status;
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
