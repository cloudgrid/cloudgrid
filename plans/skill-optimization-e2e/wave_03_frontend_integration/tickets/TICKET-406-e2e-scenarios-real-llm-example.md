---
id: TICKET-406
title: E2E skill optimization scenarios and manual real LLM data
wave: wave_03_frontend_integration
status: planned
parallel_group: frontend_integration
depends_on: [TICKET-404]
blocked_by: []
spec_refs:
  - specs/06-nfr/integration-test-suite.md
  - specs/02-capabilities/ai-eval/optimize-skills.md
write_scope:
  - apps/packages/integration-scenarios
  - tooling
  - test_data/ai_eval/skill_optimization
  - website/src/content/handbook/evaluations
read_scope:
  - apps/packages/public-api-client
  - apps/packages/cloudgrid-harness-adapter
contract_readiness:
  status: ready
  required_contracts:
    - specs/03-contracts/graphql/public-schema.graphql
  missing_contracts: []
ticket_readiness:
  status: implementation_ready
  open_decisions: []
  ambiguous_phrases: []
---

# TICKET-406: E2E Scenarios And Manual Real LLM Data

## Goal

Add executable deterministic skill optimization integration coverage and manual
real-LLM example data that is never executed by automated integration tests.

## Context Digest

Integration metadata mentions skill optimization, but executable scenarios do
not yet drive `skill_text_edit` through public entrypoints or provide manual
real-LLM example data for operator runs.

## Implementation Approach

Extend typed integration scenarios and local orchestration for deterministic AI
harness execution only. Add manual real-LLM data/docs outside the integration
runner.

## Decision Ledger

- No open decisions.

## Requirements Traceability

- `CAP-AIE-011`: end-to-end skill optimization behavior.
- `NFR-012`: public endpoint integration coverage.
- `NFR-010`: bounded evidence and no raw dumps.

Requirement traceability source ids: CAP-AIE-011, NFR-012, NFR-010.

## Contract Traceability

- Uses public GraphQL operations and OTLP endpoints.
- No contract change.

## Tasks

- Extend integration scenario metadata and executable scenario to start
  `skill_text_edit`, read detail, assert invalid edit rejection, accepted
  validation-backed candidate, skill diff, explicit promotion readiness, and
  no required CloudGrid-specific source span attributes.
- Wire deterministic scenario into local integration.
- Add manual real-LLM fixture data for operator-driven tests against configured
  providers.
- Document how to run the deterministic integration scenario and how to use the
  manual real-LLM data outside automated integration.

## Acceptance

- Default and integration tests remain hermetic and use the AI harness adapter.
- No automated integration scenario calls a live model provider.
- Example data is checked in and contains no secrets.

Success path: deterministic scenario accepts a validation-backed skill
candidate and reads detail/diff. Failure path: invalid edit rejection is
asserted. Manual real-LLM data is documented separately.

## Acceptance Test Matrix

| Path | Test |
| --- | --- |
| Deterministic scenario | `bun run --cwd apps/packages/integration-scenarios test` |
| Manual real-LLM data | fixture/docs test or typecheck coverage |
| Local orchestration | `bun run typecheck` |

## Operational Path Coverage

- Security/privacy: manual real-LLM fixture has no secrets.
- Recovery: automated integration has no live-provider dependency.
- Supply chain: no new dependency.

## Non-goals

- Do not require or perform live LLM calls in automated integration or default CI.
- Do not add vendor-specific tracing packages.

## Handoff

After this passes, the plan can be marked complete after broad gates.

## Verification

```sh
bun run --cwd apps/packages/integration-scenarios test
bun run typecheck
bun run contracts:check
node /Users/sebastianwessel/.agents/skills/spec-architect/scripts/check_specs.mjs specs
git diff --check -- apps/packages/integration-scenarios tooling test_data/ai_eval/skill_optimization website/src/content/handbook/evaluations
```
