---
id: TICKET-402
title: Harness adapter skill endpoints and fixtures
wave: wave_01_contract_adapter
status: planned
parallel_group: contract_adapter
depends_on: []
blocked_by: []
spec_refs:
  - specs/02-capabilities/ai-eval/optimize-skills.md
  - specs/04-backend/ai-eval-runner.md
  - specs/06-nfr/integration-test-suite.md
write_scope:
  - apps/packages/cloudgrid-harness-adapter
  - test_data/ai_eval/skill_optimization
read_scope:
  - specs/02-capabilities/ai-eval/optimize-skills.md
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

# TICKET-402: Harness Skill Endpoints And Fixtures

## Goal

Provide deterministic harness adapter support and checked-in fixture packs for
skill optimization.

## Context Digest

The harness adapter currently supports deterministic run/score/prompt optimize
fixtures. Skill optimization needs bounded skill edit proposals and fixture
packages.

## Implementation Approach

Add schemas and route handlers beside existing harness adapter routes. Keep all
new harness behavior deterministic. Manual real-LLM data is fixture content only
and is not selected by integration code.

## Decision Ledger

- No open decisions.

## Requirements Traceability

- `CAP-AIE-011`: skill package and optimizer endpoint behavior.
- `TEC-BE-014`: runner-facing adapter endpoints.
- `NFR-012`: deterministic integration fixtures and manual real-LLM data.

Requirement traceability source ids: CAP-AIE-011, TEC-BE-014, NFR-012.

## Contract Traceability

- Uses approved adapter endpoint names from `TEC-BE-014`.
- No public GraphQL or AsyncAPI change.

## Tasks

- Extend harness adapter schemas to include `skill_text_edit`.
- Add deterministic skill endpoint support:
  `GET /capabilities`, `POST /skill-runtime/dry-run`,
  `POST /skill-optimization/reflect`,
  `POST /skill-optimization/merge-rank`,
  `POST /skill-optimization/slow-update`, and
  `POST /skill-optimization/meta-memory`.
- Add a deterministic fixture mode that returns one invalid protected-file edit
  and one valid `SKILL.md`/reference edit proposal.
- Add `test_data/ai_eval/skill_optimization/deterministic` with a skill package,
  manifest preview, and split JSONL rows.
- Add `test_data/ai_eval/skill_optimization/real-llm` with provider-neutral
  rows/config template and no secrets.

## Acceptance

- Default adapter tests stay deterministic.
- Real-LLM fixture data is opt-in and contains no credentials.
- Skill endpoint responses are bounded and structured.

Success path: deterministic adapter returns a valid skill edit proposal.
Failure path: deterministic adapter also returns an invalid protected-file edit
proposal for runner rejection tests.

## Acceptance Test Matrix

| Path | Test |
| --- | --- |
| Capabilities/dry-run | `bun test apps/packages/cloudgrid-harness-adapter/src` |
| Reflect/merge-rank | `bun test apps/packages/cloudgrid-harness-adapter/src` |
| Fixture integrity | `bun run --cwd apps/packages/cloudgrid-harness-adapter typecheck` |

## Operational Path Coverage

- Security/privacy: fixture packs contain no secrets.
- Performance: responses are bounded.
- Supply chain: no new dependency.

## Non-goals

- Do not call live LLM providers.
- Do not implement runner merge/rank policy.

## Handoff

After this passes, `TICKET-404` can call deterministic skill endpoints.

## Verification

```sh
bun test apps/packages/cloudgrid-harness-adapter/src
bun run --cwd apps/packages/cloudgrid-harness-adapter typecheck
git diff --check -- apps/packages/cloudgrid-harness-adapter test_data/ai_eval/skill_optimization
```
