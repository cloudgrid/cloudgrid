---
id: TEC-FE-008
title: AI evaluation UX concept
layer: frontend
status: approved
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-24
provenance: from-user
depends_on: [DOM-006, TEC-FE-007, DSY-001]
---

# AI Evaluation UX Concept

## Purpose

The AI Eval UI must make the evaluation loop easy to use:

1. Create or import a dataset.
2. Add rows with input, expected output, and optional reason.
3. Run a dataset evaluation against a target.
4. Inspect metrics, item results, and trace-backed summaries.
5. Optimize prompts/examples when useful.
6. Compare candidates and explicitly promote one.

Do not expose implementation vocabulary as the primary UX. Users should see
datasets, evaluations, runs, metrics, comparisons, optimization, and targets.
They should not need to understand scorer entities, checks, gates, experiment
manifests, digests, or target parts for normal work.

## Navigation

AI Eval is available at `/ai-eval` when enabled for the selected project.

Route-local sections are exactly:

1. `Datasets`
2. `Evaluations`

Do not add route-local primary entries for `Scorers`, `Checks`,
`Experiments`, `Runs`, `Annotations`, or `Production quality` in v2.

Project AI Eval settings remain in
`/projects/:projectId/settings/ai-eval` and are linked from setup/empty states.

## Layout Rules

- Follow `specs/05-frontend/product-ux-concept.md` and `DESIGN.md`.
- Use the global topbar and project/domain sidebar only as defined by product UX.
- AI Eval route header, local section rail/tabs, main workspace, and optional
  detail drawer are independent scroll containers.
- Primary data surfaces are tables or full-width workspaces, not cards wrapped
  in cards.
- Use shadcn/ui and Tailwind semantic tokens with flat, border-led styling.
- Do not add hero sections, decorative gradients, marketing copy, or global
  stats dashboards.
- Advanced/debug details may use drawers or sheets. They must not be required
  for first-run success.

## First Use

The first-use screen is an operational checklist:

- create or import a dataset;
- add at least one `ready` row;
- create an evaluation;
- run baseline evaluation;
- optionally start optimization.

The checklist must not mention NATS, SurrealDB, harness internals, target
snapshot digests, metric capability IDs, or provider credential plumbing.

## Datasets Section

Datasets list columns:

- name;
- evaluation family;
- input/expected type;
- current version;
- ready item count;
- split coverage;
- schema health;
- last updated.

Dataset detail contains:

- settings;
- health;
- versions;
- rows;
- import/export.

Row table columns:

- split;
- curation status;
- input preview;
- expected preview;
- reason preview;
- observed output indicator;
- source;
- validation state;
- updated at.

Row editor:

- text area for text values;
- raw JSON text area for JSON values;
- schema validation errors inline;
- optional reason text area;
- curation status selector;
- split selector;
- metadata editor for simple key/value strings only in v2.

Do not build a visual JSON builder. Raw JSON plus schema validation is the v2
path.

Trace import:

- Trace detail and overview show `Add to dataset` where AI Eval is enabled.
- Picker lists only datasets with compatible extraction settings.
- Import preview shows extracted input, observed output, proposed expected
  value when trusted, curation status, split, and anonymization treatment.
- User can edit before commit.

## Evaluations Section

Evaluation list columns:

- name;
- dataset;
- split selector;
- target;
- last run status;
- primary metric;
- last updated.

Create evaluation requires:

- dataset;
- dataset version policy: latest ready or pinned;
- split selector;
- target;
- metric settings, defaulted from dataset;
- run policy, defaulted from project settings.

Run detail shows:

- status and progress;
- aggregate metrics;
- metric breakdowns;
- item run table;
- actual/expected preview;
- trajectory summary;
- important steps;
- problems;
- trace links;
- retention expiry in advanced details.

Comparison view shows:

- baseline run;
- candidate run;
- target diff summary;
- metric deltas;
- hard constraint results;
- regression examples;
- improvement examples;
- tradeoff metrics.

Optimization flow:

- starts from an evaluation, run, or comparison;
- shows objective defaults before start;
- shows quick-shot phase as an explicit phase when used;
- marks quick-shot results as exploratory;
- requires full validation before promotion evidence;
- shows prompt/example diffs separately;
- uses explicit `Promote` action.

## Advanced Details

Advanced views may show:

- dataset version ID and digest;
- item revision ID;
- target snapshot ID and digest;
- target parts;
- metric capability IDs;
- adapter request status and runRef;
- retention role and expiry.

These details are for debugging/audit. They must not be part of the normal
happy path.

## Acceptance Criteria

- A first-time user can create a dataset, add a row, create an evaluation, and
  start a run without seeing Scorers or Experiments.
- JSON expected output is edited as raw JSON and validated against the dataset
  schema.
- The trace `Add to dataset` picker shows only compatible datasets.
- Run detail links to trace detail instead of duplicating full traces.
- Optimization candidate review shows what changed and why it is better or
  worse according to visible metrics.
