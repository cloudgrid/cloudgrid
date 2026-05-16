---
id: PROP-AIEVAL-RES-001
title: AI agent observability, evaluation, and optimization — landscape
layer: proposal
status: research-only
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-10
provenance: from-user
---

# AI Agent Observability, Evaluation, and Optimization — Landscape (May 2026)

## 1. Executive Summary

CloudGrid sits at the OTel-collector end of an observability stack. The most
useful AI-specific functionality lives one layer up: **evaluating and
improving** agents whose runtime behavior is already captured as OTel traces.
This research surveys the prior art so cloudgrid's AI module copies the parts
that have stabilized and avoids the parts that re-implement what cloudgrid
already does well.

Three operational pillars define this space:

- **Observe** — capture every model call, tool call, retrieval, and agent step
  with enough fidelity to reconstruct what happened.
- **Evaluate** — score traces (or replays) against deterministic rules, RAG
  metrics, LLM-judges, or human review; track scores over time and catch
  regressions before deploy.
- **Optimize** — turn graded traces into datasets, datasets into experiments,
  and experiment results into improved prompts/agents/tool-policies.

The state of the art has converged on a few patterns:

1. **OTel is winning the wire format.** Every serious OSS platform is either
   OTel-native today (Langfuse v4, Phoenix, Laminar) or has moved that way
   (LangSmith, Weave). The OTel `gen_ai.*` semantic conventions are still in
   "Development" status at semconv 1.41.0, so practical interop currently
   relies on either OpenInference (Arize) or `gen_ai.*` plus an opt-in
   environment variable. CloudGrid should ingest both.
2. **Data layer matters more than dashboards.** The platforms that win on
   self-host (Langfuse, Phoenix, Laminar) all use a column store
   (ClickHouse) plus blob/object storage for large payloads. Cloudgrid's
   SurrealDB-only MVP is a workable starting point but needs a clear story
   for how AI-eval volumes scale.
3. **Closed-loop improvement is the differentiator.** Tracing is largely
   commoditised. The lasting value is in the **dataset → experiment →
   regression-gate** loop, ideally with optimization (DSPy / TextGrad)
   plugged in. This is where `puristajs/harness` fits: as the runtime that
   replays datasets and runs optimization passes inside cloudgrid's trust
   boundary.

## 2. Wire-format and semantic conventions

### 2.1 OTel GenAI semantic conventions

