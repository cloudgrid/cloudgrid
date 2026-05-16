# Harness-Side Work

Everything in this folder is intended to land in either:

- **`puristajs/harness`** (the runtime itself) — for the default
  emission protocol and config knobs.
- **`packages/cloudgrid-harness-adapter`** (a new TypeScript package) —
  for the cloudgrid integration layer (HTTP endpoints, scorers,
  optimization workflows).

These are **two distinct bodies of work** even though both are TypeScript
and both are "the harness side" from cloudgrid's perspective.

## Files

- `01-default-protocol.md` — Recommendation for `puristajs/harness`:
  what to emit by default so it works equally well with cloudgrid,
  Langfuse, Phoenix, and Laminar. Six concrete checklist items for
  harness maintainers.
- `02-adapter-implementation.md` — Build the
  `cloudgrid-harness-adapter` package. File-by-file. Tasks H1–H4.
- `03-day-1-pr.md` — The first PR to open. Adapter skeleton, produces
  the first observable handshake with cloudgrid.

## Where does the adapter package live?

Open question. Three options:

1. **Inside the cloudgrid repo** at `packages/cloudgrid-harness-adapter/`
   (default for v1). Ships with cloudgrid's release cadence; cloudgrid
   owns the integration. Trade-off: forces harness operators to depend
   on the cloudgrid monorepo for a TS package.
2. **Inside `puristajs/harness`** as `packages/cloudgrid-adapter/`.
   Couples harness's release to cloudgrid integration. Trade-off:
   harness becomes opinionated about cloudgrid.
3. **Standalone repo** `puristajs/cloudgrid-harness-adapter` or
   `cloudgrid/harness-adapter`. Clean separation, independent versioning.
   Trade-off: an extra repo to maintain and tag releases for.

Default to (1) for v1 because it keeps the contract tests in the same
repo as the runner that consumes them. Revisit when the adapter becomes
its own product.

## Prerequisites

Read first, from `../shared/`:

1. `01-landscape.md`
2. `02-protocol-interop.md`
3. `03-handshake.md`

## Boundary invariants

- Harness never depends on cloudgrid. It is a standalone runtime.
- The adapter package depends on `@purista/harness` but **not** on any
  cloudgrid Go service.
- The adapter package exposes only the HTTP contract from
  `../shared/03-handshake.md` §2. It does not call into cloudgrid; it
  is *called by* cloudgrid's `core/ai-eval-runner`.
- Telemetry flows OTLP → cloudgrid collector. The adapter never POSTs
  spans into cloudgrid's GraphQL or NATS.
