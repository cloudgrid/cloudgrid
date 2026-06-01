---
id: TICKET-304
title: Frontend and docs standard readiness
wave: wave_03_frontend_docs_gates
status: planned
parallel_group: frontend-docs
depends_on: [TICKET-302, TICKET-303]
blocked_by: []
spec_refs:
  - specs/05-frontend/ai-eval-views.md
  - specs/05-frontend/ai-eval-ux-concept.md
  - specs/02-capabilities/ai-eval/optimize-skills.md
write_scope:
  - apps/frontend
  - website/src/content/handbook
read_scope:
  - apps/packages/ui-contracts
  - specs/05-frontend/ai-eval-views.md
  - specs/05-frontend/ai-eval-ux-concept.md
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

# TICKET-304: Frontend And Docs Standard Readiness

## Goal

Show external adapter readiness in standards-first terms and document how users
reuse production telemetry for skill optimization.

## Context Digest

The UI should not ask for CloudGrid-specific span attributes. It should show
HTTP adapter readiness, async polling, trace propagation, recognized standard
semantic conventions, terminal output/output-ref support, and dry-run trace
links.

## Implementation Approach

- Update AI Eval skill optimization setup/readiness UI copy and checks.
- Keep frontend as a dumb GraphQL client rendering storage-read/BFF view models.
- Add handbook guidance for managed harness vs external adapter mode.
- Document standard telemetry expectations: W3C Trace Context, OTLP, OTel GenAI,
  OTel MCP, OpenInference, and production spans.

## Decision Ledger

- No open decisions.

## Requirements Traceability

- `TEC-FE-007`: AI Eval views expose runtime mode and readiness.
- `CAP-AIE-011`: users can select managed harness or external adapter.
- `REV-011`: standard-first integration requirements.

Requirement traceability source ids: TEC-FE-007, CAP-AIE-011, REV-011.

## Contract Traceability

- Uses existing GraphQL project settings, target snapshot, evaluation, and
  optimization view models.
- No contract changes.

## Tasks

- Update frontend labels/help text/readiness panels.
- Remove any UI wording that implies required `cloudgrid.ai_eval.*` span
  attributes.
- Add or update handbook docs for external adapter telemetry.
- Add frontend tests for readiness states if the relevant components exist.

## Acceptance

- UI presents standard semantic conventions, not CloudGrid-specific source span
  attributes, as the readiness target.
- UI distinguishes HTTP control readiness from OTLP trace readiness.
- Docs include a minimal external adapter checklist and do not require a
  CloudGrid SDK.
- Success path: ready adapters show HTTP control and OTLP evidence readiness.
- Failure path: missing trace propagation, missing terminal output, or missing
  semantic coverage displays actionable readiness errors.

## Acceptance Test Matrix

| Path | Test |
| --- | --- |
| Frontend type safety | `bun run --cwd apps/frontend typecheck` |
| Frontend AI Eval tests | existing focused AI Eval frontend tests |
| Website docs | `bun --bun run --cwd website build` |

## Operational Path Coverage

- Security/privacy: docs warn against sending secrets in spans or adapter
  responses.
- Usability: docs provide the easy managed harness path and external adapter
  path.

## Verification

```sh
bun run --cwd apps/frontend typecheck
bun --bun run --cwd website build
bun run contracts:check
git diff --check -- apps/frontend website/src/content/handbook
```

## Non-goals

- Do not create new GraphQL fields.
- Do not implement adapter runtime code.
- Do not add marketing pages.

## Handoff

This ticket can run in parallel with TICKET-305 after TICKET-302 and TICKET-303.
