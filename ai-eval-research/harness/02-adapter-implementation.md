---
id: PROP-AIEVAL-HRN-IMPL-001
title: cloudgrid-harness-adapter — implementation guide
layer: proposal
status: proposal
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-10
---

# `cloudgrid-harness-adapter` — Implementation Guide

A small TypeScript package that an operator runs as a sidecar to their
harness instance. Exposes the cloudgrid runner HTTP contract from
`../shared/03-handshake.md` §2 and translates each endpoint into harness
agent/workflow invocations.

Two bodies of work:

- **In `puristajs/harness`**: the default-protocol changes documented in
  `01-default-protocol.md`. Six checklist items there.
- **In `packages/cloudgrid-harness-adapter`** (or wherever it ends up
  living — see `README.md`): four tasks H1–H4 here.

## 1. Package placement (decide before H2)

| Option | Pros | Cons |
| --- | --- | --- |
| Inside cloudgrid repo (`packages/cloudgrid-harness-adapter/`) — **default** | Ships with cloudgrid release cadence. Contract tests live next to the runner that consumes them. | Harness operators pull a cloudgrid-monorepo TS package. |
| Inside `puristajs/harness` (`packages/cloudgrid-adapter/`) | One npm namespace for everything harness-related. | Couples harness releases to cloudgrid integration. |
| Standalone repo | Clean separation, independent versioning. | Extra repo to tag, publish, and discover. |

V1: default to placement 1. The implementation guide assumes that
location; everything is path-relative, so moving later is mechanical.

## 2. Tasks

### H1 — Verify harness OTel emission shape

**Not code — a measurement.** Run
`puristajs/harness/examples/living-wiki-jaeger`, point its OTLP exporter
at the cloudgrid collector, capture spans, and check:

- Span kinds: agent, tool, model spans are distinct.
- Attribute namespace: which of `gen_ai.*` vs OpenInference vs
  harness-native is emitted by default. (Almost certainly only one of
  these today, which is the point of `01-default-protocol.md`.)
- Span events: prompt/completion bodies appear as events with the
  expected names.
- W3C trace context: agent → tool → model parent-child reconstructs.

Output: one short markdown report titled "Harness OTel emission
inventory" listing every attribute observed and whether the
projection-dispatch rules in `../shared/02-protocol-interop.md` §3
handle it.

**Standards touched**: OTel gen_ai semconv, OpenInference, W3C Trace
Context.

### H2 — Create `packages/cloudgrid-harness-adapter` (TypeScript, ESM, Bun)

**Files to create:**

```
packages/cloudgrid-harness-adapter/
├── package.json                      # bun, ESM, name @cloudgrid/harness-adapter
├── tsconfig.json
├── README.md
├── src/
│   ├── server.ts                     # Hono routes wiring
│   ├── routes/
│   │   ├── run.ts                    # POST /v1/run
│   │   ├── optimize.ts               # POST /v1/optimize (NDJSON stream)
│   │   ├── score.ts                  # POST /v1/score
│   │   ├── health.ts                 # GET /healthz
│   │   └── agents.ts                 # GET /v1/agents
│   ├── scorers/
│   │   ├── deterministic.ts          # regex / json-schema / contains / attr-eq
│   │   ├── autoevals.ts              # wrap `autoevals` package
│   │   └── llm-judge.ts              # G-Eval-style
│   ├── workflows/
│   │   ├── bootstrap-fewshot.ts      # wraps AxBootstrapFewShot
│   │   └── critic-mutate-judge-pick.ts
│   ├── otel.ts                       # OTLP exporter + traceparent propagation
│   ├── harness.ts                    # session builder, agent/workflow registry
│   └── contracts.ts                  # Zod schemas for HTTP surface
└── tests/
    ├── run.spec.ts
    ├── score.spec.ts
    ├── optimize.spec.ts              # mock harness + autoevals
    └── fixtures/
        ├── golden-trace.json         # canonical OTel trace from H1
        └── 20-item-dataset.json
```

