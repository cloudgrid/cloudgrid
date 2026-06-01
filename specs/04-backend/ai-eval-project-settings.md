---
id: TEC-BE-024
title: AI evaluation project settings
layer: backend
status: approved
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-24
provenance: from-user
depends_on: [DOM-006, TEC-BE-011, TEC-BE-023, NFR-010]
---

# AI Evaluation Project Settings

## Purpose

Project AI settings define enablement, defaults, budgets, adapter credentials,
and dataset defaults for AI Eval. Control-plane owns these settings.

## Fields

`ProjectAiSettings`:

- `projectId`;
- `enabled`;
- `defaultProviderProfileId`;
- `defaultJudgeProfileId`;
- `defaultOptimizerProfileId`;
- `defaultEmbeddingProfileId`;
- `defaultModelAliasIds`;
- `budget`;
- `sampling`;
- `runPolicyDefaults`;
- `datasetPipeline`;
- `datasetDefaults`;
- `optimizationDefaults`;
- `externalAdapters`;
- `version`;
- `updatedAt`;
- `updatedByUserId`.

Production online policies are backlog and must not be implemented from the old
scorer-based model.

## RunPolicyDefaults

Fields:

- `maxParallelRequests`, default `10`;
- `tokenBudget`;
- `rateLimit`;
- `backpressure`;
- `retry`;
- `timeout`;
- `failureBudget`;
- `checkpoint`;
- `quarantine`;
- `costBudget`;
- `cleanupRetry`.

Run policy defaults apply to dataset evaluations, optimization evaluations, and
external adapter calls unless a run supplies a stricter override.

## DatasetDefaults

Fields:

- `defaultSplit`: `training`, `validation`, or `test`;
- `defaultCurationStatus`: `draft`, `needs_expected`, `needs_review`, `ready`,
  or `rejected`;
- `defaultRetentionProfile`: `balanced`, `fast_iteration`, `audit_friendly`, or
  `minimal_storage`;
- `requireReviewBeforeReady`: boolean.

No project setting may create legacy `dev`, `optimization`, `regression`, or
`holdout` split values.

## DatasetPipelineSettings

Fields:

- `candidateSuggestionsEnabled`;
- `requireReviewBeforeCommit`, default `true`;
- `anonymizationMode`: `off`, `realistic`, or `redact`;
- `anonymizationPolicyId`;
- `anonymizationPolicyVersion`;
- `anonymizationConsistencyScope`: `project` or `dataset`;
- `preserveLocale`;
- `preserveTemporalDistance`;
- `blockedEntityTypes`.

## OptimizationDefaults

Fields:

- `enabledOptimizerKinds`: allowed values from `OptimizationOptimizerKind`;
- `defaultOptimizerKind`: default `critic_mutate_judge_pick` until a baseline
  target exposes a skill part, then UI may offer `skill_text_edit`;
- `defaultSkillSearchPolicy`: max epochs, rollout batch size, reflection
  minibatch size, edit budget, edit schedule, slow-update flag, meta-memory
  flag, max skill bytes, and max skill tokens;
- `maxConcurrentOptimizerCalls`, default `2`;
- `optimizerEvidenceContentPolicy`: `metadata_only`, `dataset_content`, or
  `disabled`.

Project settings may disable `skill_text_edit` even when AI Eval is enabled.
They must not raise global hard caps from `NFR-011`.

## External Adapters

`externalAdapters` stores configured black-box target adapters:

- `id`;
- `name`;
- `baseUrl`;
- `authMode`: `bearer_token` or `hmac_signature`;
- `secretRef`;
- `enabled`;
- `requestTimeoutMs`;
- `pollIntervalMs`;
- `maxPollDurationMs`;
- `createdAt`;
- `updatedAt`.

Secrets are stored by the approved secret/settings mechanism and are never
returned to frontend, BFF logs, GraphQL responses, or generated assets.

## Defaults

When AI Eval is enabled:

- default max parallel requests is `10`;
- default daily provider-backed evaluation budget is `0 USD` until configured;
- default split for manual rows is `validation`;
- default split for optimization-sourced examples is `training`;
- default curation status for trace-derived candidates is `needs_review`;
- candidate suggestions require explicit commit;
- realistic anonymization is recommended for production-derived candidates;
- policy templates are saved disabled until enabled by a project admin.

## Public Contract Requirements

GraphQL must expose project AI settings through project settings views only.
The AI Eval workspace links to settings when setup is missing; settings are not
a primary AI Eval rail item.
