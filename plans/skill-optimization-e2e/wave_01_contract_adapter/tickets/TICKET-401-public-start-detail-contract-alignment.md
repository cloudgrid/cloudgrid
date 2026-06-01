---
id: TICKET-401
title: Public start and detail contract alignment
wave: wave_01_contract_adapter
status: planned
parallel_group: contract_adapter
depends_on: []
blocked_by: []
spec_refs:
  - specs/02-capabilities/ai-eval/optimize-skills.md
  - specs/03-contracts/graphql/public-schema.graphql
  - specs/03-contracts/messages/message-bridge.asyncapi.yaml
write_scope:
  - apps/backend
  - apps/packages/public-api-client
  - apps/packages/ui-contracts
read_scope:
  - specs/03-contracts/graphql/public-schema.graphql
  - specs/03-contracts/messages/message-bridge.asyncapi.yaml
contract_readiness:
  status: ready
  required_contracts:
    - specs/03-contracts/graphql/public-schema.graphql
    - specs/03-contracts/messages/message-bridge.asyncapi.yaml
  missing_contracts: []
ticket_readiness:
  status: implementation_ready
  open_decisions: []
  ambiguous_phrases: []
---

# TICKET-401: Public Start And Detail Contract Alignment

## Goal

Allow public GraphQL/BFF/client code to start and read
`optimizerKind = skill_text_edit` optimization runs using existing approved
GraphQL and AsyncAPI fields.

## Context Digest

Public GraphQL already defines `searchPolicy`, `skillPolicy`, and
`SkillOptimizationDetail`. BFF validation and bridge payload construction lag
behind the approved contracts.

## Implementation Approach

Update existing validation, bridge, and public client operation modules in
place. Use current GraphQL and AsyncAPI field names exactly.

## Decision Ledger

- No open decisions.

## Requirements Traceability

- `CAP-AIE-011`: start and read skill optimization.
- `NFR-012`: public endpoint coverage uses shared public client.

Requirement traceability source ids: CAP-AIE-011, NFR-012.

## Contract Traceability

- Uses existing `StartOptimizationRunInput`, `OptimizationSearchPolicyInput`,
  `SkillOptimizationPolicyInput`, and `SkillOptimizationDetail`.
- No GraphQL or AsyncAPI contract change.

## Tasks

- Update BFF validation schemas so `StartOptimizationRunInput.searchPolicy`,
  `skillPolicy`, and `optimizerKind = skill_text_edit` are accepted.
- Align BFF bridge payload with AsyncAPI top-level optimization start fields:
  `baselineTargetSnapshotId`, `objective`, `searchPolicy`, and
  `idempotencyKey`.
- Update public API client operation selections and operation registry to fetch
  `objective`, `searchPolicy`, and `skillOptimization` detail.
- Add tests for accepted `skill_text_edit`, rejected invalid optimizer kinds,
  and bridge payload shape.

## Acceptance

- `startOptimizationRun` accepts a spec-shaped skill optimization input.
- BFF sends AsyncAPI-shaped optimization start requests.
- Public client can read `SkillOptimizationDetail` without local GraphQL
  documents.
- No GraphQL or AsyncAPI schema change is introduced.

Success path: a valid `skill_text_edit` request is accepted and bridged.
Failure path: an unknown optimizer kind is rejected before bridge publish.

## Acceptance Test Matrix

| Path | Test |
| --- | --- |
| Skill start validation | `bun test apps/backend/src/ai-eval.test.ts` |
| Bridge shape | `bun test apps/backend/src/bridge.test.ts` |
| Public client fields | `bun run --cwd apps/packages/public-api-client typecheck` |

## Operational Path Coverage

- Security/privacy: no provider secret or skill content is logged by validation.
- Observability: existing request IDs and problem mapping are preserved.
- Supply chain: no new dependency.

## Non-goals

- Do not edit GraphQL or AsyncAPI schemas.
- Do not implement runner skill logic.

## Handoff

After this passes, `TICKET-403` and `TICKET-404` can rely on aligned public and
bridge request shapes.

## Verification

```sh
bun test apps/backend/src/ai-eval.test.ts apps/backend/src/bridge.test.ts
bun run --cwd apps/packages/public-api-client typecheck
bun run --cwd apps/packages/ui-contracts typecheck
bun run contracts:check
git diff --check -- apps/backend apps/packages/public-api-client apps/packages/ui-contracts
```