**Dependencies** (npm):

- `@purista/harness` — the runtime we wrap.
- `@purista/harness-openai` (and/or others) — provider adapters used by
  the example agents.
- `autoevals` — RAG and LLM-judge scorers.
- `@ax-llm/ax` — `AxBootstrapFewShot` only (do **not** depend on its
  MIPROv2 path).
- `hono` — the HTTP server.
- `zod` — runtime validation at the HTTP boundary.
- `zod-to-json-schema` — generate JSON Schemas for `packages/go-contracts/`.
- `@opentelemetry/sdk-node` — OTLP exporter.
- `@opentelemetry/api` — context propagation.

Zero Python in the package — `node_modules` audit must show no
transitive `python` / `optuna` dependency.

#### `/v1/run` wiring

```ts
// src/routes/run.ts (sketch)
import { contracts } from "../contracts.js";
import { resolveAgent } from "../harness.js";

export const runRoute = async (c) => {
  const body = contracts.RunRequest.parse(await c.req.json());
  const ctx = propagation.extract(context.active(), c.req.header());
  return await context.with(ctx, async () => {
    const agent = resolveAgent(body.solver);
    const out = await agent.generate(body.input, {
      metadata: body.metadata,
    });
    return c.json({
      harnessRunId: out.runId,
      output: out.output,
      tokenTotals: out.tokenTotals,
    });
  });
};
```

#### `/v1/score` wiring

Wraps `autoevals` for `Factuality`, `ContextRecall`, `AnswerCorrectness`,
`ContextPrecision`. Adds a thin G-Eval LLM-judge implementation that
calls a harness `JudgeAgent` configured by the operator.

Deterministic scorers run locally without calling harness:

- `regex` — pattern match against `target.output`.
- `json-schema` — Draft 2020-12 validation.
- `contains` — substring with optional case-insensitive flag.
- `attribute-equality` — equality on a JSONPath into `target.output`.

All return `{ score: number, passed: boolean, evidence?: unknown }`.

#### `/v1/optimize` wiring

Dispatches on `optimizerKind`:

- `bootstrap-fewshot` → calls `@ax-llm/ax`'s `AxBootstrapFewShot` over
  the dataset items fetched by `experimentRunId`. Outputs one
  candidate `PromptVersion` whose `metadata.demos[]` carries the
  selected demonstrations.
- `critic-mutate-judge-pick` → native PURISTA workflow in
  `workflows/critic-mutate-judge-pick.ts`. Each round: critic agent
  reviews failing items and proposes mutation directions; mutator agent
  applies them to produce N candidate prompts; each candidate is
  evaluated by `/v1/score` across the dataset; an Elo-style judge
  ranks them; top-K survive to the next round.

NDJSON stream: write one line per candidate as it completes; final line
is `{ event: "finished", winnerPromptVersionId: "..." }`. On HTTP/1.1
connection close, write `{ event: "cancelled" }` and clean up.

#### OTel setup (`src/otel.ts`)

Configure the SDK to:

```ts
const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT, // → cloudgrid collector
  }),
  resource: new Resource({
    "service.name": "cloudgrid-harness-adapter",
    "service.version": packageVersion,
  }),
});
sdk.start();
```

Read env vars set by `01-default-protocol.md`:

```
OTEL_SEMCONV_STABILITY_OPT_IN=gen_ai_latest_experimental
OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT=NO_CONTENT
PURISTA_TELEMETRY_FLAVOR=dual    # see harness/01-default-protocol.md §"Config knob"
```

The adapter wraps every harness call in a server span that picks up the
inbound `traceparent`, so spans nest under the cloudgrid runner's
parent trace.

**Standards touched**: OTLP/HTTP, W3C Trace Context, JSON Schema (via
Zod), `autoevals` library, OTel SemConv stability env var.

### H3 — Wire harness OTel emission through the adapter

