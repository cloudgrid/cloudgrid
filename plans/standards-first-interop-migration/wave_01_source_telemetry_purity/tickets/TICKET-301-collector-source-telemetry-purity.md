---
id: TICKET-301
title: Collector source telemetry purity
wave: wave_01_source_telemetry_purity
status: planned
parallel_group: null
depends_on: []
blocked_by: []
spec_refs:
  - specs/00-conventions.md
  - specs/04-backend/otlp-mapping.md
  - specs/04-backend/ai-eval-protocol-interop.md
  - specs/02-capabilities/ai-eval/ingest-ai-projections.md
write_scope:
  - core/otlp-collector
read_scope:
  - specs/04-backend/ai-eval-protocol-interop.md
  - specs/02-capabilities/ai-eval/ingest-ai-projections.md
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

# TICKET-301: Collector Source Telemetry Purity

## Goal

Stop mutating customer-emitted source spans with
`cloudgrid.ai.semconv.flavor`. Keep `sourceFlavor` only on AI projection
commands/entities and normalization metadata.

## Context Digest

The collector already derives AI projections from OTel GenAI and OpenInference
attributes. The standards-first spec requires source telemetry to remain
immutable and portable.

## Implementation Approach

- Remove any collector path that injects `cloudgrid.ai.semconv.flavor` into
  source span attributes.
- Keep projection `SourceFlavor` and projection payload `sourceFlavor`.
- Keep conflict warnings for OTel GenAI/OpenInference disagreement.
- Update tests that expected source span mutation so they assert source
  attributes remain unchanged.

## Decision Ledger

- No open decisions.

## Requirements Traceability

- `CNV-001`: customer OTLP source telemetry is immutable input.
- `TEC-BE-004`: normalization metadata belongs on derived records, not source
  telemetry.
- `TEC-BE-013`: source flavor is projection metadata.
- `CAP-AIE-001`: AI projections remain additive and do not mutate generic trace
  persistence.

Requirement traceability source ids: CNV-001, TEC-BE-004, TEC-BE-013,
CAP-AIE-001.

## Contract Traceability

- No GraphQL, AsyncAPI, OpenAPI, or entity schema changes.
- Existing `PersistAiProjectionCommand.sourceFlavor` remains authoritative.

## Tasks

- Update collector AI projection extraction/annotation code.
- Update collector handler tests and AI extraction tests.
- Confirm generic trace persistence no longer includes the CloudGrid flavor
  attribute when source input omitted it.

## Acceptance

- A span with `gen_ai.operation.name = "chat"` creates an `LlmCall` projection
  with `sourceFlavor = gen_ai`.
- The persisted source span attributes equal the emitter-provided attributes.
- A span with both OTel GenAI and OpenInference still records projection
  warnings without changing source telemetry.
- Success path: valid OTel GenAI and OpenInference spans create projections.
- Failure path: spans without AI markers create no projection and generic trace
  persistence remains unchanged.

## Acceptance Test Matrix

| Path | Test |
| --- | --- |
| OTel GenAI projection | `go test ./core/otlp-collector/...` |
| OpenInference projection | `go test ./core/otlp-collector/...` |
| Source immutability | collector handler test checks no injected `cloudgrid.ai.semconv.flavor` |

## Operational Path Coverage

- Security/privacy: no new source attributes with project or product metadata.
- Observability: projection metadata remains available for CloudGrid analysis.
- Recovery: existing idempotent projection command behavior is unchanged.

## Verification

```sh
go test ./core/otlp-collector/...
bun run contracts:check
git diff --check -- core/otlp-collector
```

## Non-goals

- Do not add new AI projection kinds.
- Do not change storage-write schemas.
- Do not add CloudGrid SDK requirements.

## Handoff

After this ticket passes, TICKET-302 and TICKET-303 can run in parallel.
