---
id: TEC-FE-008
title: AI evaluation UX concept
layer: frontend
status: approved
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-16
provenance: from-user
depends_on: [TEC-FE-007, TEC-BE-024, TEC-BE-015, DSY-001]
---

# AI Evaluation UX Concept

## Purpose

The AI Eval UI must make advanced evaluation workflows understandable without
turning CloudGrid into a wizard-heavy product. Users should understand the loop:

> Observe production evidence, curate datasets, score runs, improve prompts and
> skills, then monitor production quality.

The UI follows `specs/05-frontend/product-ux-concept.md` and `DESIGN.md`.

## Navigation

AI Eval is a project-scoped route shown in the left project/domain sidebar when
the selected project has AI Eval enabled or setup is allowed. The frontend
feature is enabled by default and may be explicitly disabled with
`CLOUDGRID_AI_EVAL_ENABLED=false` or `VITE_CLOUDGRID_AI_EVAL_ENABLED=false`.

The app-wide 56px topbar remains the only app-wide navigation surface.

Inside `/ai-eval`, use a route-local left rail with these sections:

1. `Overview`
2. `Runs`
3. `Datasets`
4. `Scorers`
5. `Experiments`
6. `Optimizations`
7. `Production`
8. `Annotations`

Project AI settings are not a primary AI Eval rail item. They live under the
admin settings shell at `/projects/:projectId/settings/ai-eval` and are linked
from empty states and admin actions.

## Layout Rules

- Route header, AI Eval rail, main workspace, and right inspector are
  independent scroll containers.
- Primary data surfaces are not wrapped in cards.
- Use flat, border-led shadcn/Tailwind components.
- Use tables for datasets, scorers, experiments, production policy lists, and
  annotation queues.
- Use a right inspector drawer for selected run, dataset item, scorer,
  experiment, prompt candidate, policy, and annotation details.
- On mobile, the AI Eval rail becomes a sheet and inspectors become bottom
  sheets.
- Do not add hero sections, marketing copy, nested cards, decorative gradients,
  or dashboard-like global stats outside project context.

## First-Use Flow

The first-use screen is an operational setup checklist in the main workspace.
It is not a landing page.

Checklist rows:

1. `Telemetry detected`: links to Traces when no AI spans exist.
2. `Provider profile`: links to Project Settings / AI Eval.
3. `Dataset`: creates a dataset or imports JSONL, JSON array, CSV, or ZIP
   files.
4. `Scorer`: creates a scorer from templates.
5. `Baseline experiment`: starts a baseline run when dataset and scorer exist.
6. `Production policy`: optional online scoring policy setup.

Each row has one primary action and one status. The UI must not require users to
understand NATS subjects, harness internals, trace IDs, scorer versions, or
provider credential plumbing before their first deterministic eval.

## Overview

The overview summarizes the evaluation loop for the selected project:

- latest production quality trend;
- active baseline prompt/skill snapshot;
- recent experiment comparisons;
- dataset health;
- annotation backlog;
- budget use;
- missing setup warnings.

All summary values are GraphQL view models from storage-read or control-plane.
The frontend does not compute scoreboards, dataset health, or budget state from
raw rows.

## Runs

The Runs section shows observed agent runs and experiment-linked runs.

Primary table columns:

- start time;
- agent;
- status;
- trace link;
- duration;
- token total;
- cost estimate;
- eval status;
- experiment run;
- annotation state.

Selecting a row opens an inspector with:

- transcript;
- timeline of LLM/tool/retrieval calls;
- eval results;
- prompt/skill snapshot refs when present;
- source trace and logs pivots.

## Datasets

Datasets are managed as durable project assets.

Primary workspace:

- dataset list with name, version, item count, reviewed count, split coverage,
  last updated, tags, and health status;
- selected dataset item table with split, review status, input preview,
  expected preview, source trace/span, duplicate/leakage flags, and last result.

Inspector:

- full input and expected output;
- metadata and schema validation issues;
- source trace/span preview;
- split assignment;
- reviewer notes;
- result history;
- safe actions to move split, update expected output, mark reviewed, duplicate,
  or remove from next version.

Dataset split colors must be stable and non-dominant. Split labels are text plus
small swatches, not large badges.

### Dataset Import

The dataset import experience is a compact side sheet launched from the Datasets
workspace.

Flow:

1. Upload file.
2. Review detected files.
3. Map fields.
4. Preview rows.
5. Commit.

Upload step:

- accepts `.jsonl`, `.json`, `.csv`, and `.zip`;
- shows file name, size, detected format, and upload expiry;
- shows ZIP contents in a dense table when applicable.

Mapping step:

- uses form controls, not raw JSON editing, for common mappings;
- shows CSV columns or JSON path examples from previewable source fields;
- maps into `input`, `expected`, `metadata`, source pointers, split, and review
  status;
