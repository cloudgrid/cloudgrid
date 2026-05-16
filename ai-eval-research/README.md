# AI Evaluation Module — Research & Implementation Workspace

This folder sits **outside any repo**. It is a planning workspace for a
cross-cutting feature that lands in two different codebases:

- **`@cloudgrid/cloudgrid`** — observability backend.
- **`puristajs/harness`** (and the cloudgrid-harness adapter package) —
  the AI runtime that produces telemetry and runs evaluations.

Nothing here is authoritative. Once promoted, each repo gets its own
copies inside its own `specs/` or `docs/` tree.

## Layout

```
ai-eval-research/
├── README.md                       ← you are here
├── shared/                         ← read by both repos
│   ├── 01-landscape.md             Landscape research (OSS + closed source, May 2026)
│   ├── 02-protocol-interop.md      OTel gen_ai ↔ OpenInference normalization spec
│   └── 03-handshake.md             Wire contract between cloudgrid and harness
├── cloudgrid/                      ← work that lands in @cloudgrid/cloudgrid
│   ├── README.md
│   ├── 01-spec-proposal.md         Draft module spec in cloudgrid's spec format
│   ├── 02-implementation.md        Concrete file-by-file build guide
│   └── 03-day-1-pr.md              First PR to open against cloudgrid
└── harness/                        ← work that lands in puristajs/harness + the adapter
    ├── README.md
    ├── 01-default-protocol.md      Recommendation: what harness emits by default
    ├── 02-adapter-implementation.md Build the cloudgrid-harness-adapter package
    └── 03-day-1-pr.md              First PR to open against harness
```

## How to read this

If you are sitting in front of the **cloudgrid** repo, read in order:

1. `shared/01-landscape.md` — to know what's out there and why we picked
   this shape.
2. `shared/02-protocol-interop.md` — to understand the two LLM-flavored
   OTel conventions cloudgrid must ingest.
3. `cloudgrid/01-spec-proposal.md` — the draft spec to promote into
   `cloudgrid/specs/`.
4. `cloudgrid/02-implementation.md` — the file-by-file work plan.
5. `cloudgrid/03-day-1-pr.md` — open this first.

If you are sitting in front of the **harness** repo (or the adapter
package), read in order:

1. `shared/01-landscape.md` — same reason.
2. `shared/02-protocol-interop.md` — to know what cloudgrid will read.
3. `harness/01-default-protocol.md` — what to change in `puristajs/harness`
   so it works equally well with cloudgrid, Langfuse, Phoenix, Laminar.
4. `harness/02-adapter-implementation.md` — build the
   `cloudgrid-harness-adapter` package.
5. `harness/03-day-1-pr.md` — open this first.

`shared/03-handshake.md` is the contract that binds the two — both sides
must agree on it before either side ships anything.

## Path conventions inside these docs

Paths like `core/…`, `apps/…`, `packages/…`, `specs/…` refer to the
**cloudgrid** repo (root: `/Users/sebastianwessel/projekte/@cloudgrid/cloudgrid`).

Paths like `packages/harness/…`, `examples/…` refer to the
**puristajs/harness** repo.

The cloudgrid-harness adapter package's home repo is **an open question**.
Three viable placements with trade-offs documented in
`harness/02-adapter-implementation.md` §1. Defaulting to the cloudgrid repo
for now (`packages/cloudgrid-harness-adapter/`) because it ships with
cloudgrid's release cadence.

## Status

All files in this workspace are **proposals**. None of them are spec or
contract source-of-truth. When a section graduates, it moves into the
relevant repo's authoritative tree and is deleted from here.

Last updated: 2026-05-10.
