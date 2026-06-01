---
id: TEC-BE-016
title: AI evaluation message contracts
layer: backend
status: approved
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-31
provenance: from-user
depends_on: [DOM-006, CAP-AIE-013]
---

# AI Evaluation Message Contracts

## Rule

The AsyncAPI file is the machine-readable source. This spec defines the v2
subject inventory, ownership, and payload rules that AsyncAPI must implement.
Implementation agents must not add message subjects, anonymous payloads, status
values, or retry semantics outside this inventory.

## Subjects

Dataset subjects:

| Subject | Producer | Consumer | Purpose |
| --- | --- | --- | --- |
| `eval.dataset.create` | BFF | storage-write | Create dataset and initial version. |
| `eval.dataset.settings.update` | BFF | storage-write | Replace dataset settings and create a new dataset version guarded by `expectedDatasetVersionId`. |
| `eval.dataset.items.append` | BFF | storage-write | Append manual rows and create item revisions/version. |
| `eval.dataset.item.update` | BFF | storage-write | Edit, reject, split-change, restore, or remove rows. |
| `eval.dataset.item.promote` | BFF | storage-write | Promote trace/span into dataset through extraction settings. |
| `eval.dataset.version.get` | BFF, runner | storage-read | Read immutable dataset version and item revision refs. |
| `eval.dataset.search` | BFF, runner | storage-read | Search datasets and rows. |
| `eval.dataset.health` | BFF, runner | storage-read | Return validation, split, curation, schema, duplicate, and leakage health. |
| `eval.dataset.candidates.prepare` | BFF | storage-read then storage-write | Prepare reviewable candidates. |
| `eval.dataset.candidates.search` | BFF | storage-read | Search candidates. |
| `eval.dataset.candidates.commit` | BFF | storage-write | Commit ready candidates into a dataset version. |
| `eval.dataset.import.prepare` | BFF | storage-write | Parse staged upload and prepare preview. |
| `eval.dataset.import.commit` | BFF | storage-write | Commit import preview into a dataset version. |
| `eval.dataset.export.start` | BFF | storage-read then storage-write | Prepare export artifact. |
| `eval.dataset.transfer.get` | BFF | storage-read | Read import/export job state. |

Evaluation subjects:

| Subject | Producer | Consumer | Purpose |
| --- | --- | --- | --- |
| `eval.evaluation.create` | BFF | storage-write | Create evaluation definition. |
| `eval.evaluation.update` | BFF | storage-write | Update evaluation definition. |
| `eval.evaluation.search` | BFF | storage-read | Search definitions. |
| `eval.evaluation.run.start` | BFF | runner | Start evaluation run. |
| `eval.evaluation.run.cancel` | BFF | runner | Cancel run. |
| `eval.evaluation.run.pause` | BFF | runner | Pause run after checkpoint/drain. |
| `eval.evaluation.run.resume` | BFF | runner | Resume paused run. |
| `eval.evaluation.run.search` | BFF, runner | storage-read | Search runs. |
| `eval.evaluation.run.get` | BFF, runner | storage-read | Read run detail. |
| `eval.results.persist` | runner | storage-write | Persist evaluation run state, item runs, metric results, summaries, problems, and optimization run state. |
| `eval.results.search` | BFF, runner | storage-read | Search metric results and item runs. |
| `eval.evaluation.comparison.create` | BFF, runner | storage-read then storage-write | Create comparison from existing runs. |
| `eval.evaluation.comparison.search` | BFF | storage-read | Search comparisons. |

Target and optimization subjects:

