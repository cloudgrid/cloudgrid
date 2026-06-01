---
id: TICKET-008
title: AI Eval integration gates and evidence
wave: 6
status: done
parallel_group: integration_serial
depends_on: [TICKET-004, TICKET-005, TICKET-006, TICKET-007]
blocked_by: []
spec_refs:
  - specs/.readiness-report.yaml
  - specs/03-flows/ai-eval/offline-experiment-run.md
  - specs/03-flows/ai-eval/online-evaluation.md
  - specs/03-flows/ai-eval/dataset-curation-and-splits.md
  - specs/05-frontend/ai-eval-views.md
write_scope:
  - tooling
  - apps/frontend/e2e
  - website
  - plans
read_scope:
  - specs/spec.md
  - specs/00-conventions.md
  - specs/.readiness-report.yaml
  - plans
  - apps/backend
  - apps/frontend
  - core
contract_readiness:
  status: ready
  required_contracts:
    - public-schema.graphql
    - message-bridge.asyncapi.yaml
    - AI Eval integration scenarios
    - AI Eval frontend E2E flows
  missing_contracts: []
ticket_readiness:
  status: implementation_ready
  open_decisions: []
  decision_source: spec
  ambiguous_phrases: []
---

## Goal

Add hermetic end-to-end gates, documentation, and final progress evidence for AI Eval v1.

## Context Digest

Default verification must run without provider credentials, durable replay services, cloud storage, or production deployment. External providers and durable replay are opt-in. The plan status files track progress and final evidence. Public workflows include setup, datasets, candidates, scorers, experiments, run controls, result analytics, optimization, production quality, and settings.

execution_semantics: local_process for test tooling; remote_service for local BFF/service integration; declarative for documentation and plan evidence.

## Implementation Approach

Add integration scenarios, fake storage/runner/harness fixtures, frontend E2E flows, documentation updates, and final plan status evidence. Keep default tests hermetic. Update `plans/_status.yaml` as each ticket evidence lands. Documentation/examples: update website handbook AI Eval pages or equivalent existing handbook sections reachable from setup and operations docs.

## Decision Ledger

- Default root commands must not require external infrastructure beyond repo-defined local services: source AGENTS.md and planner rules.
- Provider-backed tests are opt-in only: source AI runtime and cost specs.
- Documentation belongs in `website/`: source AGENTS.md.
- Progress evidence belongs in `plans/_status.yaml`: source this plan.

## Contract Traceability

- Integration scenarios cover public GraphQL operations and message bridge contracts.
- E2E frontend flows cover `ai-eval-views.md` required test matrix.
- Documentation covers public setup, defaults, operational limits, and troubleshooting.

## Tasks

1. Add fake-service integration scenarios for offline run, pause/resume/cancel, dataset candidates, and production quality overview.
2. Add frontend E2E flows for setup, dataset candidate commit, scorer creation, experiment run, run controls, and result visualization.
3. Add or update handbook documentation for AI Eval setup, datasets, scorers, runs, production measurement, and limits.
4. Run full default gates and record evidence in `plans/_status.yaml`.
5. Mark completed tickets `done` only after their verification evidence is present.

## Acceptance

- Default gates cover contract, BFF, frontend, runner, storage, and integration behavior.
- No default test requires provider credentials, browser cloud services, durable replay, or production deployment.
- Website documentation describes the user path and operator limits.
- Plan status records final command evidence for every ticket.

## Acceptance Test Matrix

| Criterion | Proof |
| --- | --- |
| Offline run and run control integration | local fake-service integration tests |
| Dataset candidate flow | integration and frontend E2E tests |
| Production quality overview | integration test with seeded fake results |
| Documentation reachability | website build |
| Final evidence tracking | `plans/_status.yaml` updated |

## Verification

Default:

```sh
bun run contracts:check
bun run typecheck
bun run test
bun run --cwd website build
go test -tags surrealdb ./core/go-runtime/... ./core/go-contracts/... ./core/otlp-collector/... ./core/control-plane/... ./core/storage-read/... ./core/storage-write/... ./core/ai-eval-runner/...
```

Opt-in: provider-backed and durable replay checks require explicit environment variables and are skipped by default.

## Non-goals

- No new AI Eval product scope.
- No realtime alerting.
- No durable replay implementation.

## Handoff

After this ticket, the AI Eval v1 implementation is ready for PR review with plan evidence linked to each completed ticket.