OpenTelemetry's gen-ai semconv is in **Development** status as of semconv
release 1.41.0 (May 2026). Existing instrumentations that emit `v1.36.0` or
prior keep emitting that by default; new behavior is gated by
`OTEL_SEMCONV_STABILITY_OPT_IN=gen_ai_latest_experimental`. ([OTel](https://opentelemetry.io/docs/specs/semconv/gen-ai/))

Two span families:

| Family | Purpose | Operation names |
| --- | --- | --- |
| Model spans | A single model call | `chat`, `text_completion`, `embeddings`, `generate_content` |
| Agent / framework spans | Higher-level agentic operations | `invoke_agent`, `create_agent`, `execute_tool` |

Provider-specific extensions exist for OpenAI, Anthropic, AWS Bedrock, and
Azure AI Inference. There is also a Model Context Protocol (MCP) semantic
convention for tool spans served over MCP. ([OTel gen-ai](https://opentelemetry.io/docs/specs/semconv/gen-ai/), [OTel MCP](https://opentelemetry.io/docs/specs/semconv/gen-ai/mcp/))

Key attributes worth pinning down for cloudgrid:

- `gen_ai.operation.name` — discriminator. Drives the AI-domain mapping below.
- `gen_ai.system` (legacy) / `gen_ai.provider.name` — provider flavor.
- `gen_ai.request.model`, `gen_ai.response.model` — versioning anchor.
- `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens` — cost driver.
- `gen_ai.agent.id`, `gen_ai.agent.name`, `gen_ai.agent.version` — agent
  identity.
- Prompt and completion bodies live in **events** (input/output events), not
  attributes. Cloudgrid's collector must preserve span events; its storage
  schema currently does (ENT-004 SpanEvent).

### 2.2 OpenInference (Arize)

OpenInference is a complementary set of conventions that pre-dates the OTel
gen-ai work and is still the de-facto wire format for many SDKs. It defines
ten span kinds — `CHAIN`, `LLM`, `TOOL`, `RETRIEVER`, `EMBEDDING`, `AGENT`,
`RERANKER`, `GUARDRAIL`, `EVALUATOR`, `PROMPT` — using dot-separated
namespaces (`llm.input_messages`, `llm.token_count.prompt`, `tool.parameters`,
etc.). ([OpenInference](https://arize-ai.github.io/openinference/spec/semantic_conventions.html))

Practical implication: any AI-aware ingest path in cloudgrid must accept both
`gen_ai.*` and OpenInference attributes and normalize them onto one internal
shape. Phoenix/Laminar/Langfuse all do this. Adopting only one will lock out
significant SDK populations.

### 2.3 Harness OTel emission

`puristajs/harness` (v1.0.0, May 2026, Apache-2.0) emits OTel spans tied to
its run-event lifecycle: `run.started`, `agent.started`, `tool.started`,
`tool.finished`, `agent.finished`, `run.finished`. The example
`examples/living-wiki-jaeger` ships a Jaeger backend showing spans flowing
through. By default the harness avoids full content capture; it must be
explicitly opted in for diagnostics. ([Harness architecture](https://github.com/puristajs/harness/blob/main/docs/concepts/architecture.md))

This matters for cloudgrid: harness is already an OTel producer that knows
about agents, workflows, and tools, so cloudgrid's AI module does not need a
custom SDK to integrate it.

## 3. OSS LLM-observability platforms

### 3.1 Langfuse (v4)

- License: MIT.
- Storage: ClickHouse (traces, observations, scores) + Redis/Valkey (queue
  + cache) + S3/blob (raw events, large payloads). Web container writes events
  to S3 immediately and queues only a reference.
- OTel: native. v4 implements the OTel SpanExporter interface; ingest endpoint
  `/api/public/otel`.
- Features: traces, datasets, evaluations (including LLM-as-judge),
  prompt management with playground, scoring, dashboards.
- Self-host: Helm chart, production-supported.
- Verdict: the broadest open-source feature footprint. Cloudgrid does not need
  to copy its UI verbatim, but the **data model** (trace → observation →
  score → dataset item → run) is a good anchor.

[Langfuse on GitHub](https://github.com/langfuse/langfuse) · [Langfuse OTel](https://langfuse.com/integrations/native/opentelemetry) · [Self-host docs](https://langfuse.com/self-hosting)

### 3.2 Arize Phoenix

- License: Elastic License 2.0 (open core, source available).
- OTel: native via OpenInference instrumentation. Works with any
  OTel-compatible backend.
- Features: tracing, datasets, experiments (run a dataset through a different
  prompt/model and diff), LLM-as-judge with relevance/toxicity scorers, human
  annotation.
- Notable strength: mature framework support (OpenAI Agents SDK, Claude Agent
  SDK, LangGraph, Vercel AI SDK, Mastra, CrewAI, LlamaIndex, DSPy, etc.).
- Verdict: the closest reference for an OTel-native AI observability layer.
  Its **dataset/experiment model** is cleaner than Langfuse's for offline
  comparison and is the pattern cloudgrid should mirror.

[Phoenix on GitHub](https://github.com/Arize-ai/phoenix) · [OpenInference](https://github.com/Arize-ai/openinference)

### 3.3 Helicone

- License: Apache 2.0.
- Architecture: Cloudflare Workers + ClickHouse + Kafka. Proxy-based primary
  ingest path (gateway sits in front of model providers); SDK ingest also
  supported.
- 2026 caveat: **Mintlify acquired Helicone in March 2026 and the cloud
  product is in maintenance mode.** Open source self-host still works but new
  feature development on the SaaS has stopped.
- Verdict: useful as a reference for proxy-based ingest if cloudgrid ever
  wants to capture provider-side data, but not a long-term roadmap anchor.

[Helicone on GitHub](https://github.com/Helicone/helicone)

### 3.4 Laminar (lmnr-ai)

- License: Apache 2.0.
- OTel: native, accepts AI-SDK telemetry.
- Differentiator: **agent-conversation-first.** Where Langfuse organises
  around observations, Laminar organises around the agent conversation and
  the spans that produced it. Default trace view is a transcript.
- Self-host: one-command Helm chart, all features in OSS image.
- Features: SQL access to traces/metrics/events, evaluation SDK + CLI,
  custom data rendering, dataset annotation.
- Verdict: the strongest UX prior art for **long-running agent traces** —
  exactly what cloudgrid's existing trace UI is weakest at. The transcript
  view is a feature cloudgrid should adapt rather than re-invent.

[Laminar on GitHub](https://github.com/lmnr-ai/lmnr)

### 3.5 OpenLLMetry (Traceloop)

- License: Apache 2.0.
- Not a platform — an instrumentation library set. Provides OTel
  instrumentations for LLM SDKs (OpenAI, Anthropic, Cohere, Bedrock, etc.),
  vector DBs (Pinecone, etc.), and frameworks (LangChain, Haystack, …) in
  Python and JS.
- Verdict: **valuable supply-side lever.** Cloudgrid does not need to ship
  its own SDK; recommending OpenLLMetry plus harness covers the majority of
  TS/Python apps.

[OpenLLMetry on GitHub](https://github.com/traceloop/openllmetry)

## 4. Eval frameworks

### 4.1 Ragas

- Focus: RAG evaluation, reference-free.
- Core metrics: faithfulness, answer relevancy, context precision, context
  recall.
- Verdict: import its metric definitions when building cloudgrid's
  built-in scorers for retrieval-heavy agents. Lightweight to adopt.

[Ragas](https://docs.ragas.io/en/stable/concepts/metrics/available_metrics/) · [Original paper](https://arxiv.org/abs/2309.15217)

### 4.2 DeepEval

- Focus: pytest-style LLM evaluation. 50+ ready metrics across LLM-as-judge,
  agent, tool-use, conversational, safety, RAG, multimodal.
- G-Eval pattern: LLM-as-judge with chain-of-thought and form-filling for
  arbitrary criteria.
- Verdict: G-Eval is the most useful import — a generalised LLM-judge metric
  pattern cloudgrid can offer as a built-in scorer family alongside
  deterministic and Ragas-style scorers.

[DeepEval on GitHub](https://github.com/confident-ai/deepeval) · [G-Eval docs](https://deepeval.com/docs/metrics-llm-evals)

### 4.3 Promptfoo

- License: MIT (still open source after OpenAI acquisition in March 2026).
- YAML config + CLI + CI integration.
- Strong red-team / security posture: 50+ attack plugins, OWASP LLM Top 10,
  NIST AI RMF, MITRE ATLAS coverage.
- Verdict: pattern-import for **CI gating**. Cloudgrid's eval module should
  output a deterministic CLI exit code and a machine-readable result file
  consumable by GitHub Actions. Promptfoo's YAML schema is a useful reference.

[Promptfoo on GitHub](https://github.com/promptfoo/promptfoo)

### 4.4 Inspect AI

- License: MIT. From UK AI Security Institute.
- Primitives: `dataset → Task → Solver → Scorer`. Multi-turn agent workflows,
  sandboxed execution (Docker built-in, Kubernetes/Proxmox optional).
- 200+ pre-built evaluations.
- Verdict: best mental model for **task definition.** Cloudgrid's harness-
  driven runs should adopt similar separation — a `Task` is a dataset bound
  to a solver (the harness agent/workflow under test) and one or more
  scorers.

[Inspect AI](https://inspect.aisi.org.uk/) · [GitHub](https://github.com/UKGovernmentBEIS/inspect_ai)

### 4.5 OpenAI Evals

- License: MIT.
- Format: YAML config, JSONL data, Python or LLM graders, registry of
  ready-made evals. 17.6k stars on GitHub as of January 2026.
- Verdict: dataset/grader file format is well-trodden; cloudgrid's eval files
  should be **interoperable with both Promptfoo and OpenAI Evals JSONL** so
  teams can re-use existing eval suites.

[OpenAI Evals on GitHub](https://github.com/openai/evals)

## 5. Agent-specific platforms

### 5.1 LangSmith

- Closed source. Tightly coupled to LangChain/LangGraph but has SDKs for
  Python, TypeScript, Go, and Java. Now also accepts OTel pipelines.
- Strengths: tracing, datasets, evaluations, prompt hub, annotation UI for
  human feedback, "Insights Agent" that summarises usage patterns.
- Verdict: feature reference, not architectural reference. Cloudgrid should
  match its **annotation UI** ergonomics for trace → dataset promotion.

[LangSmith](https://www.langchain.com/langsmith-platform)

### 5.2 AgentOps

- SaaS + open-source SDK.
- Differentiator: **session replay with time-travel** — rewind an agent's
  execution and identify where reasoning diverged. Recursive-thought-pattern
  detection (cycle/loop detection). Human-in-the-loop pause for high-stakes
  tool calls.
- Verdict: replay UX is the strongest in the market. Cloudgrid does not need
  to ship time-travel in v1, but the trace UI should keep step-by-step
  navigation in mind so it can be added.

[AgentOps](https://www.agentops.ai/)

### 5.3 Braintrust

- Closed source.
- Hybrid deployment: Braintrust runs control plane (UI, metadata, auth);
  customer runs data plane (traces, datasets, prompts, eval results) inside
  their own AWS/GCP/Azure VPC. Data does not leave customer infrastructure.
- Verdict: the deployment model is cloudgrid's natural target — cloudgrid is
  effectively the data plane already. Worth borrowing the language of
  "control vs data plane" for documentation.

[Braintrust](https://www.braintrust.dev/)

### 5.4 W&B Weave

- Closed source platform; Apache-2.0 SDK.
- Calls map roughly to OTel spans. Partial OTel support (not full
  compliance).
- Strong eval framework if a team is already on W&B.
- Verdict: not a primary reference; useful only as evidence that ML-platform
  vendors are moving toward OTel even when they started elsewhere.

[Weave on GitHub](https://github.com/wandb/weave)

## 6. Optimization frameworks

> **TypeScript-only constraint.** Cloudgrid is a TypeScript + Go project.
> Adding a Python runtime to ship cloudgrid is out of scope. Frameworks below
> are evaluated in two groups: rejected (Python-only) and viable (TS-native
> or implementable as a harness workflow).

### 6.1 DSPy / MIPROv2 — rejected (Python-only)

- DSPy ("framework for programming, not prompting") with MIPROv2 optimizer.
- Algorithm summary kept as a reference target:
  1. Bootstrap traces by running the program; keep only traces from
     high-scoring trajectories.
  2. Grounded proposal: feed program code + data + bootstrap traces to a
     proposer LLM that drafts candidate instructions for each predictor.
  3. Bayesian search (Optuna) over instruction × demo combinations on
     validation set.
- Verdict: **rejected**. Pure Python; MIPROv2 specifically depends on Optuna
  Bayesian search. The TypeScript port `ax-llm/ax` (see §6.4) re-uses the
  same Python service for MIPROv2, so adopting MIPROv2 in any form pulls
  Python into the deployment.

[DSPy MIPROv2](https://dspy.ai/api/optimizers/MIPROv2/) · [DSPy on GitHub](https://github.com/stanfordnlp/dspy)

### 6.2 TextGrad — rejected (Python-only)

- "Automatic differentiation via text" — LLMs produce natural-language
  gradients to update prompts and other text variables. PyTorch-like API.
- No maintained TypeScript port as of May 2026.
- Verdict: **rejected** for direct use. The textual-gradient *idea* (have
  an LLM critique an output and propose an edit, then apply that edit
  upstream) is reproducible in TypeScript inside a harness workflow without
  the PyTorch-style autograd machinery. Useful as inspiration only.

[TextGrad on GitHub](https://github.com/zou-group/textgrad) · [Paper](https://arxiv.org/abs/2406.07496)

### 6.3 Recent research (algorithms, not frameworks)

The following lines of work are framework-agnostic and reproducible directly
inside a harness workflow without any Python dependency:

- **Evolutionary prompt search with LLM judges** — decompose evolution into
  mutate / crossover / select; use LLM judge to filter mutants.
  ([2511.05120](https://arxiv.org/abs/2511.05120))
- **Tournament / Elo-rated debate selection** — DEEVO and similar.
  ([2506.00178](https://arxiv.org/html/2506.00178v2))
- **Auto-improving Critic → Judge → Evolve → Pick loops** — a simple
  pattern that gets most of the win without exotic optimizers.
  ([Auto-improving prompts in TS — Hà Đoàn](https://hadoan.medium.com/auto-improving-prompts-with-an-llm-typescript-real-example-1889328e7b77))

These are the algorithmic primitives cloudgrid's optimize pillar should
implement, not full DSPy/TextGrad parity.

### 6.4 TypeScript-native optimization stack (recommended)

| Component | Pick | Why |
| --- | --- | --- |
| Few-shot demo bootstrapping | **`ax-llm/ax` `AxBootstrapFewShot`** | Pure TypeScript optimizer that filters successful traces into demonstrations. No Python required. Sibling `MiPROv2` does need Python — explicitly opt out. |
| Candidate-generation loop | **harness workflow** (`Critic → Mutate → Judge → Pick`) | Implementable as a PURISTA workflow: a workflow-level `Optimizer` that takes `(dataset, scorer, basePrompt)`, generates N candidate prompts via an instruction-rewrite agent, evaluates each across the dataset using the configured scorers, and returns ranked candidates. No new runtime. |
| Evolutionary / tournament search | **harness workflow** (custom) | Same pattern, with mutate + crossover steps and Elo-style selection. Directly maps to PURISTA workflow primitives (sequence, branch, fan out). |
| Type-safe prompt definitions | **`ax-llm/ax` Signature** *or* **BAML** *(optional)* | Either can replace ad-hoc prompt strings with typed I/O. Adoption is per-agent, not per-cloudgrid. |

Recommended path: implement an `Optimizer` workflow in harness that produces
one or more candidate `PromptVersion` records plus an `ExperimentRun` with
their scoreboard. Cloudgrid's `ai-eval-runner` does not know about
optimization specifics — it just starts the workflow and persists results.
This contains all algorithm choice inside harness, where it belongs.

[ax-llm/ax repository](https://github.com/ax-llm/ax) · [ax-llm AxBootstrapFewShot docs](https://github.com/ax-llm/ax/blob/main/docs/OPTIMIZE.md) · [BAML](https://github.com/BoundaryML/baml)

### 6.5 Closed-loop production patterns (2026 consensus)

A consistent pattern emerges across LangChain, Microsoft, and academic 2026
write-ups:

1. Run agents in production, capture all traces.
2. Filter traces into annotation queues based on: low automated score,
   thumbs-down user feedback, errors, abandoned tasks.
3. Human reviewers (or LLM-judges) label correct outputs → those become
   gold examples.
4. Each labelled failure becomes a permanent eval case ("regression as
   eval").
5. Every prompt change, model swap, or workflow modification runs the full
   accumulated suite before deploy.
6. (Optional) Optimisation passes (DSPy/TextGrad) run on the curated
   dataset and propose new prompts; humans approve.

This is the loop cloudgrid's AI module should make first-class.

[LangChain agent improvement loop](https://www.langchain.com/blog/traces-start-agent-improvement-loop) · [Microsoft AI agents in production](https://microsoft.github.io/ai-agents-for-beginners/10-ai-agents-production/)

## 7. Comparison matrix

Legend: ✅ first-class · ◐ partial · ❌ absent · — not applicable.

### 7.1 Observe pillar

| Tool | OSS | OTel ingest | OpenInference | Agent-aware UI | Cost / token UI | Long-running agent UX |
| --- | --- | --- | --- | --- | --- | --- |
| Langfuse | ✅ MIT | ✅ native | ✅ | ◐ | ✅ | ◐ |
| Phoenix | ◐ ELv2 | ✅ native | ✅ source | ✅ | ✅ | ◐ |
| Helicone | ✅ Apache-2 | ◐ | ◐ | ◐ | ✅ | ❌ |
| Laminar | ✅ Apache-2 | ✅ native | ✅ | ✅ | ✅ | ✅ transcript |
| OpenLLMetry | ✅ Apache-2 | ✅ producer | ✅ | — | — | — |
| LangSmith | ❌ | ✅ | ◐ | ✅ | ✅ | ✅ |
| AgentOps | ◐ SDK | ◐ | ◐ | ✅ replay | ✅ | ✅ |
| Braintrust | ❌ | ✅ | ◐ | ✅ | ✅ | ◐ |
| Weave | ◐ SDK | ◐ partial | ◐ | ✅ | ✅ | ◐ |
| **Cloudgrid (today)** | ✅ | ✅ traces+logs | preserved as attrs | ❌ | ❌ | ❌ |

### 7.2 Evaluate pillar

| Tool | Datasets | Built-in scorers | LLM-as-judge | Human annotation | RAG metrics | CI gate |
| --- | --- | --- | --- | --- | --- | --- |
| Langfuse | ✅ | ◐ | ✅ | ✅ | ◐ | ◐ |
| Phoenix | ✅ | ✅ | ✅ | ✅ | ✅ | ◐ |
| Laminar | ✅ | ◐ | ✅ | ✅ | ◐ | ✅ CLI |
| Ragas | dataset-as-input | ✅ RAG | ✅ | ❌ | ✅ | ◐ |
| DeepEval | ✅ | ✅ 50+ | ✅ G-Eval | ❌ | ✅ | ✅ pytest |
| Promptfoo | ✅ | ✅ | ✅ | ❌ | ◐ | ✅ |
| Inspect AI | ✅ | ✅ | ✅ | ❌ | ◐ | ✅ |
| OpenAI Evals | ✅ JSONL | ✅ | ✅ | ❌ | ◐ | ✅ |
| LangSmith | ✅ | ✅ | ✅ | ✅ | ◐ | ✅ |
| Braintrust | ✅ | ✅ | ✅ | ✅ | ◐ | ✅ |
| **Cloudgrid (today)** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

### 7.3 Optimize pillar

| Tool | Replay traces | Experiments / A-B | Prompt versioning | Auto-prompt-opt | Regression detection |
| --- | --- | --- | --- | --- | --- |
| Langfuse | ◐ | ✅ | ✅ | ❌ | ◐ |
| Phoenix | ✅ | ✅ | ◐ | ❌ (DSPy adjacent) | ✅ |
| Laminar | ✅ | ✅ | ◐ | ❌ | ✅ |
| LangSmith | ✅ | ✅ | ✅ Prompt Hub | ❌ | ✅ |
| Braintrust | ✅ | ✅ | ✅ | ❌ | ✅ |
| AgentOps | ✅ replay | ◐ | ❌ | ❌ | ◐ |
| DSPy | dataset-driven | — | program-level | ✅ MIPROv2 | — |
| TextGrad | dataset-driven | — | ◐ | ✅ | — |
| ax-llm `AxBootstrapFewShot` (TS) | dataset-driven | — | ◐ | ◐ few-shot | — |
| ax-llm MIPROv2 (TS + Py service) | dataset-driven | — | program-level | ✅ | — |
| **Cloudgrid (today)** | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Cloudgrid AI module (proposed)** | ✅ via harness | ✅ | ✅ | ✅ via harness workflow | ✅ |

**Note on Python-only rows.** DSPy, TextGrad, and ax-llm MIPROv2 are listed
for completeness only. Cloudgrid's TypeScript-only constraint excludes them
from the implementation set; only ax-llm `AxBootstrapFewShot` and harness
workflow patterns are eligible (see §6.4).

## 8. Feature taxonomy for the cloudgrid AI module

The minimum-viable feature set, distilled from the matrix above, grouped by
pillar.

### 8.1 Observe (incremental on top of cloudgrid core)

- **AI-attribute extraction** at ingest: recognise both `gen_ai.*` and
  OpenInference attribute namespaces and project them onto canonical AI
  domain entities (see spec proposal).
- **Operation taxonomy** mapping span → one of: model call (`chat` /
  `embeddings` / etc.), tool call (`execute_tool`), agent step
  (`invoke_agent`), retrieval, evaluator, guardrail.
- **Run-level grouping**: group spans that belong to the same agent run
  using `gen_ai.agent.id` plus a session/run identifier surfaced by the
  emitter (harness uses run-events for this).
- **Token + cost panel** per span and aggregated per run / per agent.
- **Conversation transcript view** for long agent runs (Laminar pattern) —
  alternative presentation of the existing waterfall.
- **Tool I/O viewer**: structured rendering of `tool.parameters` and
  `tool.result`.

### 8.2 Evaluate

- **Datasets** as a first-class entity with versioned items
  (`{input, expected, metadata}`). Promotable from any persisted span/trace.
- **Scorers** as a registry: deterministic (regex, JSON-schema match,
  contains), RAG (Ragas-style: faithfulness, answer relevancy, context
  precision/recall), LLM-judge (G-Eval-style with custom criteria), human.
- **Online evaluation**: scorers can run against live persisted traces in
  storage-read; results persist as `EvalResult` records linked to the span.
- **Offline evaluation runs**: a dataset × solver × scorers tuple, executed
  by the harness, producing comparable scoreboards.
- **Annotation queue**: a queue of traces routed for human review based on
  filter rules (low score, thumbs-down, error). Annotations promote to
  dataset items.
- **Regression gating**: CLI-friendly run mode with non-zero exit on score
  drop versus a baseline run; emits a JUnit-style result file.

### 8.3 Optimize

- **Experiments**: any number of runs against the same dataset, comparable
  side-by-side. Each run pinned to a `solverVersion` (a harness
  agent/workflow at a known git revision + prompt hash).
- **Prompt version model**: prompt text + variables, addressable by hash
  + tag; harness consumes by tag at run time.
- **Optimization run**: an experiment whose solver is a harness *optimizer
  workflow* — TypeScript-only, never invokes Python. v1 implementation
  uses `ax-llm/ax` `AxBootstrapFewShot` for few-shot demo bootstrapping
  and a harness-defined `Critic → Mutate → Judge → Pick` workflow for
  instruction rewriting. Output is one or more candidate `PromptVersion`
  records plus their evaluation scoreboard. Promotion is gated by an
  explicit human action.
- **Trace replay**: re-run the harness with the original input from a
  persisted trace, optionally with a different solver version, recording
  the new run as a child of the original for diffing.

### 8.4 TypeScript-native scorer libraries

Cloudgrid does not need to implement its scorer library from scratch. The
following TS-native libraries are usable inside a harness workflow without
any Python dependency:

| Library | License | Useful for cloudgrid |
| --- | --- | --- |
| **`autoevals`** (Braintrust) | MIT (npm) | Drop-in TypeScript scorers including `Factuality`, `ContextRecall`, `AnswerCorrectness`, `ContextPrecision`, plus an LLM-judge scaffold. RAG metrics ready out of the box. ([npm](https://www.npmjs.com/package/autoevals)) |
| **`@mastra/evals`** | Apache-2.0 | Built-in scorers for correctness, faithfulness-to-context, tone, safety. Normalised 0–1 score interface that cloudgrid's `Scorer` registry can adopt verbatim. |
| **`evalite`** | MIT | Vitest-native eval runner for developer-side eval-as-code. Useful as the local-dev counterpart to cloudgrid's server-side evaluation; not run inside cloudgrid services. |
| **`promptfoo`** | MIT | Already covered. Useful as a CI-side regression harness pointing at cloudgrid's stored datasets. |
| **`baml`** (Boundary) | Apache-2.0 | DSL with `@@assert` test cases. Optional adoption per-agent for type-safe prompt definitions; not required by cloudgrid. |

**Recommendation**: cloudgrid's built-in scorers wrap `autoevals` for RAG and
LLM-judge cases, and add cloudgrid-specific deterministic scorers
(JSON-schema match, regex, contains, attribute equality) on top. Mastra's
evals package is a useful interface reference but not a runtime dependency.

## 9. Cloudgrid-specific recommendations

These are direct conclusions for the spec proposal in `02-spec-proposal.md`.

1. **Stay OTel-native at ingest.** Do not invent a custom AI ingest path.
   Extend the existing `core/otlp-collector` with an AI-aware
   normalization step that produces canonical AI entities alongside the
   generic span/log entities. Both must be persisted; AI entities are a
   projection, not a replacement.
2. **Accept OpenInference and `gen_ai.*` simultaneously.** Map both onto the
   same internal shape. Document precedence rules when both are present
   (recommend: prefer `gen_ai.*` when present because it is the upstream
   standard; fall back to OpenInference; preserve unknown attributes
   verbatim, per ADR-0003).
3. **Honour the dumb-client / smart-backend invariant.** AI entities must
   be derived by storage-write (during persistence) or storage-read (during
   query), never in the BFF or frontend. The BFF must not aggregate AI
   metrics. This rules out a Langfuse-style "BFF derives observations from
   traces" approach.
4. **Ship the module as a separate domain, not a bolt-on UI.** Add
   `specs/01-domains/ai-eval.md` (proposed name) and let it depend on the
   existing observability-data domain. This keeps cloudgrid core minimal
   for non-AI users.
5. **Make the harness the only execution surface, and keep optimization
   inside it as a TypeScript workflow.** Cloudgrid never runs user prompts
   itself. Every solver execution — replay, experiment, optimization — is
   delegated to a configured harness instance. Optimization specifically is
   defined as a harness workflow (`Critic → Mutate → Judge → Pick`) plus
   `ax-llm/ax`'s pure-TS `AxBootstrapFewShot` for few-shot demos. **No
   Python sidecar.** Cloudgrid's `ai-eval-runner` does not understand
   optimization algorithms; it just starts the workflow and persists
   results.
6. **Evaluation runs are NATS commands, not HTTP endpoints.** A new
   `eval.run.start` request-reply subject (storage-read or a sibling
   eval-runner service) keeps the public API GraphQL-only and consistent
   with `specs/04-backend/telemetry-query-semantics.md`.
7. **Storage strategy: stay on SurrealDB for v1, but plan a columnar
   adapter.** AI eval volumes (every span re-scored online + dataset
   experiments) will outgrow SurrealDB faster than trace/log volumes.
   `specs/04-backend/telemetry-signal-roadmap.md` already anticipates
   sibling storage adapters; the AI eval spec should require the same
   sibling-adapter shape.
8. **Do not ship a model-provider proxy.** Helicone-style gateway behaviour
   is tempting but expands the trust boundary into request paths and
   secrets. Defer indefinitely; rely on harness or OpenLLMetry for
   provider-side capture.
9. **Independence of release cadence.** The module should ship from the
   same monorepo but as a separately deployable service set
   (`core/ai-eval-runner`, optional UI panels gated by feature flag) so
   cloudgrid users not running AI workloads can ignore it.

## 10. Risks and caveats

- **OTel gen-ai semconv is still in Development.** Plan for a flag-day
  re-mapping when it stabilises. ADR-0003 already covers this implicitly by
  preserving raw attributes — keep doing that.
- **Helicone is in maintenance mode.** Do not pattern-copy without checking
  the architecture is still maintained.
- **Promptfoo is now under OpenAI** (still MIT). Treat its file format as
  stable enough to interoperate with, but do not assume future direction
  remains community-driven.
- **TypeScript-only optimization is by design.** DSPy, TextGrad, and
  ax-llm's MIPROv2 all require Python. They are explicitly out of scope for
  cloudgrid's deployment surface (decision: 2026-05-10). The cost is
  giving up Bayesian instruction search; the equivalent is approximated
  with `AxBootstrapFewShot` plus a harness-defined `Critic → Mutate →
  Judge → Pick` workflow. If a future evaluation shows this gap matters in
  practice, revisit by adding a *call-out* to a hosted optimizer service
  rather than a local Python runtime.
- **LLM-as-judge is itself a model under evaluation.** Cloudgrid's scorers
  must be versioned and their judge models pinned, otherwise score drift
  will be confused with agent drift.
- **Content capture is privacy-sensitive.** Harness defaults to no full
  content; cloudgrid must offer the same default and a per-project opt-in,
  not the other way around. Align with `specs/06-nfr/security-local-mvp.md`
  before any UI work.
- **Cardinality of `gen_ai.request.model` and tool names is high.** Facet
  queries will need to push down with bounded cardinality (consistent with
  `specs/04-backend/telemetry-query-semantics.md`).

## Sources

- [OTel — Semantic conventions for generative AI systems](https://opentelemetry.io/docs/specs/semconv/gen-ai/)
- [OTel — GenAI agent and framework spans](https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-agent-spans/)
- [OTel — Generative client AI spans](https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-spans/)
- [OTel — MCP semantic conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/mcp/)
- [OpenInference semantic conventions](https://arize-ai.github.io/openinference/spec/semantic_conventions.html)
- [Langfuse repository](https://github.com/langfuse/langfuse)
- [Langfuse self-hosting](https://langfuse.com/self-hosting)
- [Langfuse OTel integration](https://langfuse.com/integrations/native/opentelemetry)
- [Arize Phoenix repository](https://github.com/Arize-ai/phoenix)
- [OpenInference repository](https://github.com/Arize-ai/openinference)
- [Helicone repository](https://github.com/Helicone/helicone)
- [Laminar repository](https://github.com/lmnr-ai/lmnr)
- [Laminar — top 6 agent observability platforms 2026](https://laminar.sh/article/2026-04-23-top-6-agent-observability-platforms)
- [OpenLLMetry repository](https://github.com/traceloop/openllmetry)
- [Ragas — available metrics](https://docs.ragas.io/en/stable/concepts/metrics/available_metrics/)
- [Ragas paper (arXiv 2309.15217)](https://arxiv.org/abs/2309.15217)
- [DeepEval repository](https://github.com/confident-ai/deepeval)
- [DeepEval — G-Eval docs](https://deepeval.com/docs/metrics-llm-evals)
- [Promptfoo repository](https://github.com/promptfoo/promptfoo)
- [Inspect AI](https://inspect.aisi.org.uk/)
- [Inspect AI repository](https://github.com/UKGovernmentBEIS/inspect_ai)
- [OpenAI Evals repository](https://github.com/openai/evals)
- [LangSmith platform](https://www.langchain.com/langsmith-platform)
- [LangChain — agent improvement loop](https://www.langchain.com/blog/traces-start-agent-improvement-loop)
- [AgentOps](https://www.agentops.ai/)
- [Braintrust](https://www.braintrust.dev/)
- [W&B Weave repository](https://github.com/wandb/weave)
- [DSPy MIPROv2 docs](https://dspy.ai/api/optimizers/MIPROv2/)
- [DSPy repository](https://github.com/stanfordnlp/dspy)
- [TextGrad repository](https://github.com/zou-group/textgrad)
- [TextGrad paper (arXiv 2406.07496)](https://arxiv.org/abs/2406.07496)
- [puristajs/harness repository](https://github.com/puristajs/harness)
- [puristajs/harness — architecture](https://github.com/puristajs/harness/blob/main/docs/concepts/architecture.md)
- [Microsoft — AI agents in production](https://microsoft.github.io/ai-agents-for-beginners/10-ai-agents-production/)
- [ax-llm/ax repository — TypeScript DSPy port](https://github.com/ax-llm/ax)
- [ax-llm/ax — OPTIMIZE.md](https://github.com/ax-llm/ax/blob/main/docs/OPTIMIZE.md)
- [ax-llm/ax — MiPRO docs (Python service required)](https://axllm.dev/mipro/)
- [BAML repository (BoundaryML)](https://github.com/BoundaryML/baml)
- [Mastra repository (TypeScript agent framework + evals)](https://github.com/mastra-ai/mastra)
- [Evalite repository (Matt Pocock)](https://github.com/mattpocock/evalite)
- [autoevals repository (Braintrust, MIT, npm)](https://github.com/braintrustdata/autoevals)
- [autoevals on npm](https://www.npmjs.com/package/autoevals)
- [Auto-improving prompts in TypeScript — pattern walkthrough](https://hadoan.medium.com/auto-improving-prompts-with-an-llm-typescript-real-example-1889328e7b77)
- [A Toolbox for Improving Evolutionary Prompt Search (arXiv 2511.05120)](https://arxiv.org/abs/2511.05120)
- [Tournament of Prompts / DEEVO (arXiv 2506.00178)](https://arxiv.org/html/2506.00178v2)
