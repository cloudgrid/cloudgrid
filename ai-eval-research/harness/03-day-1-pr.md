---
id: PROP-AIEVAL-HRN-PR1-001
title: Harness day-1 PR — adapter skeleton
layer: proposal
status: proposal
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-10
---

# Harness Day-1 PR

The first PR to open on the harness side. Creates the
`cloudgrid-harness-adapter` package as a runnable skeleton that produces
the **first observable handshake** with cloudgrid: harness runs → spans
land in cloudgrid → cloudgrid sees one of its expected span shapes.

Opens in parallel with `../cloudgrid/03-day-1-pr.md`. Zero file overlap
between them.

## Title

`feat: cloudgrid-harness-adapter skeleton`

## Target repo

`@cloudgrid/cloudgrid` at `packages/cloudgrid-harness-adapter/` —
default placement, see `02-adapter-implementation.md` §1 for the
alternatives.

If you've decided to place the adapter elsewhere (option 2 or 3 in
that section), retarget this PR accordingly. The file layout below is
identical regardless of repo.

## Scope

Creates the package. Implements one endpoint end-to-end (`/v1/run`)
plus the two trivial endpoints (`/healthz`, `/v1/agents`). Wires OTel
SDK with W3C trace context propagation, exporting to a configurable
collector endpoint. One Bun test asserting the exported span tree.

**Does not implement** `/v1/optimize`. **Does not implement** `/v1/score`.
Those land in subsequent PRs.

## Files created

```
packages/cloudgrid-harness-adapter/
├── package.json                      # bun, ESM, name @cloudgrid/harness-adapter
├── tsconfig.json
├── README.md
├── .env.example
├── src/
│   ├── server.ts                     # Hono routes wiring
│   ├── routes/
│   │   ├── run.ts                    # POST /v1/run — end-to-end against ONE hard-coded agent
│   │   ├── health.ts                 # GET /healthz
│   │   └── agents.ts                 # GET /v1/agents
│   ├── otel.ts                       # OTLP exporter + traceparent propagation
│   ├── harness.ts                    # session builder; loads from .env
│   └── contracts.ts                  # Zod schemas (RunRequest, RunResponse only for now)
└── tests/
    └── run.spec.ts                   # asserts /v1/run exports a parent-child span tree
```

## Behavior

### `GET /healthz`

Returns `200 { "ok": true }` if the embedded harness session
initialised cleanly. `503` otherwise.

### `GET /v1/agents`

Returns `200 { "agents": [...] }` listing the agents the harness
exposes. Schema:

```ts
{ agents: { name: string, version: string }[] }
```

### `POST /v1/run`

Implements the contract from `../shared/03-handshake.md` §2 for a single
hard-coded agent (the "echo" agent or similar trivial agent included
in `harness.ts`). Returns a real validated output via
`session.agents.<name>.generate()`.

Extracts `traceparent` from the inbound request and propagates it
through harness so the OTLP exporter emits spans with the correct
parent context.

### OTel wiring

`src/otel.ts` configures:

```
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT (env)  → collector
OTEL_SEMCONV_STABILITY_OPT_IN=gen_ai_latest_experimental
OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT=NO_CONTENT
PURISTA_TELEMETRY_FLAVOR=dual    # see harness/01-default-protocol.md
```

## Files NOT touched

- Anything outside `packages/cloudgrid-harness-adapter/`.
- The cloudgrid `core/` services (those are
  `../cloudgrid/03-day-1-pr.md`'s scope).
- Specs.

## Acceptance checks

- `bun install` resolves with zero Python transitive deps. Check with:
  ```
  bun pm ls | grep -E "python|optuna" && exit 1 || exit 0
  ```
- `bun run typecheck` green.
- `bun run lint` green.
- `bun test packages/cloudgrid-harness-adapter` — one passing test:
  - `POST /v1/run` with a known input returns a 200 with the validated
    output, and the in-memory OTel test exporter has captured a span
    tree with one parent server span (the route) and one child agent
    span (with `gen_ai.operation.name = "invoke_agent"`).
- Manual smoke test: start the adapter, set `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`
  to a local cloudgrid collector, POST a `/v1/run`, confirm the trace
  appears in cloudgrid's trace UI.

## PR description template

```
## Why
First step in landing the AI evaluation module proposed in
`@cloudgrid/ai-eval-research/`. Produces the first observable
handshake with cloudgrid: harness runs through this adapter → OTLP
spans land in cloudgrid's collector.

## What
- New TS package `packages/cloudgrid-harness-adapter`.
- Hono server with three endpoints: `/healthz`, `/v1/agents`, `/v1/run`.
- OTel SDK wired with W3C Trace Context propagation, exporting OTLP
  HTTP to a configurable collector.
- One hard-coded test agent (echo or trivial) wired through harness.
- One Bun integration test asserting the exported span tree.

## Not in this PR
- `/v1/score`, `/v1/optimize` — follow-up PRs.
- `autoevals`, `@ax-llm/ax` dependencies — follow-up PRs.
- Critic/mutator/judge agent prompts — follow-up PRs.

## How to verify
- `bun install`, `bun test packages/cloudgrid-harness-adapter`.
- Local smoke test pointing `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` at
  a running cloudgrid stack.

## Pairs with
`#<cloudgrid PR #1>` — the spec-side counterpart that gives cloudgrid
a place to put the spans this PR emits.
```

## What happens after this PR merges

Three follow-up PRs become unblockable (no shared files):

- **PR #2** — `/v1/score` implementation. Adds `autoevals` dependency,
  `src/scorers/`, contract for `Scorer.definition`.
- **PR #3** — `/v1/optimize` with `bootstrap-fewshot` only. Adds
  `@ax-llm/ax` dependency, `src/workflows/bootstrap-fewshot.ts`.
- **PR #4** — `/v1/optimize` with `critic-mutate-judge-pick`. Adds the
  native PURISTA workflow and the three operator-overridable prompts
  for critic, mutator, and judge.

## On the cloudgrid side, in parallel

Open `../cloudgrid/03-day-1-pr.md` simultaneously. Zero file overlap.
The two PRs combined produce the first observable handshake:

```
harness adapter (this PR) emits gen_ai.* span
      ↓ OTLP/HTTP
cloudgrid core/otlp-collector receives the span
      ↓ (after follow-up PR #3 of cloudgrid side)
ai_agent_run projection persisted, queryable through GraphQL
```
