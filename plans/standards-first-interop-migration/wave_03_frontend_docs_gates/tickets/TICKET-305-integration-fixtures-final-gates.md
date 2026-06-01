---
id: TICKET-305
title: Integration fixtures and final gates
wave: wave_03_frontend_docs_gates
status: planned
parallel_group: frontend-docs
depends_on: [TICKET-302, TICKET-303]
blocked_by: []
spec_refs:
  - specs/06-nfr/integration-test-suite.md
  - specs/06-nfr/ai-eval-content-capture.md
  - specs/99-reviews/standards-first-simplification-review.md
write_scope:
  - apps/packages/integration-scenarios
  - tooling
  - plans/standards-first-interop-migration
read_scope:
  - core/otlp-collector
  - core/storage-read
  - core/ai-eval-runner
  - apps/frontend
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

# TICKET-305: Integration Fixtures And Final Gates

## Goal

Add hermetic integration coverage proving the migration works end to end with
standard telemetry and no required CloudGrid source span attributes.

## Context Digest

The migration is complete only when fixture adapter traces exercise the
collector, storage-read evidence extraction, runner trace-link policy, and
frontend/docs expectations.

## Implementation Approach

- Add deterministic fixture traces for OTel GenAI, OTel MCP, OpenInference, and
  standard HTTP/DB/exception spans.
- Add integration scenario coverage for external adapter async completion with
  OTLP trace linking.
- Update plan status evidence after gates pass.

## Decision Ledger

- No open decisions.

## Requirements Traceability

- `NFR-010`: content capture and redaction limits.
- `NFR-012`: integration test suite owns end-to-end coverage.
- `REV-011`: final proof of standard-first behavior.

Requirement traceability source ids: NFR-010, NFR-012, REV-011.

## Contract Traceability

- No contract changes.
- Uses existing OTLP, GraphQL, and message contracts.

## Tasks

- Add or update integration fixtures.
- Add assertions that source span attributes do not include
  `cloudgrid.ai.semconv.flavor` unless the fixture explicitly emitted it.
- Add assertions that AI Eval evidence is produced from standard spans.
- Update `_status.yaml` with final evidence after successful verification.

## Acceptance

- Integration fixtures pass without CloudGrid-specific source span attributes.
- Standard GenAI/MCP/OpenInference spans produce optimizer evidence.
- Missing trace evidence follows the documented exclusion behavior.
- Contracts, typecheck, Go tests, and integration tests pass.
- Success path: fixture adapter emits standard spans and skill optimization uses
  derived evidence.
- Failure path: fixture adapter missing trace evidence follows the exclusion
  behavior without blocking unrelated item scoring.

## Acceptance Test Matrix

| Path | Test |
| --- | --- |
| Integration scenarios | `bun run --cwd apps/packages/integration-scenarios test` |
| Full TS typecheck | `bun run typecheck` |
| Go backend subset | root Go workspace command for implemented services |
| Contracts | `bun run contracts:check` |

## Operational Path Coverage

- Recovery: missing/delayed traces are covered.
- Privacy: fixture content verifies bounded previews and no raw dump paths.
- Release: no new external dependency or credential is required by default.

## Verification

```sh
bun run --cwd apps/packages/integration-scenarios test
bun run typecheck
bun run contracts:check
go test -tags surrealdb ./core/go-runtime/... ./core/go-contracts/... ./core/otlp-collector/... ./core/control-plane/... ./core/storage-read/... ./core/storage-write/... ./core/ai-eval-runner/...
node /Users/sebastianwessel/.agents/skills/spec-architect/scripts/check_specs.mjs specs
git diff --check -- apps/packages/integration-scenarios tooling plans/standards-first-interop-migration
```

## Non-goals

- Do not require live external adapters in default CI.
- Do not add vendor-specific AI tracing packages.
- Do not expand AI projection entity types.

## Handoff

After this ticket passes and TICKET-304 passes, the standards-first interop
migration can be marked complete.