Configure the embedded harness instance so:

1. `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` points at cloudgrid's collector.
2. `OTEL_SEMCONV_STABILITY_OPT_IN=gen_ai_latest_experimental` so we
   emit current `gen_ai.*` shape.
3. Content capture defaults to **NO_CONTENT** (per harness's own
   privacy-aware default and `01-default-protocol.md`). Operator opt-in
   via `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT` flips it.
4. `PURISTA_TELEMETRY_FLAVOR` defaults to `dual` so both `gen_ai.*` and
   OpenInference attributes appear on each LLM/tool/agent span. The
   adapter reads this and configures harness's exporter accordingly.

### H4 — Tests + exit criteria

**Unit tests** (Bun):

- Each scorer kind produces `{score, passed}` on a fixture for input.
- Contract tests for `/v1/run` / `/v1/score` / `/v1/optimize` request
  and response shapes parse cleanly through their Zod schemas.

**Integration tests** (Bun + local OTLP receiver):

- `POST /v1/run` returns a validated output and the OTLP receiver
  observes the full agent → tool → model span tree, parent-child
  intact, attached to the inbound `traceparent`.
- `POST /v1/score` for each shipped scorer kind produces a usable score
  on a known-good fixture.
- `POST /v1/optimize` with `optimizerKind: "bootstrap-fewshot"`
  produces at least one candidate `PromptVersion` from the 20-item
  dataset in `tests/fixtures/` within 60 s on a default OpenAI account.

**Hard exit criteria:**

- **Zero Python processes** in the container's process tree at runtime.
  Spawn-tracing test asserts this.
- Container image `< 250 MB`. `node_modules` audit shows no transitive
  Python / Optuna dependency.
- All spans emitted by the adapter nest under the inbound `traceparent`
  — assert via OTel test exporter that no span has no parent except
  the root.

## 3. Definition of done

| Component | Done when |
| --- | --- |
| Default-protocol changes in `puristajs/harness` (six items in `01-default-protocol.md`) | Property-based test asserts paired `gen_ai.*` and OpenInference values are equal for any internal `TelemetryRecord`. `PURISTA_TELEMETRY_FLAVOR` config knob shipped with `dual` default. |
| `cloudgrid-harness-adapter` v1 | `/v1/run`, `/v1/score`, `/v1/optimize` all green on the 20-item fixture dataset, zero Python in the image, all spans nest under the inbound `traceparent`. |

## 4. Anti-patterns — refuse in review

- Adding any Python process or `optuna` dependency.
- Calling into cloudgrid's NATS bridge or GraphQL from the adapter.
  The adapter is *called by* cloudgrid; it never calls cloudgrid.
- Adding a wire format unique to the adapter. The adapter speaks OTLP
  upstream and the HTTP contract from `../shared/03-handshake.md` §2
  downstream — nothing else.
- Embedding model-provider credentials in the adapter's config schema.
  Credentials live in the operator's harness config; the adapter reads
  them transitively through harness.
- Importing `MIPROv2` from `@ax-llm/ax`. Only `AxBootstrapFewShot` is
  in scope (MIPROv2 forces a Python service).

## 5. References

- `01-default-protocol.md` — harness-side protocol changes.
- `../shared/01-landscape.md`
- `../shared/02-protocol-interop.md`
- `../shared/03-handshake.md` — the HTTP contract.
- `../cloudgrid/02-implementation.md` — what consumes this adapter.
- [puristajs/harness — architecture](https://github.com/puristajs/harness/blob/main/docs/concepts/architecture.md)
- [ax-llm/ax — OPTIMIZE.md (`AxBootstrapFewShot`)](https://github.com/ax-llm/ax/blob/main/docs/OPTIMIZE.md)
- [autoevals on npm](https://www.npmjs.com/package/autoevals)
- [Hono](https://hono.dev/)
- [OTel Node SDK](https://opentelemetry.io/docs/languages/js/)
