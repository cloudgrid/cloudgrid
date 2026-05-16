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

## Online Policy UI V1

Online policy management lives in Project Settings / AI Eval configuration, with
read-only production quality monitoring in the AI Eval route.

The settings UI must:

- show that production online scoring is inactive by default;
- create/edit/delete online policies only through
  `Mutation.updateProjectAiSettings`;
- require an explicit enabled toggle per policy;
- require at least one target filter before a policy can be enabled;
- expose only the approved target fields from
  `specs/04-backend/ai-eval-project-settings.md`;
- allow selecting deterministic scorers only for v1 online policies;
- show non-deterministic scorer families as future/offline-only when useful,
  but never submit them in enabled online policies;
- show sample rate, max daily runs, and manual annotation defaults;
- describe annotation defaults as user-triggered batch action defaults, not
  automatic routing.

The production quality UI must:

- render quality summaries and segments from `Query.aiQualityOverview`;
- render skipped-result reasons returned by GraphQL;
- provide filters for policy, scorer, service, route, environment, model,
  prompt version, and time range when backed by GraphQL fields;
- let users select/filter failed online score results and trigger annotation
  item creation through the approved annotation mutation path;
- not create annotation queue items automatically;
- not expose alert-rule controls for AI-eval online results in v1.

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
