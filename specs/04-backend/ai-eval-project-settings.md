---
id: TEC-BE-024
title: AI evaluation project settings
layer: backend
status: approved
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-16
provenance: from-user
depends_on: [DOM-006, TEC-BE-011, TEC-BE-023, NFR-010]
---

# AI Evaluation Project Settings

## Purpose

Project AI settings define how a CloudGrid project evaluates and optimizes AI
agents. These settings are low-volume project configuration owned by
`core/control-plane`.

## Boundary

Control-plane owns:

- project AI-eval enablement;
- provider profile metadata;
- model aliases;
- default judge, optimizer, embedding, and replay model references;
- online evaluation policies;
- budget, sampling, and concurrency defaults;
- dataset split defaults and small-dataset guidance thresholds.

Control-plane does not execute model calls, score runs, read telemetry, write
AI-eval results, or store raw model-provider secrets.

The BFF talks to control-plane through message bridge subjects. Frontend talks
only to BFF GraphQL.

## Entities

### ProjectAiSettings

Fields:

- `projectId`: selected project ID.
- `enabled`: whether AI Eval is available for the project.
- `defaultProviderProfileId`: optional provider profile for replay and
  non-judge calls.
- `defaultJudgeProfileId`: optional profile for LLM-judge scorers.
- `defaultOptimizerProfileId`: optional profile for prompt/skill optimization.
- `defaultEmbeddingProfileId`: optional profile for semantic/RAG scorers.
- `providerProfiles`: ordered provider profiles visible to project admins.
- `modelAliases`: project-owned alias names that point at provider profile model
  references.
- `onlinePolicies`: enabled/disabled online scoring policies.
- `budget`: daily and per-run budget caps.
- `sampling`: online sampling defaults.
- `datasetDefaults`: split and review defaults for new datasets.
- `version`: optimistic concurrency version.
- `updatedAt`, `updatedByUserId`.

### ProviderProfile

Fields:

- `id`: opaque project-scoped ID.
- `projectId`.
- `label`: user-facing name.
- `providerKind`: one of `openai`, `anthropic`, `azure_openai`,
  `google_vertex`, `bedrock`, `openai_compatible`, `local_harness`, or
  `custom_harness`.
- `baseUrl`: optional URL for OpenAI-compatible or custom harness providers.
- `credentialRef`: optional opaque reference resolved by harness or a future
  separately specified secret service.
- `models`: allowed model refs grouped by `judge`, `optimizer`, `embedding`,
  `replay`, and `default`.
- `timeoutMs`: request timeout hint for harness.
- `maxConcurrency`: optional project-level cap for this profile.
- `disabledAt`: optional timestamp.

CloudGrid must not store raw API keys, bearer tokens, provider refresh tokens,
or provider-specific secret JSON in `ProviderProfile`.

### ModelAlias

Fields:

- `id`.
- `name`: stable project alias such as `judge-fast`, `optimizer-best`, or
  `embedding-default`.
- `providerProfileId`.
- `model`: provider model identifier.
- `purpose`: one of `judge`, `optimizer`, `embedding`, `replay`, or `default`.
- `parameters`: bounded JSON for temperature, max output tokens, reasoning
  effort, or equivalent provider-neutral hints.

Model aliases are resolved by the runner into harness adapter requests. The
runner never calls model providers directly.

### OnlineEvaluationPolicy

Fields:

- `id`.
- `enabled`.
- `name`.
- `target`: project segment selector over agent name/id, environment, service,
  route, tool name, retrieval source, trace attributes, or experiment run ID.
- `scorerIds`: scorer versions to apply.
- `sampleRate`: float from `0` to `1`, capped by project defaults.
- `maxDailyRuns`: optional integer cap.
- `annotationRules`: routing rules for failed, low-score, high-cost, or
  high-latency results.
- `createdAt`, `updatedAt`, `updatedByUserId`.

Policies are declarative. The runner asks storage-read for matching policies
and never owns policy semantics locally.

## Defaults

When AI Eval is enabled for a project:

- online scoring remains disabled until at least one online policy is enabled;
- default daily evaluation budget is `0 USD` until a project admin sets a
  positive budget or explicitly selects local deterministic-only mode;
- LLM-judge sampling defaults to `0.1` and is capped by `NFR-010`;
- default split allocation for imported or promoted reviewed items is
  `dev=20%`, `optimization=40%`, `validation=20%`, `regression=15%`,
  `holdout=5%`;
- when fewer than 30 reviewed items exist, the UI must surface small-dataset
  guidance and mark optimization confidence as low.

## Public Contract Requirements

The approved public contract includes:

- GraphQL `ProjectAiSettings`, `ProviderProfile`, `ModelAlias`,
  `OnlineEvaluationPolicy`, `AiEvalBudget`, `AiEvalSampling`, and
  `DatasetDefaults` types.
- GraphQL `Query.projectAiSettings(projectId: ID!)`.
- GraphQL `Mutation.updateProjectAiSettings(input: UpdateProjectAiSettingsInput!)`.
- AsyncAPI request/reply subjects:
  - `control.ai_settings.get`;
  - `control.ai_settings.update`.
- JSON Schema `specs/03-contracts/entities/ai/project-ai-settings.schema.json`.
- Generated TypeScript UI contracts and Go contracts.

Implementation agents must not add frontend-only settings state, localStorage
truth, uncontracted GraphQL fields, or control-plane settings fields that are
not present in the JSON Schema and generated contracts.

## Authorization

- Reading project AI settings requires selected-project read access.
- Updating project AI settings requires project `admin` or company `admin`.
- Local mode treats the Personal user as project admin.
- Returned settings never include raw secrets. `credentialRef` is safe metadata
  but must not be accepted as an actual credential by any public API.

## Effective Configuration

The BFF exposes only the control-plane response. It must not merge settings with
environment variables itself. Control-plane returns an `effective` view that
includes derived defaults, disabled profile reasons, budget state, and missing
configuration warnings.

## Validation

Updates fail with `ERR-001` when:

- profile IDs are duplicated;
- default profile references are missing or disabled;
- model alias names are duplicated;
- sample rates are outside `0..1`;
- daily budget is negative;
- `baseUrl` is present for provider kinds that do not support it;
- strings contain secret-looking keys such as `authorization`, `cookie`,
  `x-api-key`, `api_key`, `token`, `secret`, or `password`.

Updates fail with `ERR-016` when the caller is not authorized.

## Verification

Required tests:

- project admin can update settings;
- viewer cannot update settings;
- raw secret-looking fields are rejected;
- disabled default provider references are rejected;
- effective settings include derived defaults;
- local mode can enable deterministic-only evaluation without provider secrets;
- BFF resolvers call only control-plane message subjects.
