---
id: TICKET-201
title: BFF AI Eval v2 bridge validation and resolvers
wave: 1
status: done
parallel_group: ai_eval_v2_bff_serial
depends_on: []
blocked_by: []
spec_refs:
  - specs/01-domains/ai-eval.md
  - specs/03-contracts/graphql/public-schema.graphql
  - specs/03-contracts/messages/message-bridge.asyncapi.yaml
  - specs/04-backend/ai-eval-message-contracts.md
  - specs/04-backend/ai-eval-project-settings.md
  - specs/04-backend/ai-eval-query-semantics.md
write_scope:
  - apps/backend/src
  - apps/backend/test
  - apps/packages/public-api-client/src
  - apps/packages/ui-contracts/src
read_scope:
  - specs/spec.md
  - specs/00-conventions.md
  - specs/04-backend/backend-architecture.md
  - specs/01-domains/ai-eval.md
  - specs/03-contracts/graphql/public-schema.graphql
  - specs/03-contracts/messages/message-bridge.asyncapi.yaml
  - specs/03-contracts/errors.yaml
  - specs/04-backend/ai-eval-message-contracts.md
  - apps/backend/src/bridge.ts
  - apps/backend/src/graphql.ts
  - apps/backend/src/validation.ts
contract_readiness:
  status: ready
  required_contracts:
    - Dataset
    - DatasetVersion
    - DatasetItemRevision
    - EvaluationDefinition
    - EvaluationRun
    - EvaluationItemRun
    - MetricResult
    - MetricAggregate
    - EvaluationComparison
    - TargetSnapshot
    - OptimizationRun
    - PromotionRecord
  missing_contracts: []
ticket_readiness:
  status: implementation_ready
  open_decisions: []
  decision_source: spec
  ambiguous_phrases: []
---

## Goal

Replace BFF AI Eval legacy Scorer/Experiment bridge behavior with v2 Dataset,
Evaluation, Metric, Target, Comparison, and Optimization operations.

## Context Digest

The public GraphQL schema is authoritative. BFF talks to private services only
through AsyncAPI NATS request/reply subjects. BFF must validate request shape,
route to message bridge subjects, parse response shape, and return GraphQL view
models without scoring, aggregating, enriching, or filtering telemetry. Legacy
public fields and subjects remain forbidden for v2 product behavior.

execution_semantics: GraphQL resolver is request_response; BFF bridge is NATS
request_reply; subscriptions are NATS live-event relay only.

## Implementation Approach

Update `apps/backend/src/validation.ts`, `apps/backend/src/bridge.ts`,
`apps/backend/src/graphql.ts`, resolver context types, backend tests, and public
client operation documents. Remove Scorer/Experiment compatibility method usage
from active v2 resolver paths. Keep old method names only behind deleted tests
or typed deprecation wrappers that are not called by GraphQL.

## Decision Ledger

- Dataset rows use `input`, optional `expected`, optional `observedOutput`,
  optional `reason`, `split`, and `curationStatus`; source is `sourceRefs`.
  Source: `specs/01-domains/ai-eval.md`.
- Evaluation configuration is `EvaluationDefinition`; executable runs are
  `EvaluationRun`. Source: GraphQL schema.
- Metrics are returned as `MetricResult` and `MetricAggregate`; BFF never
  computes aggregates. Source: backend query semantics spec.
- Production quality remains backlog and must not restore online scorer flow.
  Source: AI Eval domain spec.

## Contract Traceability

- GraphQL: `public-schema.graphql` AI Eval query, mutation, subscription fields.
- AsyncAPI: `eval.dataset.*`, `eval.evaluation.*`, `eval.results.*`,
  `eval.target.*`, `eval.optimization.*`, `eval.live.*`.
- Generated artifacts: `apps/packages/ui-contracts/src/generated.ts`,
  `core/go-contracts/generated_contracts.go`.
- Owning files: BFF validation, bridge, GraphQL resolvers, backend tests.

## Tasks

1. Replace legacy validation schemas with v2 input schemas.
2. Replace bridge request payload construction with v2 AsyncAPI request fields.
3. Replace resolver methods with v2 names and return types.
4. Remove active BFF references to legacy Scorer/Experiment product fields.
5. Update backend tests to assert v2 subjects, payloads, and GraphQL fields.

## Acceptance

- Happy path: creating datasets, appending items, creating evaluations, starting
  runs, searching results, comparing runs, starting optimization, and promoting
  targets call v2 subjects.
- Failure path: invalid JSON schema, invalid split, invalid curation status, and
  missing idempotency key return contract errors.
- BFF does not compute metrics, aggregates, comparisons, or dataset health.
- No public GraphQL operation uses legacy scorer/experiment fields.

## Acceptance Test Matrix

- Subject and payload routing: `bun test apps/backend/src/ai-eval.test.ts`.
- Validation failures: focused cases in `apps/backend/src/validation.test.ts` or
  `apps/backend/src/ai-eval.test.ts`.
- GraphQL operation conformance: `bun run contracts:check`.
- Type conformance: `bun run --cwd apps/backend typecheck`.

## Verification

Default:

```sh
bun run contracts:check
bun run --cwd apps/backend typecheck
bun test apps/backend/src/ai-eval.test.ts
```

## Non-goals

- No storage adapter changes.
- No runner orchestration changes.
- No frontend redesign.
- No production measurement implementation.

## Handoff

Storage, runner, and frontend agents can rely on BFF v2 method names, validation,
GraphQL operation documents, and bridge payloads matching the v2 contracts.
