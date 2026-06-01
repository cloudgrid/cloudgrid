# Standards-First Interop Migration Plan

Status: ready

Source specs:

- `specs/00-conventions.md`
- `specs/04-backend/otlp-mapping.md`
- `specs/04-backend/ai-eval-protocol-interop.md`
- `specs/04-backend/ai-eval-runner.md`
- `specs/02-capabilities/ai-eval/ingest-ai-projections.md`
- `specs/02-capabilities/ai-eval/optimize-skills.md`
- `specs/06-nfr/ai-eval-content-capture.md`
- `specs/07-adr/0007-harness-as-execution-surface.md`
- `specs/99-reviews/standards-first-simplification-review.md`

## Goal

Reduce custom CloudGrid telemetry requirements and make AI Eval skill
optimization work with production-standard OTLP traces, W3C trace context, OTel
GenAI, OTel MCP, OpenInference, and ordinary production spans.

## Current Gate State

- Specs define standards-first behavior.
- GraphQL and AsyncAPI contracts do not need shape changes.
- Existing implementation still stamps `cloudgrid.ai.semconv.flavor` into
  source span attributes; this plan removes that mutation.

## Implementation Phases

1. `source_telemetry_purity`: remove source telemetry mutation in the
   collector while preserving projection metadata.
2. `standard_evidence_extraction`: implement standard-first evidence
   extraction and runner trace-link behavior in parallel.
3. `frontend_docs_gates`: expose readiness in the frontend, document the
   adapter contract, and add end-to-end gates.
4. `adaptive_form_ux`: implement product-wide adaptive defaults, constrained
   controls, dependent form sections, and self-service validation.

## Requirement Coverage

- `CNV-001` standards-first rules are covered by TICKET-301 through TICKET-305.
- `PEX-017` through `PEX-020` adaptive form rules are covered by TICKET-306.
- `TEC-BE-004` source telemetry immutability is covered by TICKET-301.
- `TEC-BE-013` standard AI telemetry normalization is covered by TICKET-302.
- `TEC-BE-014` runner trace-link behavior is covered by TICKET-303.
- `CAP-AIE-011` skill optimization adapter behavior is covered by TICKET-303
  and TICKET-304.
- `NFR-010` content capture bounds are covered by TICKET-302 and TICKET-305.
- `REV-011` final standard-first proof is covered by TICKET-305.
- `REV-012` adaptive form proof is covered by TICKET-306.

## Global Rules

- Do not add required `cloudgrid.ai_eval.*` source span attributes.
- Do not require a CloudGrid SDK for customer runtimes.
- Do not parse adapter logs, file trees, MCP state, repositories, or business
  records outside the adapter and OTLP contracts.
- Do not mutate customer-emitted source telemetry during ingest.
- Keep BFF as GraphQL/message bridge mapping only.
- Keep storage-read as the owner of trace-to-evidence conversion.
- Keep storage-write as the only persistence mutator.

## Verification

Default gates:

```sh
bun run contracts:check
bun run typecheck
node /Users/sebastianwessel/.agents/skills/spec-architect/scripts/check_specs.mjs specs
```

Service gates are listed per ticket. External customer adapters are opt-in; the
default verification uses deterministic fixtures.

## Self-Audit

- Assumptions: OTel GenAI and OTel MCP remain the preferred standard sources;
  OpenInference remains accepted for existing AI frameworks.
- Path coverage: collector ingest, storage-write projection persistence,
  storage-read evidence extraction, runner orchestration, frontend readiness,
  adaptive forms, docs, and integration tests are covered.
- Unhappy path coverage: invalid source spans, missing trace refs, delayed trace
  persistence, adapter timeout, terminal response validation failure, and
  redacted content are assigned to tickets.
- NFR ownership: content redaction and trace evidence bounds stay in
  `NFR-010`; performance and payload bounds stay in `NFR-006`.
- Supply-chain ownership: no new runtime dependencies are required by this
  plan.
- Fake-work risk: tickets require fixture traces and concrete tests, not UI-only
  labels or no-op readiness states.
- Parallel risk: the storage-read and runner tickets have disjoint write
  scopes and communicate only through existing item-run/trace refs. Adaptive
  form work runs after readiness UI work to avoid frontend write-scope overlap.
- Blockers: none.
