# AI Eval Evaluation Model Brainstorm

Date: 2026-05-23

Status: brainstorming, not implementation-ready spec

## Product Direction

Evaluation should produce metrics, results, and comparisons. It should not own
gates. Alert rules, release gates, and promotion policies can consume
evaluation metrics later, but they are separate product surfaces.

This removes the need for user-facing `Scorers` or `Checks` in v1. If scorer
objects do not provide a clear internal benefit, remove them entirely instead
of hiding them behind new UI terms.

Preferred product concepts:

- `Datasets`: examples, expected outputs, reasons, splits, extraction settings.
- `Evaluations`: dataset runs, optimization attempts, metric summaries,
  per-row outputs, comparisons, and run history.
- `Production quality`: backlog for continuous production measurement.

Avoid primary product language such as scorer, check, gate, pass/fail as the
default outcome, and experiment as the first concept users must understand.

## Evaluation Lifecycle

`Dataset evaluation` is the reusable primitive.

`Optimization` is a reproducible workflow around dataset evaluations.

`Production measurement` stays backlog until dataset evaluation and optimization
are clear.

User-facing flows:

- `Dataset evaluation`: measure one target against one dataset split.
- `Optimization`: improve a target by generating candidates and repeatedly
  evaluating them.
- `Production measurement`: later flow for measuring selected production traces
  asynchronously.

## Dataset Evaluation Definition

A dataset evaluation should be saveable and reusable.

It should contain:

- name.
- dataset ID and version policy.
- default split.
- target type and target reference.
- metric settings inferred from dataset schema, with optional overrides.
- run policy such as budget, timeout, and concurrency.
- run history.

A run snapshots:

- dataset version.
- resolved row IDs.
- split selector.
- target version/ref.
- metric settings.
- run policy.
- produced outputs.
- metric results.
- trace/span evidence emitted by the run.

Every dataset item run should be trace-backed, even for simple classification
and extraction. The final output tells whether the row result matches expected
output; the trace explains how the target got there.

For each item run, store:

- dataset item ID.
- evaluation run ID.
- actual final output.
- trace ID.
- root span ID.
- target snapshot.
- metric results.
- problems.
- start/end timestamps.

Do not duplicate the full trace into evaluation records. Keep full detail in
telemetry storage and store pointers plus bounded summaries. Storage-read can
derive or return a trajectory summary for the result view:

- step count.
- model call count.
- tool call count.
- retrieval count.
- handoff count.
- retry count.
- total tokens/cost/latency.
- final status.
- selected span/evidence refs.
- bounded per-step input/output previews when content capture allows.
- textual trajectory summary.

Reasoning must be handled conservatively:

- capture model-visible messages and tool I/O only when content capture allows;
- capture provider/harness reasoning summaries only when explicitly emitted;
- do not require, infer, or invent hidden chain-of-thought;
- store bounded summaries or pointers, not unbounded reasoning text.

The textual trajectory summary is a compact explanation of what happened during
the row run, for example:

```text
The target classified the request as billing after reading the user message,
called lookup_order with orderId=123, received an active subscription record,
then produced a refund-policy answer.
```

This summary is useful for humans and optimizers because they can understand a
row run without immediately opening the full trace. It is not the source of
truth. It should cite or link the trace/span evidence it summarizes.

Store bounded structured summary data, not an unbounded transcript:

- `trajectorySummary`: concise text.
- `summaryEvidenceRefs`: trace/span/tool-call refs used by the summary.
- `importantSteps`: capped list of key steps with step kind, name, bounded
  input preview, bounded output preview, status, and span ref.
- `conversationRef`: optional pointer to full captured conversation when
  content capture and retention policy allow it.
- `summaryDigest` and `summaryGeneratedAt`.

Full conversation history can be valuable, but it can become very large and may
contain sensitive content. Keep the full content in trace/conversation storage
behind retention and content-capture policy. Evaluation item runs should store
only bounded summaries, capped previews, and refs by default.

Optimizers should consume row run information in layers:

1. Start with metrics and `trajectorySummary`.
2. Inspect `importantSteps` for failed or expensive rows.
3. Follow evidence refs to trace/span detail only when deeper diagnosis is
   needed.

This supports fast prompt/target iteration without forcing every optimization
step to ingest the entire raw trace or conversation.

