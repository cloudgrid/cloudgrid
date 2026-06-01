---
id: skill_optimization_e2e
title: Skill Optimization End-To-End Implementation
status: ready
updated: 2026-05-31
spec_refs:
  - specs/02-capabilities/ai-eval/optimize-skills.md
  - specs/04-backend/ai-eval-runner.md
  - specs/06-nfr/integration-test-suite.md
  - specs/03-contracts/graphql/public-schema.graphql
  - specs/03-contracts/messages/message-bridge.asyncapi.yaml
---

# Skill Optimization End-To-End Implementation

## Goal

Implement `optimizerKind = skill_text_edit` end to end through public GraphQL,
the message bridge, runner, storage services, deterministic harness adapter,
frontend detail views, deterministic integration fixtures, and manual real-LLM
example test data.

## Waves

1. `wave_01_contract_adapter`: unblock public start/detail requests and provide
   deterministic skill adapter endpoints plus example fixtures.
2. `wave_02_services`: persist/read skill optimization detail and implement the
   runner skill loop against existing contracts.
3. `wave_03_frontend_integration`: render detail/diffs, execute deterministic
   scenarios, and add manual real-LLM example data/docs.

## Dependency Order

`TICKET-401` and `TICKET-402` may run in parallel. `TICKET-403` starts after
`TICKET-401`. `TICKET-404` starts after `TICKET-401`, `TICKET-402`, and
`TICKET-403`. `TICKET-405` and `TICKET-406` start after `TICKET-404`; they may
run in parallel because their write scopes are disjoint.

## Scope Rules

- Do not change GraphQL, AsyncAPI, or entity schema shape unless the ticket
  explicitly says contract drift was found and `contracts:check` is updated.
- Prefer existing contract fields: `searchPolicy`, `skillPolicy`,
  `skillOptimization`, `SkillOptimizationStep`, `SkillOptimizationEdit`, and
  target snapshot parts.
- Default and integration tests remain hermetic. Real-LLM execution is manual
  only and never part of automated integration.
- No worker may write outside its ticket `write_scope`.

## Requirement Coverage

- `CAP-AIE-011`: covered by all tickets.
- `TEC-BE-014`: covered by `TICKET-403` and `TICKET-404`.
- `NFR-012`: covered by `TICKET-406`.
- `NFR-010`: covered by `TICKET-403`, `TICKET-404`, and `TICKET-406`.

## Path Coverage

- Success path: deterministic skill fixture starts `skill_text_edit`, produces
  one accepted validation-backed candidate, exposes detail/diff, and remains
  explicitly promotable.
- Failure path: invalid protected-file edits are rejected before validation,
  malformed optimizer kinds fail validation, and manual real-LLM instructions
  keep provider credentials outside fixture files.
- Recovery path: missing trace evidence excludes reflection when required and
  does not block terminal-output scoring.

## NFR Operations Supply Chain Ownership

- Security/privacy: `TICKET-402`, `TICKET-403`, `TICKET-404`, and `TICKET-406`
  own no-secret fixtures, bounded evidence, and no raw trace dumps.
- Operations/release: `TICKET-406` owns deterministic automated execution and
  manual real-LLM example documentation.
- Supply chain: `TICKET-402` and `TICKET-406` own no new dependencies and
  checked-in fixture contents.

## Self-Audit

- Assumptions: existing approved GraphQL and AsyncAPI contracts are authoritative
  and no new contract fields are needed.
- Path evidence: success, invalid edit, missing trace evidence, explicit
  promotion, and manual real-LLM data boundaries are assigned above.
- NFR evidence: privacy, default hermetic execution, and no new dependency
  ownership are assigned above.
- Blockers: none.
- Parallel risk: frontend and integration tickets both read public API client
  changes but write disjoint surfaces after service work lands.
- Fake-work risk: deterministic adapter fixtures are required for automated
  tests; manual real-LLM data is not represented as an integration scenario.
