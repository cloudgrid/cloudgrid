---
id: TEC-BE-024
title: AI evaluation project settings
layer: backend
status: approved
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-18
provenance: from-user
depends_on: [DOM-006, TEC-BE-011, TEC-BE-023, NFR-010]
---

# AI Evaluation Project Settings

## Purpose

Project AI settings define how a CloudGrid project evaluates and optimizes AI
agents. These settings are low-volume project configuration owned by
`core/control-plane`. Reusable provider profiles and model aliases live in
project AI provider settings, defined by
`specs/04-backend/ai-provider-settings.md`.

## Boundary

Control-plane owns:

- project AI-eval enablement;
- default references to project AI provider profiles and model aliases;
- default judge, optimizer, embedding, and replay model references;
- online evaluation policies;
- budget, sampling, and concurrency defaults;
- run reliability defaults: max parallel requests, token budgets, rate limits,
  backpressure, retry, timeout, failure budget, checkpointing, and quarantine
  rules;
- dataset split defaults and small-dataset guidance thresholds.
- dataset candidate and anonymization defaults.

Control-plane does not execute model calls, score runs, read telemetry, write
AI-eval results, or store raw model-provider secrets.

The BFF talks to control-plane through message bridge subjects. Frontend talks
only to BFF GraphQL.

## Entities

### ProjectAiSettings

Fields:

- `projectId`: selected project ID.
- `enabled`: whether AI Eval is available for the project.
- `defaultProviderProfileId`: optional profile from Project AI Providers for
  replay and non-judge calls.
- `defaultJudgeProfileId`: optional profile from Project AI Providers for
  LLM-judge scorers.
- `defaultOptimizerProfileId`: optional profile from Project AI Providers for
  prompt/skill optimization.
- `defaultEmbeddingProfileId`: optional profile from Project AI Providers for
  semantic/RAG scorers.
- `defaultModelAliasIds`: optional model aliases from Project AI Providers,
  keyed by `judge`, `optimizer`, `embedding`, `replay`, and `default`.
- `onlinePolicies`: enabled/disabled online scoring policies.
- `budget`: daily and per-run budget caps.
- `sampling`: online sampling defaults.
- `runPolicyDefaults`: default run reliability policy values used when a run
  does not override them.
- `datasetPipeline`: dataset candidate, realistic anonymization, review, and
  commit defaults.
- `datasetDefaults`: split and review defaults for new datasets.
- `version`: optimistic concurrency version.
- `updatedAt`, `updatedByUserId`.

### Provider References

Provider profiles and model aliases are defined by
`ProjectAiProviderSettings`. AI Eval settings reference those entries by ID.
Model aliases are resolved by the runner into harness adapter requests. The
runner never calls model providers directly and never resolves provider secrets
itself.

### OnlineEvaluationPolicy

Fields:

- `id`.
- `enabled`.
- `name`.
- `target`: project segment selector over the exact fields defined below.
- `scorerIds`: scorer versions to apply. Each referenced scorer must declare
  production-measurement compatibility and its requirements must be satisfied by
  the policy's content allowance, provider references, model aliases, budget,
  latency class, and safety constraints.
- `sampleRate`: float from `0` to `1`, capped by project defaults.
- `maxDailyRuns`: optional integer cap.
- `annotationRules`: manual annotation defaults for UI batch actions. The
  runner must ignore these during online scoring notification handling.
- `contentAllowance`: allowed content classes for production measurement:
  `none`, `metadata_only`, `captured_content`, `dataset_content`, and
  `retrieved_document_content`.
- `maxLatencyClass`: highest scorer latency class allowed for continuous
  production measurement. Realtime alerting latency classes are out of scope.
- `createdAt`, `updatedAt`, `updatedByUserId`.

Policies are declarative. The runner asks storage-read for matching policies
and never owns policy semantics locally.

#### OnlineEvaluationPolicy.target

The target object is a strict conjunctive filter. Empty targets are invalid for
enabled policies. Unknown keys are invalid.