| Subject | Producer | Consumer | Purpose |
| --- | --- | --- | --- |
| `eval.target.snapshot.create` | BFF, runner | storage-write | Persist immutable target snapshot. |
| `eval.target.snapshot.get` | BFF, runner | storage-read | Read target snapshot. |
| `eval.target.diff` | BFF, runner | storage-read | Return target diff. |
| `eval.optimization.start` | BFF | runner | Start optimization run. |
| `eval.optimization.search` | BFF | storage-read | Search optimization runs. |
| `eval.optimization.get` | BFF, runner | storage-read | Read optimization detail. |
| `eval.optimization.step.persist` | runner | storage-write | Persist immutable prompt or skill optimization step evidence. |
| `eval.optimization.memory.persist` | runner | storage-write | Persist bounded rejected-edit, slow-update, and meta-memory state. |
| `eval.target.promote` | BFF | storage-write | Create promotion record and move target ref. |

Live and settings subjects:

| Subject | Producer | Consumer | Purpose |
| --- | --- | --- | --- |
| `eval.live.start` | BFF | storage-read | Register live run subscription. |
| `eval.live.stop` | BFF | storage-read | Stop live run subscription. |
| `eval.live.events.*.*` | storage-read | BFF | Deliver GraphQL-ready live events. |
| `control.ai_settings.get` | BFF, runner | control-plane | Read project AI settings. |
| `control.ai_settings.update` | BFF | control-plane | Update project AI settings. |

## Payload Rules

- Every request uses `BridgeEnvelope` plus a subject-specific typed payload.
- BFF-originated payloads mirror the GraphQL input type for the same operation.
- Dataset settings updates are full replacements in v2. Partial settings
  patches are not supported, so every update sends the complete
  `DatasetSettingsInput` shape.
- AI Eval runner execution resolves target model aliases from
  `EvaluationTargetRef.metadata.modelAlias`, `TargetSnapshot.targetRef`, or
  target snapshot provider metadata against project AI provider settings before
  calling the harness adapter. Harness run, score, optimization, and sandbox
  lifecycle requests carry `providerProfileRefs`; raw provider credentials stay
  in control-plane secret resolution and are not persisted in AI Eval results.
- `eval.optimization.start` payloads must mirror
  `StartOptimizationRunInput`, including typed `objective`, typed
  `searchPolicy`, split selectors, optional quick-shot policy, run policy, and
  idempotency key. `searchPolicy.optimizerKind = skill_text_edit` requires a
  selected baseline target snapshot whose editable parts include
  `TargetPartKind.skill`.
- `eval.optimization.step.persist` payloads mirror `PromptOptimizationStep` for
  `bootstrap_fewshot` and `critic_mutate_judge_pick` over classification or
  extraction datasets, and mirror `SkillOptimizationStep` for `skill_text_edit`.
  Prompt step payloads must include project ID, optimization run ID, step ID,
  idempotency key, family, diagnosis, selected changes, gate decision, candidate
  target snapshot IDs when created, and bounded problems.
- `eval.optimization.memory.persist` payloads mirror
  `SkillOptimizationMemory`. They must enforce rejected-edit buffer and memory
  byte limits before storage-write persists the update.
- Runner-originated persistence payloads mirror entity JSON schemas.
- Responses use `{ requestId, ok, data?, error? }`.
- `error.code` must come from `specs/03-contracts/errors.yaml`.
- Do not use subject-local anonymous JSON.
- Do not reuse legacy experiment/scorer payloads for v2 subjects.

## Idempotency

- Dataset row writes use dataset ID, expected dataset version, normalized row
  operation, and request ID.
- Evaluation run start uses evaluation definition ID or ad hoc run spec digest,
  target snapshot ID, dataset version ID, split selector, and request ID.
- Evaluation run control commands use run ID, command, and request ID.
- External adapter item execution uses evaluation item run ID, target snapshot
  ID, and dataset item revision ID.
- Promotion uses target ref, candidate snapshot ID, comparison ID, and request
  ID.

Repeated idempotent requests return the existing entity or terminal status.

## Legacy Subject Rule

Do not add new code for `eval.scorer.*`, `eval.experiment.*`, or
`eval.prompt_version.promote` in v2. Existing machine-readable contracts must be
removed or wrapped to the v2 subjects in the same contract migration before
implementation.
