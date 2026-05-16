---
id: PROP-AIEVAL-CG-PR1-001
title: Cloudgrid day-1 PR — ai-eval domain skeleton
layer: proposal
status: proposal
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-10
---

# Cloudgrid Day-1 PR

The first PR to open against `@cloudgrid/cloudgrid`. Small, specs-only,
unblocks every other PR.

## Title

`spec: introduce ai-eval domain skeleton`

## Scope

Touches `specs/` only. Adds the new domain spec, capability stubs,
AsyncAPI subject names, error code names, JSON schema **filenames** (with
TODO bodies), and the four ADR stubs.

**Does not add code.** **Does not finalise the JSON schemas** — those
land in PR #2.

## Files created

- `specs/01-domains/ai-eval.md` — domain definition (use
  `cloudgrid/01-spec-proposal.md` as the source).
- `specs/02-capabilities/ai-eval/ingest-ai-projections.md` (stub)
- `specs/02-capabilities/ai-eval/evaluate-online.md` (stub)
- `specs/02-capabilities/ai-eval/evaluate-offline.md` (stub)
- `specs/02-capabilities/ai-eval/optimize-prompts.md` (stub)
- `specs/02-capabilities/ai-eval/annotate-traces.md` (stub)
- `specs/03-contracts/entities/ai/agent-run.schema.json` (TODO body)
- `specs/03-contracts/entities/ai/llm-call.schema.json` (TODO body)
- `specs/03-contracts/entities/ai/tool-call.schema.json` (TODO body)
- `specs/03-contracts/entities/ai/retrieval-event.schema.json` (TODO body)
- `specs/03-contracts/entities/ai/dataset.schema.json` (TODO body)
- `specs/03-contracts/entities/ai/dataset-item.schema.json` (TODO body)
- `specs/03-contracts/entities/ai/scorer.schema.json` (TODO body)
- `specs/03-contracts/entities/ai/eval-result.schema.json` (TODO body)
- `specs/03-contracts/entities/ai/experiment.schema.json` (TODO body)
- `specs/03-contracts/entities/ai/experiment-run.schema.json` (TODO body)
- `specs/03-contracts/entities/ai/prompt-version.schema.json` (TODO body)
- `specs/03-contracts/entities/ai/annotation-queue-item.schema.json` (TODO body)
- `specs/04-backend/ai-eval-runner.md` (stub)
- `specs/04-backend/ai-eval-projection-mapping.md` (stub)
- `specs/04-backend/ai-eval-online-scoring.md` (stub)
- `specs/05-frontend/ai-eval-views.md` (stub)
- `specs/06-nfr/ai-eval-content-capture.md` (stub)
- `specs/06-nfr/ai-eval-cost-bounds.md` (stub)
- `specs/07-adr/0006-typescript-only-optimization.md` (full body — this
  is the binding decision, write it in full from
  `01-spec-proposal.md` §12 and the rationale in
  `../shared/01-landscape.md` §6).
- `specs/07-adr/0007-harness-as-execution-surface.md` (full body — records
  the HTTP contract from `../shared/03-handshake.md` §2).
- `specs/07-adr/0008-content-capture-policy.md` (full body — records the
  no-content default and the env var override from
  `../shared/02-protocol-interop.md` §2.5).
- `specs/07-adr/0009-scorer-library-autoevals.md` (full body — picks
  `autoevals` as the v1 RAG/judge scorer library).

## Files modified

- `specs/03-contracts/messages/message-bridge.asyncapi.yaml` — append
  the subject declarations from `01-spec-proposal.md` §5.3 (with
  TODO message bodies).
- `specs/03-contracts/graphql/public-schema.graphql` — append the
  types from `01-spec-proposal.md` §8 (mark the new types with
  `@experimental` if your SDL extensions support it).
- `specs/03-contracts/errors.yaml` — append `ERR-AIE-001..005`.
- `specs/spec.md` — add the new domain + capabilities + ADRs to the
  index.
- `specs/00-architecture-overview.md` — update the Public API Inventory:
  add the `eval.*` GraphQL surface area and the `core/ai-eval-runner`
  service entry (build tag `aieval`).

## Files NOT touched

- Any file under `core/`, `apps/`, `packages/`, `tooling/`.
- Any contract test bodies (just the filenames land here).

## Acceptance checks

- `bun run typecheck` — green (only schema/spec changes).
- `bun run lint` — green.
- `bun run contracts:check` — green. This is the meaningful one:
  passes when every subject in the AsyncAPI, every error code in
  `errors.yaml`, every GraphQL type, and every JSON schema filename
  is consistently referenced by the new spec/capability files.
- No `core/` or `apps/` files modified (CI guard).

## PR description template

```
## Why
First step in landing the AI evaluation module proposed in
`@cloudgrid/ai-eval-research/`. This PR only adds spec/contract
filenames so subsequent PRs have stable references to point at.

## What
- New domain `ai-eval` with capability stubs.
- New AsyncAPI subjects under `eval.*`, `annotation.*`,
  `telemetry.ingest.ai_projections`, `ai.persisted.projections`.
- New GraphQL types and operations (marked @experimental).
- New error codes ERR-AIE-001..005.
- Four ADRs:
  - 0006 TypeScript-only optimization
  - 0007 Harness as execution surface
  - 0008 Content capture policy
  - 0009 Scorer library (autoevals)

## Not in this PR
- No code under `core/`, `apps/`, `packages/`, `tooling/`.
- JSON Schema bodies are TODO. The schemas exist by name only.
- No GraphQL resolvers, no NATS handlers, no UI.

## How to verify
- `bun run contracts:check`
- Skim the new ADRs — they encode the four binding decisions.

## Follow-ups
- PR #2: fill in JSON Schema bodies + Go/TS generated types.
- PR #3: collector AI projection extractor (`core/otlp-collector` + new
  `internal/ai/` package).
- PR #4: storage-write AI persistence handler.
```

## What happens after this PR merges

Once it's green, three follow-up PRs become unblockable in parallel
(they share no files):

- PR #2 (contract bodies + generated types) — touches
  `specs/03-contracts/entities/ai/*.schema.json` and
  `packages/go-contracts/`, `packages/ui-contracts/`,
  `packages/definition/`.
- PR #3 (collector AI projection extractor) — touches
  `core/otlp-collector/internal/ai/`.
- PR #4 (storage-write AI persistence) — touches
  `core/storage-write/internal/handlers/` and the SurrealDB adapter.

Each of those is in the C2/C3 sections of `02-implementation.md`.

## On the harness side, in parallel

Open `harness/03-day-1-pr.md` simultaneously. The adapter PR has zero
file overlap with this one and the two together produce the **first
observable handshake** (harness runs → spans land in cloudgrid → AI
projections appear).
