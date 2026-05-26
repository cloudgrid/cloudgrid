---
id: TICKET-301
title: Shared local E2E runtime and deterministic AI harness adapter
wave: 1
status: done
parallel_group: ai_eval_e2e_foundation
depends_on: []
blocked_by: []
spec_refs:
  - specs/06-nfr/integration-test-suite.md
  - specs/04-backend/ai-eval-runner.md
  - specs/03-contracts/graphql/public-schema.graphql
write_scope:
  - tooling/scripts/integration-local.mjs
  - tooling/scripts/ai-eval-dev-harness.mjs
  - apps/packages/cloudgrid-harness-adapter
  - apps/packages/integration-scenarios
read_scope:
  - specs/spec.md
  - specs/00-conventions.md
  - specs/06-nfr/integration-test-suite.md
  - specs/04-backend/ai-eval-runner.md
  - specs/03-contracts/graphql/public-schema.graphql
  - tooling/scripts/integration-local.mjs
  - tooling/scripts/ai-eval-dev-harness.mjs
  - apps/packages/cloudgrid-harness-adapter
  - apps/packages/integration-scenarios
contract_readiness:
  status: ready
  required_contracts:
    - integration-local runtime ownership
    - cloudgrid-harness-adapter HTTP contract
    - local-e2e scenario metadata contract
  missing_contracts: []
ticket_readiness:
  status: implementation_ready
  open_decisions: []
  decision_source: spec
  ambiguous_phrases: []
---

## Goal

Provide shared local E2E runtime hooks and deterministic AI harness adapter
fixtures for AI Eval v2 scenarios, while removing legacy scorer/experiment
operation usage from orchestration scripts.

## Context Digest

`integration-local.mjs` owns disposable NATS, SurrealDB, CloudGrid service
processes, health checks, and teardown. Domain scenario modules own public API
actions and assertions. AI Eval scenarios use
`apps/packages/cloudgrid-harness-adapter` for deterministic model/adapter
behavior. Root tests stay Docker-free; local full-stack coverage runs through
`bun run integration:local`.

execution_semantics: local_process for disposable services and remote_service
for public HTTP/GraphQL calls made by scenarios.

## Implementation Approach

Refactor local integration startup so AI Eval v2 scenarios receive harness
adapter base URL, captured request metadata access, and deterministic fixture
modes from shared runtime context. Keep fake adapter behavior in
`apps/packages/cloudgrid-harness-adapter`; leave `ai-eval-dev-harness.mjs` as a
thin compatibility launcher or remove its duplicated behavior after the shared
package is wired. Remove legacy scorer/experiment operation imports from
`integration-local.mjs`.

Docs and examples are covered by the integration-test spec and command help
inside the existing local integration script.

## Decision Ledger

- Local orchestration remains in `tooling/scripts/integration-local.mjs`.
  Source: integration-test-suite spec.
- Scenario assertions live in `apps/packages/integration-scenarios`. Source:
  integration-test-suite spec.
- Deterministic AI behavior is sourced from `cloudgrid-harness-adapter`.
  Source: integration-test-suite spec.
- Root/default tests do not start Docker. Source: integration-test-suite spec.
- Legacy scorer/experiment operations are removed from local integration
  orchestration. Source: frontend and integration specs.

## Contract Traceability

- Harness adapter request/response behavior: `apps/packages/cloudgrid-harness-adapter`.
- Scenario metadata and executable local-e2e entries:
  `apps/packages/integration-scenarios`.
- Public API operation usage:
  `apps/packages/public-api-client` operation documents consumed by scenarios.
- Runtime orchestration: `tooling/scripts/integration-local.mjs`.

## Tasks

1. Add shared runtime context fields for AI Eval harness adapter base URL,
   fixture mode, and captured request metadata.
2. Wire `integration-local.mjs` to start the shared harness adapter package.
3. Remove legacy scorer/experiment operation imports and calls from
   `integration-local.mjs`.
4. Keep `ai-eval-dev-harness.mjs` aligned to the shared package behavior.
5. Add focused tests for harness adapter deterministic success, validation
   failure, timeout, captured metadata, and quick-shot candidate fixtures.
6. Update integration scenario metadata helpers so executable AI Eval scenarios
   stay marked `local-e2e`.

## Acceptance

- Happy path: a local integration scenario can access the harness adapter URL
  and captured request metadata through shared runtime context.
- Failure path: validation failure and timeout fixture modes are exposed by the
  shared adapter package and tested.
- Contract conformance: scenario metadata remains executable `local-e2e`.
- Legacy conformance: local integration orchestration has no scorer/experiment
  operation imports or calls.

## Acceptance Test Matrix

- Shared adapter fixtures: `bun test apps/packages/cloudgrid-harness-adapter`.
- Scenario metadata helpers:
  `bun run --cwd apps/packages/integration-scenarios test`.
- Static drift: `bun run contracts:check`.
- Local orchestration syntax and type coverage: `bun run typecheck`.
- Legacy removal proof: focused tests plus source search for legacy operation
  imports in `tooling/scripts/integration-local.mjs`.

## Verification

Default:

```sh
bun test apps/packages/cloudgrid-harness-adapter
bun run --cwd apps/packages/integration-scenarios test
bun run contracts:check
bun run typecheck
git diff --check -- tooling/scripts apps/packages/cloudgrid-harness-adapter apps/packages/integration-scenarios
```

Opt-in local integration:

```sh
bun run integration:local
```

## Non-goals

- No frontend UX changes.
- No new public GraphQL fields.
- No production provider credentials or external LLM calls.

## Handoff

`TICKET-302` can rely on shared harness adapter startup, fixture modes, and
captured metadata in local E2E runtime context.

## Completion Evidence

- `PATH="$HOME/.bun/bin:$PATH" bun run --cwd apps/packages/cloudgrid-harness-adapter test`
- `PATH="$HOME/.bun/bin:$PATH" bun run --cwd apps/packages/cloudgrid-harness-adapter typecheck`
- `PATH="$HOME/.bun/bin:$PATH" bun run --cwd apps/packages/integration-scenarios test`
- `PATH="$HOME/.bun/bin:$PATH" bun run contracts:check`
- `PATH="$HOME/.bun/bin:$PATH" bun run typecheck`
- `git diff --check`
