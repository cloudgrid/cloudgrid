---
title: "Optimizations"
description: "Use evaluation results to explore candidates, validate improvements, and explicitly promote target changes."
order: 3
accent: violet
eyebrow: "Handbook - Evaluations"
updated: 2026-05-25
---

Optimization is the loop around dataset evaluation. It proposes changes, checks
them against examples, and records evidence so a team can decide whether to
promote a target.

## How Optimization Works

1. Start from an evaluation, run, or comparison.
2. Select the target to improve.
3. Review the objective: primary metric, tradeoffs, and constraints.
4. Run a quick-shot phase when useful.
5. Validate the best candidates with normal evaluation runs.
6. Compare baseline and candidate results.
7. Promote explicitly when validation evidence is strong enough.

Quick-shot results are exploratory. They are useful for pruning ideas, but they
are not final promotion evidence.

## Skill Optimization Runtime

Skill optimization works on a package, not a single pasted prompt. A package
contains `SKILL.md` plus optional references, examples, scripts, assets,
dependency manifests, runtime fixtures, and metadata. CloudGrid previews the
manifest and only editable text files participate in the optimization loop.

Choose the runtime mode from the setup flow:

| Mode | Use it when |
| --- | --- |
| Managed harness | The skill can run from dataset input, selected model/tool profiles, and CloudGrid-supported fixtures. |
| External adapter | The skill must run inside customer tools, MCP servers, repositories, files, workflow state, proprietary APIs, permissions, or business systems. |

Managed harness is the easy path. CloudGrid owns the evaluation runtime and OTLP
emission for skills that do not need customer-specific runtime context.

External adapter is the enterprise path. The adapter is a project-approved
profile or URL that receives dataset item input, target snapshot refs, candidate
skill package refs, run metadata, content policy, and W3C trace context. It
executes inside the customer environment and reports control progress through
the adapter API.

## Running The Examples

CloudGrid ships two skill optimization fixture packs under
`test_data/ai_eval/skill_optimization`.

The deterministic fixture is hermetic and uses the local harness. It exercises a
`skill_text_edit` run that rejects an edit to a protected runtime script, accepts
a validation-backed edit to `SKILL.md`, reads skill optimization detail, and
keeps promotion explicit:

```sh
bun run --cwd apps/packages/integration-scenarios test
bun tooling/scripts/integration-local.mjs
```

Automated integration tests never call real model providers. They use the
CloudGrid AI harness adapter so LLM-like behavior is predictable and assertions
are stable.

The `real-llm` fixture is manual test data only. It is provider-neutral and
contains no credentials. Use it when you want to run the same skill package and
dataset against a configured project provider outside the integration suite.
Configure provider credentials through normal project provider settings; do not
put secrets in fixture files.

## External Adapter Readiness

CloudGrid separates adapter control readiness from trace evidence readiness.
The adapter API is for control state: start accepted, async polling, terminal
status, cancellation, actual output or output refs, bounded problem details,
usage, cost, and timing. Optimizer step evidence comes from OTLP traces that are
correlated to the item run.

Before an external adapter can be used for optimization, the dry run should show
both readiness groups:

| Readiness group | What CloudGrid checks |
| --- | --- |
| HTTP control readiness | Adapter authentication, async polling, terminal output or output refs, cancellation, bounded problems, and usage/cost/timing metadata. |
| OTLP trace and evidence readiness | W3C Trace Context propagation, OTLP ingest, recognized semantic conventions, and a last dry-run trace link. |

For trace evidence, reuse production instrumentation wherever possible:

- preserve the incoming `traceparent` and `tracestate`, or return the produced
  root trace and span refs in the terminal control response;
- export traces through OTLP to the project collector;
- emit OTel GenAI semantic conventions for model calls when available;
- emit OTel MCP semantic conventions for MCP calls when available;
- keep existing OpenInference spans for AI, tool, and retriever work;
- keep ordinary production spans for HTTP, RPC, database, messaging,
  filesystem, service/resource, and exception behavior.

The adapter does not need a CloudGrid SDK. Standard telemetry is the default
integration path. Custom adapter attributes are optional extensions only when
standard semantic conventions or adapter control fields cannot express the same
fact.

Do not send secrets, bearer tokens, cookies, provider credentials, raw customer
files, or full environment dumps in spans, adapter responses, dataset rows, or
exported skill artifacts. Use artifact refs when the evaluation result needs to
point at files or generated outputs.

Common readiness failures are actionable:

| Failure | What to fix |
| --- | --- |
| Missing trace propagation | Forward the W3C trace context CloudGrid sends into the runtime and exported spans. |
| Missing terminal output | Return `actualOutput` for small results or an `actualOutputRef` for larger artifacts in the terminal adapter response. |
| Missing semantic coverage | Keep OTel GenAI, OTel MCP, OpenInference, or ordinary production spans around model, tool, retriever, and business calls. |
| Polling never reaches terminal state | Implement async status polling and cancellation for long-running executions. |

## What To Inspect

Before promotion, inspect:

- what changed in the candidate;
- metric deltas against the baseline;
- improved examples;
- regression examples;
- latency and cost tradeoffs;
- trace-backed row evidence;
- whether validation used the right split.

Promotion should be boring: the candidate, baseline, comparison, validation
runs, and notes are all visible before the user confirms.

## Good Optimization Inputs

Good inputs are concrete and reviewed:

- rows with clear expected outputs;
- reasons that explain ambiguous labels or fields;
- observed outputs from real failures;
- validation rows that represent the current quality bar;
- test rows held back for final confidence.

Avoid optimizing against unreviewed production samples. Put those rows in
`needs_review` first.

## Production Measurement

Production measurement is a future/advanced workflow, not the primary v1 path.
The hard part is usually not collecting the input and output; it is knowing what
the expected output or success indicator should be for that production point.

For now, use production telemetry mainly to create or review dataset candidates,
then run controlled dataset evaluations and optimizations.
