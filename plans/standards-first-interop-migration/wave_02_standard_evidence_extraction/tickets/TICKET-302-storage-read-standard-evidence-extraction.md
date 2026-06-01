---
id: TICKET-302
title: Storage-read standard evidence extraction
wave: wave_02_standard_evidence_extraction
status: planned
parallel_group: standard-evidence
depends_on: [TICKET-301]
blocked_by: []
spec_refs:
  - specs/04-backend/ai-eval-protocol-interop.md
  - specs/04-backend/ai-eval-query-semantics.md
  - specs/06-nfr/ai-eval-content-capture.md
write_scope:
  - core/storage-read
read_scope:
  - core/go-contracts
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

# TICKET-302: Storage-Read Standard Evidence Extraction

## Goal

Derive AI Eval important steps and trajectory summaries from standard source
spans instead of CloudGrid-specific span attributes.

## Context Digest

Storage-read owns GraphQL-ready view models and optimizer evidence. It should
consume OTel GenAI, OTel MCP, OpenInference, and standard production spans from
persisted traces.

## Implementation Approach

- Implement or update storage-read evidence extraction from persisted trace
  spans.
- Use `TEC-BE-013` precedence: OTel GenAI, OTel MCP, OpenInference, standard
  HTTP/RPC/database/messaging/filesystem/exception/resource conventions, then
  adapter-profile selectors.
- Produce bounded `importantSteps` and `trajectorySummary` without exposing raw
  full traces to BFF/frontend/optimizer code.
- Preserve content-capture limits from `NFR-010`.

## Decision Ledger

- No open decisions.

## Requirements Traceability

- `TEC-BE-013`: storage-read owns trace-to-evidence conversion.
- `NFR-010`: preview content is bounded and policy-gated.
- `TEC-BE-014`: runner consumes normalized storage-read evidence.

Requirement traceability source ids: TEC-BE-013, NFR-010, TEC-BE-014.

## Contract Traceability

- Uses existing `EvaluationImportantStep`, `trajectorySummary`, trace refs, and
  metric result contracts.
- No generated contract changes.

## Tasks

- Add fixture traces covering OTel GenAI, OTel MCP, OpenInference, HTTP, DB, and
  exception spans.
- Implement extraction/ranking of important steps.
- Add tests for unrecognized spans remaining generic trace detail.
- Add tests for content preview truncation/redaction boundaries.

## Acceptance

- OTel GenAI model spans become model-call important steps.
- OTel MCP tool calls become MCP/tool important steps.
- OpenInference `TOOL` and `RETRIEVER` spans remain accepted.
- Standard HTTP/DB/exception spans contribute failure context only when selected
  by profile or when they are direct children of the evaluated item trace.
- Unrecognized spans do not block evaluation.
- Success path: recognized standard AI/tool spans produce bounded evidence.
- Failure path: invalid, unrecognized, or redacted spans remain trace detail and
  do not leak raw content into optimizer evidence.

## Acceptance Test Matrix

| Path | Test |
| --- | --- |
| GenAI/OpenInference evidence | `go test -tags surrealdb ./core/storage-read/...` |
| MCP evidence | `go test -tags surrealdb ./core/storage-read/...` |
| Content bounds | `go test -tags surrealdb ./core/storage-read/...` |

## Operational Path Coverage

- Security/privacy: no raw trace dumps in optimizer evidence.
- Observability: evidence links retain trace/span refs.
- Performance: extraction works from bounded trace detail queries.

## Verification

```sh
go test -tags surrealdb ./core/storage-read/...
bun run contracts:check
git diff --check -- core/storage-read
```

## Non-goals

- Do not change GraphQL schema.
- Do not implement new projection entities for RERANKER/GUARDRAIL/EVALUATOR.
- Do not parse adapter logs or customer file trees.

## Handoff

TICKET-304 and TICKET-305 may use the standard evidence view after this passes.
