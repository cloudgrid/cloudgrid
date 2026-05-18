---
id: TEC-FE-008
title: AI evaluation UX concept
layer: frontend
status: approved
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-17
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

Inside `/ai-eval`, use a route-local left rail with only the user jobs that are
owned by AI Eval:

1. `Datasets`
2. `Scorers`
3. `Experiments`
4. `Production quality`

Do not add `Overview`, `Runs`, `Agent runs`, `Annotations`, or `Optimizations`
as route-local rail entries in v1. Production and experiment evidence must link
to `/traces` when the user needs to inspect execution detail. Annotation work is
surfaced from production quality or experiment result actions only when the
approved mutation and queue contracts support the action.

Project AI settings are not a primary AI Eval rail item. They live under the
admin settings shell at `/projects/:projectId/settings/ai-eval` and are linked
from empty states and admin actions.

## Layout Rules

- Route header, AI Eval rail, and main workspace are independent scroll
  containers.
- Primary data surfaces are not wrapped in cards.
- Use flat, border-led shadcn/Tailwind components.
- Use tables for datasets, dataset items, scorers, experiments, production
  policy lists, and quality segments.
- Do not render a permanent inspector that says "select a row" when no useful
  detail is selected. Details live inline in the current workspace. If a future
  detail surface needs an inspector, it opens only after a selection, is
  resizable on desktop, becomes a sheet on mobile, and does not duplicate facts
  already visible in the table.
- Do not add hero sections, marketing copy, nested cards, decorative gradients,
  or dashboard-like global stats outside project context.
- Do not show data that is not actionable in the current context. Repeated
  values may appear once in the most useful place, not again in a side panel.

## First-Use Flow

The first-use screen is an operational setup checklist in the main workspace.
It is not a landing page.

Checklist rows:

1. `Dataset`: creates a dataset or imports JSONL, JSON array, CSV, or ZIP
   files.
2. `Scorer`: creates a scorer from templates.
3. `Baseline experiment`: starts a baseline run when dataset and scorer exist.
4. `Production policy`: optional online scoring policy setup in Project
   Settings / AI Eval.

Each row has one primary action and one status. The UI must not require users to
understand NATS subjects, harness internals, trace IDs, scorer versions, or
provider credential plumbing before their first deterministic eval.

## Trace Evidence

AI Eval does not duplicate Traces as an `Agent runs` page. Any production or
experiment evidence row that needs execution inspection links to the existing
Traces route with the right trace/span context. The AI Eval route only shows the
evaluation assets and decisions around that evidence.

## Datasets

Datasets are managed as durable project assets.

Primary workspace:

- dataset list with name, version, item count, reviewed count, split coverage,
  last updated, tags, and health status;
- selected dataset item table with split, review status, input preview,
  expected preview, source trace/span, duplicate/leakage flags, and last result.

The dataset list and single-dataset workbench are separate route states. The
Datasets section first shows a full-width dataset overview table. Selecting a
dataset opens a dedicated dataset workbench that uses the available workspace
width for row management, import/export, and review. The row editor must feel
like a compact spreadsheet: visible columns for split, review status, input,
expected output, source trace/span, and validation state. Users can create rows
with structured controls, import bulk rows, and export datasets in v1. Product
UI must not expose dead controls or internal implementation phrases such as
`needs contract`.

Expected answers support two primary modes:

- text answer: one text field stored under the canonical `answer` key;
- JSON answer: users define expected output fields with name, type, and value
  controls. Scorer creation can target known paths without asking users to
  guess raw JSON paths.

Dataset split colors must be stable and non-dominant. Split labels are text plus
small swatches, not large badges.

### Dataset Import

Dataset import is a dedicated Datasets workflow view, reachable from the
selected dataset toolbar and represented in the URL with route state. It must
not be squeezed into a narrow side sheet.

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

- uses form controls and presets, not raw JSON editing, for common mappings;
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

The UI must show scorer version and calibration state. Common templates must be
configured through form fields such as match field, expected value type,
expected value, threshold, rubric text, and provider alias. Match field must be
a selectable known path from expected/model output shapes, not a free-text
input. Expected values support text, number, boolean, and JSON values. The
primary create/edit path must not expose a raw JSON text field. A read-only
technical definition preview may be available only when it helps debugging and
does not become the main input surface.

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

Experiment creation uses structured controls for solver kind/name, dataset
version, split, and scorer selection. It must not require the user to author a
solver JSON object.

## Optimizations

Optimizations are experiment runs with optimizer manifests and are not a
separate AI Eval rail entry until the contract is complete.

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
