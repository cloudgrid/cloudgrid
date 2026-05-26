# Agentic Evaluation Research Notes

Date: 2026-05-23

Status: brainstorming, not implementation-ready spec

## Research Summary

Simple one-shot classification/extraction can be evaluated from input,
expected output, and actual output. Tool-using agents, skills, loops, and
workflows need more data. Final answer metrics are necessary but not
sufficient.

Sources reviewed:

- OpenAI agent eval guidance:
  https://developers.openai.com/api/docs/guides/agent-evals
- LangChain AgentEvals:
  https://docs.langchain.com/oss/python/langchain/test/evals
- Ragas agent/tool metrics:
  https://docs.ragas.io/en/stable/concepts/metrics/available_metrics/agents/
- DeepEval tool correctness:
  https://deepeval.com/docs/metrics-tool-correctness
- AgentBench:
  https://arxiv.org/abs/2308.03688
- tau-bench:
  https://huggingface.co/papers/2406.12045
- SWE-bench:
  https://arxiv.org/abs/2310.06770
- WorkArena:
  https://arxiv.org/abs/2403.07718
- TRAJECT-Bench:
  https://arxiv.org/abs/2510.04550
- Claude Agent Skills:
  https://docs.claude.com/en/docs/claude-code/skills
- SkillsBench:
  https://www.skillsbench.ai/

The consistent lesson: complex agent evals need a dataset record, a target
snapshot, execution trace evidence, and an outcome oracle. The dataset does not
need to store a full expected trajectory for every case, but it must be able to
store process expectations when they matter.

CloudGrid should treat trace evidence as a core evaluation primitive. Harness
already emits OpenTelemetry, so every dataset item run should link to the
trace/root span produced by that run. This is useful even for classification
and extraction, because the final answer may be correct while the path is too
expensive, unstable, over-retrieved, or dependent on irrelevant evidence.

## Evaluation Families

### One-Shot Classification

Input maps to one expected label/category.

Default metrics:

- exact label accuracy;
- per-label support;
- confusion matrix;
- optional precision/recall/F1;
- false-positive/false-negative examples.

### One-Shot Extraction

Input maps to structured expected JSON.

Default metrics:

- valid JSON rate;
- dataset schema validity rate;
- exact JSON equality when useful;
- per-field match rate;
- missing required fields;
- extra fields;
- type mismatches;
- field-level diffs.

### One-Shot Freeform Answering

Input maps to a text answer where exact equality is too strict.

Default metrics:

- normalized text similarity;
- exact/contains metrics when explicitly useful;
- optional semantic similarity;
- optional judge-style score with configured rubric.

The product should show multiple values and examples, not collapse the result
into one hidden judgment.

### Tool Use

Dataset expected JSON may include:

- final answer or output schema;
- available tool set or registry snapshot;
- required tools;
- forbidden tools;
- optional tools;
- expected argument constraints;
- order/dependency constraints;
- maximum tool calls;
- expected tool-output handling.

The run must capture:

- evaluation item trace ID and root span ID;
- bounded textual trajectory summary and evidence refs;
- every tool call;
- tool name/version;
- arguments;
- sanitized output or output digest;
- call order;
- parent step/span;
- retry/attempt index;
- error status;
- latency/cost.

Metrics:

- tool-call precision/recall/F1;
- required tool coverage;
- forbidden tool count;
- argument correctness;
- order/dependency satisfaction;
- duplicate/redundant tool-call count;
- final output metrics;
- latency/cost/tool-call count.

### Agentic Loops

Dataset expected JSON may include:

- expected final outcome;
- success criteria;
- required/forbidden milestones;
- max iterations;
- max retries;
- allowed handoffs;
- required evidence classes.

The run must capture:

- evaluation item trace ID and root span ID;
- bounded textual trajectory summary and evidence refs;
- step index;
- step kind: model, tool, retrieval, handoff, user-simulation, guardrail,
  verifier, final;
- step input and bounded/sanitized output or digest;
- state before/after when available;
- active skill/prompt/tool config;
- attempt/retry index;
- termination reason;
- final outcome;
- trace/span refs for every step.

Metrics:

- final outcome quality;
- task completion;
- required milestone coverage;
- forbidden milestone count;
- loop-limit violations;
- retry count;
- redundant step count;
- handoff correctness;
- recovery from tool/error observations;
- cost/latency/tokens per successful task.

### Workflows

Dataset expected JSON may include:

- workflow input;
- expected final output or final state;
- terminal status;
- phase/branch outcomes;
- allowed/forbidden branches;
- required events;
- environment initial state reference;
- expected environment final state or verifier reference.

The run must capture:

- evaluation item trace ID and root span ID;
- bounded textual trajectory summary and evidence refs;
- workflow version/snapshot;
- phase/step graph;
- branch decisions;
- agent/handoff boundaries;
- tool calls and observations;
- environment state deltas or verifier outputs;
- terminal state;
- trace/span refs.

Metrics:

- final state match;
- terminal status match;
- phase completion;
- required branch/step coverage;
- forbidden branch/step count;
- environment verifier result;
- error propagation/failing phase;
- per-phase cost and latency.

### Skills

Skills are neither only prompts nor only tools. They package instructions,
scripts, references, and workflow conventions that an agent may load
dynamically.

Dataset expected JSON may include:

- expected output or final state;
- required, optional, or forbidden skill use;
- expected artifacts produced by the skill;
- file type/schema/style/safety constraints;
- allowed tools.

The run must capture:

- evaluation item trace ID and root span ID;
- bounded textual trajectory summary and evidence refs;
- skill snapshot ID/version/digest;
- whether the skill was selected;
- when it was loaded;
- which resources/scripts were used;
- tool permissions granted;
- artifacts produced;
- script/resource errors;
- token/context cost from loading.

Metrics:

- task outcome quality with/without skill where comparable;
- skill activation precision/recall;
- artifact validity;
- instruction adherence;
- script/tool error rate;
- token/runtime overhead;
- transfer/generalization across related tasks.

Skill optimization is later than prompt optimization. It requires snapshotting
skill content/resources, comparing artifacts, and proving changes improve task
results without unsafe tool behavior or excessive context cost.

## Flow For Complex Evals

1. Create a dataset with `expectedType = json`.
2. Choose an evaluation family template.
3. Start from a suggested JSON Schema for expected output/process constraints.
4. Add rows with input, expected JSON, optional observed output, optional
   reason, split, and source pointers.
5. Run a dataset evaluation against a target snapshot.
6. Persist actual output plus trace-linked trajectory evidence.
7. Generate a bounded row trajectory summary from trace evidence.
8. Compute metrics from expected JSON plus run trajectory.
9. Show final outcome, process metrics, cost/latency, trajectory summary, and
   row-level evidence.
10. Allow `Optimize from this evaluation` only when target snapshots and allowed
   mutation dimensions are explicit.

## Recommendation

Use dataset-level JSON Schema as the unifying mechanism for expected outputs,
including tool, trajectory, workflow, and skill expectations.

Failure-derived examples are especially important for agentic evals. They let
users capture failed tool choices, wrong extraction, incomplete loops, unsafe
handoffs, bad workflow branches, or flawed skill use without turning the
observed value into ground truth. `observedOutput` records what happened;
`expected` remains the corrected oracle.

Do not reintroduce many row-level target shapes unless JSON Schema becomes
insufficient in real use.

Build order:

1. Classification.
2. Extraction.
3. Freeform answering.
4. Tool-use evaluation.
5. Agentic loop/trajectory evaluation.
6. Workflow evaluation.
7. Optimization beyond prompt/examples.

Optimization should start with prompt/example optimization. Add skill, tool,
and workflow optimization only after CloudGrid can snapshot, diff, compare, and
promote those target parts cleanly.

Optimization should also support explicit quick-shot/sample evaluations. An LLM
optimizer can inspect weak categories, failed fields, costly examples, or
representative clusters, propose a target change, and first evaluate only a
bounded subset. That subset must still be reproducible: record selected item
IDs, selection strategy, seed, dataset version, candidate target snapshot, and
metric settings. Full validation/test evaluation remains required for final
confidence.

Optimizers should consume row run information progressively. They should start
from aggregate metrics, failed/changed rows, and bounded trajectory summaries.
Only if needed should they inspect key steps or full trace/conversation refs.
This prevents optimization from becoming dependent on huge raw transcripts for
every row.