Users can rerun the same evaluation after changing the target, compare with a
previous run, or use the evaluation as part of optimization.

## Optimization Loop

Optimization is not a separate result system. It references and compares normal
dataset evaluation runs.

An optimization run should:

1. Run or reference a baseline evaluation.
2. Generate candidate target versions.
3. Run quick-shot candidate evaluations on a selected subset when appropriate.
4. Run fuller candidate evaluations for promising candidates.
5. Compare candidates to baseline and previous candidates.
6. Iterate according to optimizer method and budget.
7. Optionally run the selected candidate on `test`.
8. Let the user promote explicitly.

An optimization run should snapshot:

- baseline target version.
- optimizer method and settings.
- training dataset evaluation or split.
- validation dataset evaluation or split.
- optional test dataset evaluation or split.
- generated candidate refs.
- every dataset evaluation run it caused.
- sample selection rules for quick-shot runs.
- metric comparison summaries.
- selected candidate, if any.
- final promotion decision, if any.

The first-use UX should not force users to create multiple evaluation
definitions manually. The optimization flow can create needed training,
validation, and test evaluation definitions behind the scenes.

Quick-shot optimization should be an explicit optimization phase, not a hidden
shortcut. An optimizer may inspect failed categories, weak fields, high-cost
rows, or representative clusters, propose a prompt/target change, and evaluate
only a bounded subset first. This keeps iteration fast while preserving
reproducibility.

Quick-shot runs must snapshot:

- source dataset version.
- split.
- selected item IDs.
- selection strategy, such as failed categories, edge cases, random stratified
  sample, recent failures, or representative clusters.
- seed when sampling is random.
- candidate target snapshot.
- metric settings and run policy.

Quick-shot results are useful for candidate exploration, but they are not final
confidence. Promotion should still require an explicit full validation or test
evaluation according to the chosen workflow.

## Evaluation Target

The current specs use `solverRef`. Product UX should use `target`.

A target is the runnable or measurable artifact that receives dataset input and
produces output/telemetry to measure.

Dataset-evaluation target kinds:

- `prompt`.
- `agent`.
- `workflow`.
- `skill`.
- `tool_config`.
- `model_config`.
- `custom_harness_target`.

Production targets are different: they are trace selectors over observed
telemetry. Do not collapse production selectors and dataset-evaluation targets
into one shape.

Every dataset evaluation run must snapshot the target descriptor that actually
ran:

- target type.
- stable target ID/ref.
- name.
- version, digest, tag, or snapshot ref.
- provider/model refs.
- prompt/skill/tool/workflow refs.
- adapter/harness metadata needed to rerun.

Optimization candidates are new target snapshots. The comparison UI must show
what changed: prompt content, examples, skill snapshot, tool configuration,
workflow settings, or model/provider choice.

## Metric Settings

Metric settings may be dataset-level defaults with evaluation-level overrides.

They should answer:

- which text metrics should be computed;
- which JSON metrics should be computed;
- whether semantic similarity is enabled and which provider/profile it uses;
- whether judge-style scoring is enabled and which rubric/model it uses;
- which metrics are primary in comparison views;
- what content classes are allowed.

The UI should present this as metric/evaluation settings, not as scorer/check
assets.

## Primary UX

Primary AI Eval navigation should likely be:

- `Datasets`.
- `Evaluations`.
- `Production quality` later/backlog.

Inside `Evaluations`, use tabs or filters:

- `Dataset evaluations`.
- `Optimizations`.

First path:

1. Create or import a dataset.
2. Create a dataset evaluation.
3. Select a target.
4. Run.
5. Inspect metrics and row-level outputs.
6. Use `Optimize from this evaluation` as the next step.

This teaches measurement before optimization.

## Production Measurement Backlog

Production measurement can likely reuse metric/result/comparison machinery, but
it replaces dataset rows with production trace datapoints.

The hard problem is expected output. In production, CloudGrid may only have
input and observed output. Whether a datapoint is successful or failed is
use-case-specific.

Possible sources of success/expected information:

- explicit success/failure attributes emitted by the application;
- span status or domain-specific result fields;
- configured JSON path or text rules over captured output;
- reference answer/rubric in a production policy;
- human review labels;
- conversion into dataset candidates where a user supplies expected output.

Production quality should be treated as a consumer of dataset/evaluation
primitives, not a primary design driver.
