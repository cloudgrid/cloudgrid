---
id: TICKET-403
title: Storage skill optimization persistence and reads
wave: wave_02_services
status: planned
parallel_group: null
depends_on: [TICKET-401]
blocked_by: []
spec_refs:
  - specs/02-capabilities/ai-eval/optimize-skills.md
  - specs/04-backend/ai-eval-runner.md
  - specs/06-nfr/ai-eval-content-capture.md
write_scope:
  - core/storage-write
  - core/storage-read
read_scope:
  - core/go-contracts
  - specs/03-contracts/messages/message-bridge.asyncapi.yaml
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

# TICKET-403: Storage Skill Optimization Detail

## Goal

Persist and read GraphQL-ready skill optimization step/detail state using
existing message contracts and storage-read view model conventions.

## Context Digest

AsyncAPI includes skill step and memory schemas, while storage currently stores
only coarse optimization run rows.

## Implementation Approach

Add storage-write subject handling and SurrealDB tables for step/memory records.
Extend storage-read shaping to assemble `SkillOptimizationDetail` from those
records.

## Decision Ledger

- No open decisions.

## Requirements Traceability

- `CAP-AIE-011`: persisted steps, diff data, rejected memory, exported refs.
- `TEC-BE-014`: runner persists optimization state through storage-write.
- `NFR-010`: bounded evidence and no raw trace dumps.

Requirement traceability source ids: CAP-AIE-011, TEC-BE-014, NFR-010.

## Contract Traceability

- Uses existing AsyncAPI step/memory payload names and GraphQL detail fields.
- No contract change.

## Tasks

- Add storage-write handling for optimization step and memory persist subjects.
- Add SurrealDB schema/write paths for `SkillOptimizationStep` and
  `SkillOptimizationMemory`.
- Extend storage-read optimization shaping to include `searchPolicy` and
  `skillOptimization` detail with steps, diffs, gate decisions, and refs.
- Preserve content-capture limits and no raw trace dumps.
- Add storage-write/read tests for accepted and rejected skill steps.

## Acceptance

- `OptimizationRun.skillOptimization.steps` is populated from persisted steps.
- Rejected edits are visible but not promotable.
- Storage-read returns bounded evidence refs and summaries only.

Success path: accepted and rejected steps are persisted and read in order.
Failure path: malformed step payloads return bounded validation errors.

## Acceptance Test Matrix

| Path | Test |
| --- | --- |
| Step write | `go test -tags surrealdb ./core/storage-write/...` |
| Detail read | `go test -tags surrealdb ./core/storage-read/...` |
| Bounds | storage-read focused test |

## Operational Path Coverage

- Security/privacy: no raw trace body in detail.
- Recovery: duplicate step writes are idempotent by step ID.
- Supply chain: no new dependency.

## Non-goals

- Do not implement runner loop.
- Do not add frontend-specific shaping in storage-write.

## Handoff

After this passes, `TICKET-404` can persist skill optimization progress.

## Verification

```sh
go test -tags surrealdb ./core/storage-write/... ./core/storage-read/...
bun run contracts:check
git diff --check -- core/storage-write core/storage-read
```
