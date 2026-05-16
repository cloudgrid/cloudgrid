# Cloudgrid-Side Work

Everything in this folder is intended to land in
`@cloudgrid/cloudgrid` (root:
`/Users/sebastianwessel/projekte/@cloudgrid/cloudgrid`).

## Files

- `01-spec-proposal.md` — Draft module spec in cloudgrid's spec format
  (frontmatter, `depends_on`, etc.). When promoted, becomes
  `cloudgrid/specs/01-domains/ai-eval.md` plus the capability/contract
  files listed in its §14 checklist.
- `02-implementation.md` — Concrete file-by-file build guide.
  Eight tasks (C1–C8) covering specs, collector, storage-write,
  storage-read, new `core/ai-eval-runner` service, BFF resolvers,
  frontend panels, and CLI.
- `03-day-1-pr.md` — The first PR to open against cloudgrid. Small,
  specs-only, unblocks every other PR.

## Prerequisites

Read first, from `../shared/`:

1. `01-landscape.md`
2. `02-protocol-interop.md`
3. `03-handshake.md`

## Boundary invariants (recap from `AGENTS.md`)

These are non-negotiable for any cloudgrid-side work:

- Frontend talks only to the TypeScript BFF.
- BFF talks to private services only through the NATS bridge.
- `core/storage-write` is the only mutator of SurrealDB.
- `core/storage-read` is the only fetcher from SurrealDB.
- Public reads are GraphQL only.
- The BFF must not derive, aggregate, score, or correlate telemetry.
- The new `core/ai-eval-runner` must not read/write SurrealDB directly.

## Out of scope on the cloudgrid side

- Implementing prompt-running, scoring algorithms, or optimization
  loops. All of that is harness-side work (`harness/02-adapter-implementation.md`).
- Bundling any LLM-judge model or model-provider credentials.
- Multi-tenant isolation (deferred per ADR-0004).
