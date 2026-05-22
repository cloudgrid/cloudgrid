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

## Scope

Online evaluation in the approved scope means asynchronous continuous production
measurement. It is disabled by default, never creates annotation or dataset
items automatically, and never triggers alert rules. Near-realtime alerting is a
future run mode requiring a separate alerting contract.

Scorer capabilities are reusable across offline and production workflows.
Production policies decide whether a scorer may run by checking the scorer's
declared evidence, content, provider, cost, latency, and safety requirements.

## Steps

1. Storage-write persists AI projections and publishes `ai.persisted.projections`.
2. AI-eval-runner receives the notification.
3. Runner sends `eval.online.policy_matches.resolve` to storage-read with the
   notification IDs and routing hints.
4. Storage-read loads project AI settings, verifies project AI Eval is enabled,
   evaluates only enabled online policies, validates policy target selectors,
   resolves scorer versions, and returns matched scorer refs plus bounded read
   models for the projection when policy satisfies each scorer's declared
   production requirements.
5. Storage-read returns no match when the project is disabled, the policy is
   disabled, the selector does not match, or every referenced scorer is
   disallowed by policy, content, provider, model alias, budget, latency, or
   safety constraints.
6. Runner checks sampling, rate limits, backpressure, token budget, cost budget,
   timeout, concurrency, idempotency, and policy caps from the resolved policy
   data.
7. Runner executes local scorers locally and calls harness `/v1/score` only for
   scorer capabilities explicitly allowed by the resolved policy. Runner
   persists `EvalResult` or bounded skipped-result summaries through
   storage-write.
8. Storage-read derives production quality summaries from persisted results.
9. A user may later review/filter/cluster score results and explicitly prepare
   dataset candidates or annotation queue items through user-facing mutations.

## Cadence, Deduplication, And Backfill

Online evaluation is asynchronous continuous measurement, not a request-path
hook.

- Runner may process persisted projection notifications immediately or in
  bounded batches. The default scheduling target is within 5 minutes of
  `persistedAt` when rate limits and budgets permit.
- A notification older than the project policy lookback window is skipped with a
  bounded `stale_notification` reason. The default lookback is 24 hours.
- Idempotency key is `(projectionId, policyId, policyVersion, scorerId,
  scorerVersion)`. Replayed notifications must not create duplicate
  `EvalResult` records.
- Sampling is evaluated after policy matching and before scorer execution. The
  sampling decision is deterministic from project ID, projection ID, policy ID,
  policy version, and scorer ID.
- Daily policy caps use the project-local calendar day of `persistedAt`, not
  runner wall-clock time.
- Backfill uses the same policy resolution and idempotency key as live
  notification handling. Backfill must be opt-in and must not run from default
  startup.
- When budgets or rate limits are exhausted, runner records a skipped result
  only if a policy match existed. No-match notifications are silently ignored
  after bounded metrics/logging.
- Skipped results contribute to `skippedReasons` in production quality
  overviews but never to model-quality pass/fail rates.

## Boundaries

Notifications contain IDs, kinds, and routing hints only. They do not contain source payload content. Runner loads all needed read models through storage-read and persists only through storage-write.

Runner must not match online policies by reading raw projection maps locally.
Policy semantics remain in storage-read so production quality summaries,
annotation routing, and scorer selection use the same filter behavior.

Runner must not read provider secrets. It may pass provider profile IDs and model
aliases to harness only when the resolved policy allows the scorer's provider
requirements. It must not forward prompt/completion/tool/retrieval content
unless content capture, project policy, scorer definition, and user/admin
configuration explicitly allow that content class.

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
  `kind`, execution requirements, content requirements, provider requirements,
  cost class, latency class, and production-safety classification.
- `projection`: bounded read model containing source IDs, kind, project,
  agent/service/route/environment/model/prompt version/tool/retrieval routing
  fields, and safe indexed attributes needed by deterministic scorers.
- `warnings`: bounded warning strings for invalid disabled policies, disallowed
  scorer requirements, missing provider/model aliases, budget constraints,
  unsupported content access, or stale scorer references.

The response must not include provider credentials or harness request bodies.
Raw prompt, completion, tool parameter, or retrieved-document content may appear
only when the scorer definition requires it, capture exists, and the resolved
policy explicitly allows that content class. Otherwise the response contains
source pointers, digests, routing fields, and safe indexed attributes only.

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
