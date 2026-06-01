---
id: TICKET-404
title: Runner skill text edit loop
wave: wave_02_services
status: planned
parallel_group: null
depends_on: [TICKET-401, TICKET-402, TICKET-403]
blocked_by: []
spec_refs:
  - specs/02-capabilities/ai-eval/optimize-skills.md
  - specs/04-backend/ai-eval-runner.md
  - specs/03-flows/ai-eval/skill-optimization-run.md
write_scope:
  - core/ai-eval-runner
read_scope:
  - core/go-contracts
  - test_data/ai_eval/skill_optimization
contract_readiness:
  status: ready
  required_contracts:
    - specs/03-contracts/messages/message-bridge.asyncapi.yaml
  missing_contracts: []
ticket_readiness:
  status: implementation_ready
  open_decisions: []
  ambiguous_phrases: []
---

# TICKET-404: Runner Skill Text Edit Loop

## Goal

Implement the bounded `skill_text_edit` runner path for deterministic end-to-end
skill optimization.

## Context Digest

Runner currently starts generic prompt optimization and ignores
`searchPolicy.optimizerKind = skill_text_edit`.

## Implementation Approach

Branch the existing optimization start path on `skill_text_edit`, perform
preflight, call deterministic skill endpoints, apply allowed edits in memory,
run validation using existing evaluation mechanics, and persist step/detail
state through storage-write ports.

## Decision Ledger

- No open decisions.

## Requirements Traceability

- `CAP-AIE-011`: skill edit loop, candidate snapshots, gate decisions.
- `TEC-BE-014`: runner-owned orchestration and adapter calls.
- `NFR-010`: training evidence only and bounded content.

Requirement traceability source ids: CAP-AIE-011, TEC-BE-014, NFR-010.

## Contract Traceability

- Consumes existing optimization start request fields and storage-write subjects.
- No GraphQL or AsyncAPI change.

## Tasks

- Honor `searchPolicy.optimizerKind = skill_text_edit`.
- Preflight baseline target skill package, `SKILL.md`, editable/protected globs,
  size limits, and no test-split reflection.
- Call harness skill dry-run and reflection endpoints.
- Reject invalid protected/oversized edits before validation.
- Apply valid edits in memory, persist a candidate target snapshot through the
  existing storage-write path, run validation, and apply strict gate decisions.
- Persist `SkillOptimizationStep`, rejected edit summaries, best/current skill
  refs, and exported best skill ref.
- Add runner tests for preflight failures, invalid edit rejection, accepted
  validation-backed candidate, test-split exclusion, and exported artifact ref.

## Acceptance

- Deterministic skill optimization creates one rejected step and one accepted
  candidate in tests.
- Missing trace evidence excludes reflection when trajectory evidence is
  required but does not block terminal-output scoring.
- Promotion remains explicit.

Success path: one valid edit produces an accepted candidate and exported ref.
Failure path: invalid protected-file edit is rejected before validation.

## Acceptance Test Matrix

| Path | Test |
| --- | --- |
| Preflight failure | `go test -tags surrealdb ./core/ai-eval-runner/...` |
| Invalid edit rejection | runner focused test |
| Accepted candidate | runner focused test |
| Test split exclusion | runner focused test |

## Operational Path Coverage

- Security/privacy: no validation/test rows or raw trace dumps enter reflection.
- Recovery: missing trace evidence excludes reflection when required.
- Supply chain: no new dependency.

## Non-goals

- Do not implement custom optimizer servers.
- Do not auto-promote target snapshots.

## Handoff

After this passes, frontend and integration tickets can run in parallel.

## Verification

```sh
go test -tags surrealdb ./core/ai-eval-runner/...
bun run contracts:check
git diff --check -- core/ai-eval-runner
```
