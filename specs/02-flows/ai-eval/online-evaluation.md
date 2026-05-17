---
id: FLW-AIE-002
title: Online AI evaluation
domain: ai-eval
layer: flow
status: approved
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-16
provenance: from-user
trigger:
  type: event
  expression: ai.persisted.projections
orchestration: async
delivery_semantics: at-least-once notification with idempotent EvalResult writes
idempotency:
  key_fields: [projectionId, scorerId, scorerVersion]
  dedupe_window: P30D
  store: storage-write
retry:
  max_attempts: 3
  backoff: exponential
  base_ms: 250
  max_ms: 5000
  retryable_errors: [ERR-013, ERR-014, ERR-AIE-003]
  permanent_errors: [ERR-AIE-002, ERR-AIE-004]
terminal_failure: skip-scoring-and-log
---

# Online AI Evaluation

## V1 Scope

Online evaluation v1 is a conservative production monitoring feature. It is
disabled by default, executes deterministic scorers only, never invokes
harness `/v1/score`, never sends production content to judge models, never
creates annotation items automatically, and never triggers alert rules.

## Steps

1. Storage-write persists AI projections and publishes `ai.persisted.projections`.
2. AI-eval-runner receives the notification.
3. Runner sends `eval.online.policy_matches.resolve` to storage-read with the
   notification IDs and routing hints.
4. Storage-read loads project AI settings, verifies project AI Eval is enabled,
   evaluates only enabled online policies, validates policy target selectors,
   resolves scorer versions, and returns matched deterministic scorer refs plus
   bounded read models for the projection.
5. Storage-read returns no match when the project is disabled, the policy is
   disabled, the selector does not match, or every referenced scorer is outside
   the v1 deterministic online scorer set.
6. Runner checks sampling, concurrency, idempotency, and policy caps from the
   resolved policy data.
7. Runner executes deterministic scorers locally and persists `EvalResult` or
   bounded skipped-result summaries through storage-write.
8. Storage-read derives production quality summaries from persisted results.
9. A user may later review/filter online score results and explicitly create
   annotation queue items through `annotation.item.update`.

## Boundaries

Notifications contain IDs, kinds, and routing hints only. They do not contain source payload content. Runner loads all needed read models through storage-read and persists only through storage-write.

Runner must not match online policies by reading raw projection maps locally.
Policy semantics remain in storage-read so production quality summaries,
annotation routing, and scorer selection use the same filter behavior.

Runner must not call harness, read provider profiles, resolve provider secrets,
or forward prompt/completion/tool/retrieval content for online scoring in v1.

## Online Policy Match Contract

The `eval.online.policy_matches.resolve` request payload is a `BridgeEnvelope`
plus:

- `projectId`: required project ID from the persisted projection notification.
- `traceId`: required trace ID.
- `projectionIds`: one or more persisted projection IDs.
- `spanIds`: optional source span IDs from the notification.
- `kinds`: projection kinds from the notification.
- `persistedAt`: notification timestamp.

The response payload contains:

- `matches`: ordered list of matched online policies. Each match includes
  `policyId`, `policyVersion`, `policyName`, `sampleRate`, `maxDailyRuns`,
  `scorerRefs`, and `target`.
- `scorerRefs`: each scorer ref includes `scorerId`, `scorerVersion`, and
  `kind`. In v1 every returned scorer kind must be `deterministic`.
- `projection`: bounded read model containing source IDs, kind, project,
  agent/service/route/environment/model/prompt version/tool/retrieval routing
  fields, and safe indexed attributes needed by deterministic scorers.
- `warnings`: bounded warning strings for invalid disabled policies, unsupported
  scorer kinds, or stale scorer references.

The response must not include raw prompt, completion, tool parameter, retrieved
document content, provider credentials, or harness request bodies.

## Online Policy Target Contract

Online policy targets are conjunctive filters. Empty targets are invalid for
enabled policies.

Allowed target fields:

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
  `key`, `operator`, and `value`. Operators are `eq`, `neq`, `contains`,
  `exists`, `gt`, `gte`, `lt`, `lte`, `in`, and `not_in`.

Unsupported keys, unindexed content fields, secret-looking keys, or raw content
selectors make an enabled policy invalid with `ERR-001`.

## Manual Annotation Contract

Online policies may store manual annotation defaults for UI convenience, but
the runner ignores them during online scoring. Annotation items are created only
when a user issues a BFF GraphQL mutation that routes to `annotation.item.update`
after inspecting filtered score results.