Allowed keys:

- `agentId`: exact string match.
- `agentName`: exact string match.
- `environment`: exact string match.
- `serviceName`: exact string match.
- `route`: exact string match.
- `routePrefix`: string prefix match.
- `toolName`: exact string match.
- `retrievalSource`: exact string match.
- `model`: exact string match.
- `promptVersionId`: exact string match.
- `experimentRunId`: exact string match.
- `attributes`: array of safe indexed attribute filters. Each filter has
  `key`, `operator`, and optional `value`. Operators are `eq`, `neq`,
  `contains`, `exists`, `gt`, `gte`, `lt`, `lte`, `in`, and `not_in`.

Targets must not reference raw prompt text, completion text, tool parameters,
retrieved document content, authorization headers, cookies, API keys, tokens,
secrets, passwords, or other secret-looking fields.

#### OnlineEvaluationPolicy.annotationRules

Annotation rules in v1 are not routing rules. They are saved defaults used by
the UI when a user explicitly creates annotation items from selected online
score results. The runner and storage-read live notification path must not
create `AnnotationQueueItem` records from these rules.

### RunPolicyDefaults

The machine-readable source of truth is
`specs/03-contracts/entities/ai/eval-run-policy.schema.json`. Project defaults,
experiment overrides, optimization overrides, production measurement policy
resolution, and harness adapter requests must use the same field names and
validation rules.

Fields:

- `maxParallelRequests`: default maximum concurrent harness/model/scorer calls.
  Default `10`.
- `tokenBudget`: optional per-run, per-item input, and per-item output token
  ceilings.
- `rateLimit`: per-provider, per-project, and per-run request/token pacing.
- `backpressure`: slow, pause, skip, or fail behavior for harness, provider,
  queue, NATS, or storage lag.
- `retry`: retryable error codes, maximum attempts, exponential backoff, jitter,
  and retry budget.
- `timeout`: item, scorer, adapter call, and whole-run deadlines.
- `failureBudget`: maximum model-quality failures and technical errors before a
  run fails.
- `checkpoint`: checkpoint cadence for pause/resume.
- `quarantine`: rules for marking oversized, invalid, flaky, or repeatedly
  failing dataset items.
- `costBudget`: per-run and daily project cost ceilings.
- `workspaceQuota`: sandbox/workspace caps used by ephemeral and future durable
  replay profiles.
- `cleanupRetry`: cleanup retry/backoff/orphan handling for sandbox lifecycle
  cleanup calls.

### DatasetPipelineSettings

Fields:

- `candidateSuggestionsEnabled`: enables dataset candidate preparation from
  production measurements, failed offline item runs, coverage gaps, and health
  issues.
- `requireReviewBeforeCommit`: requires human confirmation before candidates
  become dataset items. Default `true`.
- `anonymizationMode`: `off`, `realistic`, or `redact`.
- `anonymizationPolicyId` and `anonymizationPolicyVersion`: selected policy.
- `anonymizationConsistencyScope`: `project` or `dataset`.
- `preserveLocale`: keep locale-shaped replacement values.
- `preserveTemporalDistance`: shift dates consistently instead of replacing all
  dates independently.
- `blockedEntityTypes`: entity types that must be redacted or dropped instead
  of realistically replaced.

Realistic anonymization must use safe fake replacements. Reserved domains,
test-only payment numbers, non-routable network values, and invalid secret-like
patterns are required for generated values that look sensitive.

## Defaults

When AI Eval is enabled for a project:

- online scoring remains disabled until at least one online policy is enabled;
- default daily evaluation budget is `0 USD` until a project admin sets a
  positive budget or explicitly selects local no-provider mode for scorer
  capabilities that do not require a model/provider call;
- production measurement defaults to metadata-only content allowance and batch
  latency class;
- default online sample rate is `0`;
- default max parallel requests is `10`;
- retry defaults are bounded exponential backoff with jitter and at most three
  attempts for retryable harness/provider/storage errors;