- exposes constants/defaults as explicit controls;
- does not offer arbitrary scripts, templates, regex replacements, or computed
  transforms in v1.

Preview step:

- shows total rows, valid rows, error rows, warnings, and sampled preview rows;
- shows source file path and row number for every issue;
- disables commit when errors exist unless the user explicitly chooses partial
  commit.

Commit step:

- shows resulting dataset version and links to dataset health.

### Dataset Export

Export is a small dialog from the selected dataset toolbar. It supports JSONL,
JSON array, and CSV. The UI must describe exports as canonical CloudGrid
dataset-item data, not a recreation of the original uploaded file layout.

## Scorers

Scorer creation starts from templates:

- exact match;
- JSON schema;
- contains/regex;
- semantic similarity;
- RAG faithfulness/context recall;
- LLM judge rubric;
- tool correctness;
- trajectory/task completion;
- human review.

The scorer editor uses progressive disclosure:

1. name and scorer kind;
2. template-specific required fields;
3. calibration dataset/split;
4. thresholds;
5. judge provider alias when needed.

The UI must show scorer version and calibration state. It must not hide scorer
definitions in opaque JSON for common templates; raw JSON is an advanced drawer
section.

## Experiments

Experiments compare immutable run manifests.

Primary workspace:

- experiment list;
- selected experiment scoreboard;
- baseline versus candidate comparison;
- segment breakdown;
- per-item diff table.

Scoreboard columns:

- run;
- solver/prompt/skill snapshot;
- status;
- pass rate;
- mean score;
- p50/p95 latency;
- cost;
- regression count;
- item count;
- started/ended.

Candidate promotion is always explicit. The UI must show why a candidate cannot
be promoted: missing holdout, budget exceeded, quality regression, latency
regression, cost regression, failed required scorer, or stale baseline.

## Optimizations

Optimizations are experiment runs with optimizer manifests.

Supported UX:

- select dataset and allowed splits;
- select base prompt version or skill snapshot;
- select optimizer kind;
- select scorer set and baseline;
- preview budget;
- start run;
- compare candidates;
- promote selected candidate to a tag.

Small-dataset mode must explain confidence limits in concise operational copy
and must prevent using `holdout` as optimizer input.

## Production

Production shows online scoring policies and live quality signals.

Primary workspace:

- policy list with target, sample rate, scorers, budget use, last match, and
  enabled state;
- quality trend by agent, environment, route, tool, retrieval source, and model;
- cost and latency trend;
- alert/regression state when alerting contracts exist.

Policy editing belongs in an inspector or settings drawer. The frontend never
evaluates policy matches locally.

## Annotations

Annotations turn failures into dataset improvements.

Queue table columns:

- created time;
- reason;
- target trace/span;
- scorer;
- score;
- agent;
- assigned user;
- status;
- proposed dataset.

The inspector supports:

- view source trace;
- compare input/output;
- set expected output;
- assign split;
- create or update dataset item;
- dismiss with reason;
- reopen.

If captured content is missing, the UI must ask for explicit user input rather
than fabricating prompt, completion, tool, or retrieval content.

## Project AI Settings

Project Settings / AI Eval contains:

- enable AI Eval toggle;
- provider profiles;
- model aliases;
- default judge, optimizer, embedding, and replay models;
- harness adapter reference;
- budget and sampling defaults;
- online scoring policies;
- dataset split defaults.

The settings page uses the existing admin settings shell. It does not introduce
another global navigation surface.

## Empty And Error States

Required empty states:

- AI Eval feature disabled;
- project AI Eval disabled but user can configure it;
- no AI telemetry detected;
- no provider profile;
- no dataset;
- no reviewed dataset items;
- no scorer;
- no baseline run;
- no online policies;
- no annotations.

Required error states:

- harness unavailable;
- provider profile missing or disabled;
- budget exhausted;
- scorer validation failed;
- dataset split leakage detected;
- content capture disabled or missing;
- unauthorized settings mutation;
- stale settings version.

Each state has one primary next action and one secondary learn-more or pivot
action at most.

## Accessibility And Simplicity

- Every interactive table supports keyboard row focus and inspector open.
- Action buttons use clear icons with tooltips.
- Template forms expose only required fields first.
- Advanced JSON configuration is available but never the default path.
- Long JSON values use bounded previews and copy actions.
- No control relies on color alone for split, pass/fail, or regression status.

## Verification

Required frontend tests:

- AI Eval nav appears when the frontend feature is enabled and disappears when
  explicitly disabled;
- first-use checklist routes to correct project settings and AI Eval sections;
- no route-primary data surface is wrapped in cards;
- dataset split controls do not mutate local-only truth;
- scorer templates render required fields without raw JSON first;
- experiment scoreboard uses GraphQL summary values only;
- promotion disabled reasons render for every blocker;
- content-missing promotion requires user-supplied input;
- mobile rail and inspector behavior remains usable.
