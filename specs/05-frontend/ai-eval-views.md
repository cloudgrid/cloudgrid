---
id: TEC-FE-007
title: AI evaluation views
layer: frontend
status: approved
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-16
provenance: from-user
depends_on: [DOM-006, TEC-BE-015, TEC-FE-008]
---

# AI Evaluation Views

## Feature Flag

AI evaluation routes render only when `CLOUDGRID_AI_EVAL_ENABLED=true`. When disabled, the frontend hides navigation entries and does not execute AI-eval GraphQL operations.

## Views

AI evaluation layout follows `05-frontend/product-ux-concept.md` and
`05-frontend/ai-eval-ux-concept.md`: feature-gated project workspace
navigation, route-local AI Eval rail, main workspace surface, and right
inspector drawer for run/dataset/scorer/experiment/optimization/policy/annotation
detail surfaces.

- Agent run timeline: trace waterfall with agent, model, tool, retrieval, token, and cost view models returned by GraphQL.
- Transcript: GraphQL-provided transcript messages for long-running agent traces.
- Dataset editor: dataset list, item list, version history, item create/edit, and span promotion.
- Dataset health: split coverage, reviewed count, duplicate candidates, leakage
  warnings, schema validation state, and small-dataset confidence.
- Scorer registry: deterministic, schema/JSON, semantic, RAG, LLM-judge,
  tool correctness, trajectory/task completion, and human scorer definitions.
- Experiment scoreboard: run comparison, pass-rate, mean score, p50/p95, regression highlights, and per-item diffs.
- Optimization workspace: prompt, skill, and tool candidate comparison with
  explicit promotion gating.
- Production quality: online policies, quality trend, cost trend, latency trend,
  tool/retrieval health, and budget status.
- Annotation queue: review queue filtered by reason, status, assignee, target trace, and target span.

## Frontend Boundary

Frontend code owns route state, selection, tabs, focus, expansion, sorting
controls, and virtualization windows. It does not compute scores, transcript
semantics, cost estimates, dataset health, split leakage, production quality,
online policy matches, scorer calibration, scoreboard aggregates, or query
facets from raw spans.

## Required UX Flows

Implementation must cover the flows in `05-frontend/ai-eval-ux-concept.md`:

- first-use setup;
- production trace to dataset item;
- dataset split management;
- scorer template creation;
- baseline experiment run;
- prompt/skill/tool optimization;
- candidate promotion;
- production online policy monitoring;
- annotation queue resolution;
- Project Settings / AI Eval configuration.