- default backpressure behavior is to slow scheduling, then pause the run when
  queues remain above policy thresholds;
- dataset candidate suggestions are enabled for reviewed users but require
  explicit commit;
- realistic anonymization is the recommended default for production-derived
  dataset candidates, while project settings may choose `off` or `redact`;
- policy templates may be shown in the UI, but they must be saved disabled
  until a project admin enables them;
- default split allocation for imported or promoted reviewed items is
  `dev=20%`, `optimization=40%`, `validation=20%`, `regression=15%`,
  `holdout=5%`;
- when fewer than 30 reviewed items exist, the UI must surface small-dataset
  guidance and mark optimization confidence as low.

## Public Contract Requirements

The approved public contract includes:

- GraphQL `ProjectAiSettings`, `OnlineEvaluationPolicy`, `AiEvalBudget`,
  `AiEvalSampling`, `EvalRunPolicyDefaults`, `DatasetPipelineSettings`, and
  `DatasetDefaults` types.
- GraphQL `Query.projectAiSettings(projectId: ID!)`.
- GraphQL `Mutation.updateProjectAiSettings(input: UpdateProjectAiSettingsInput!)`.
- GraphQL project/provider reference fields that point at
  `ProjectAiProviderSettings` profile IDs or model alias IDs.
- AsyncAPI request/reply subjects:
  - `control.ai_settings.get`;
  - `control.ai_settings.update`.
- AsyncAPI policy-resolution subject:
  - `eval.online.policy_matches.resolve`.
- JSON Schema `specs/03-contracts/entities/ai/project-ai-settings.schema.json`.
- Generated TypeScript UI contracts and Go contracts.

Implementation agents must not add frontend-only settings state, localStorage
truth, uncontracted GraphQL fields, or control-plane settings fields that are
not present in the JSON Schema and generated contracts.

## Authorization

- Reading project AI settings requires selected-project read access.
- Updating project AI settings requires project `admin` or company `admin`.
- Local mode treats the Personal user as project admin.
- Returned settings never include raw secrets. Provider credential references
  live in Project AI Provider settings and are returned only through that
  redacted settings contract.

## Effective Configuration

The BFF exposes only the control-plane response. It must not merge settings with
environment variables itself. Control-plane returns an `effective` view that
includes derived defaults, disabled profile reasons, budget state, and missing
configuration warnings.

## Validation

Updates fail with `ERR-001` when:

- default provider profile references are missing or disabled in Project AI
  Provider settings;
- default model alias references are missing, disabled, or assigned to an
  incompatible purpose in Project AI Provider settings;
- sample rates are outside `0..1`;
- max parallel requests is below `1` or above configured hard caps;
- token budget, timeout, retry, or rate limit values are outside allowed
  bounds;
- daily budget is negative;
- an enabled online policy has an empty target;
- an online policy target uses an unknown key or a raw/secret-looking content
  selector;
- an enabled production policy references any scorer whose declared requirements
  are not allowed by the policy or project settings;
- a realistic anonymization policy attempts to generate routable emails, usable
  payment credentials, real API-key-looking secrets, or stores original values
  in dataset metadata;
- strings contain secret-looking keys such as `authorization`, `cookie`,
  `x-api-key`, `api_key`, `token`, `secret`, or `password`.

Updates fail with `ERR-016` when the caller is not authorized.

## Verification

Required tests:

- project admin can update settings;
- viewer cannot update settings;
- provider/profile/model alias references resolve through Project AI Provider settings;
- raw secret-looking fields are rejected;
- disabled default provider references are rejected;
- effective settings include derived defaults;
- local mode can enable no-provider evaluation without provider secrets;
- enabled online policies reject scorers whose requirements are not satisfied by
  policy and project settings;
- enabled online policies reject empty targets and secret-looking selectors;
- run policy defaults enforce max parallel requests default `10`, bounded
  retries, rate limits, backpressure, and token budgets;
- dataset pipeline settings record anonymization policy provenance and require
  explicit candidate commit;
- BFF resolvers call only control-plane message subjects.
