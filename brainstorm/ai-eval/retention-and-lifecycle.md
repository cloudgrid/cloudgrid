# AI Eval Retention And Lifecycle Brainstorm

Date: 2026-05-24

Status: brainstorming, not implementation-ready spec

## Problem

Evaluations can generate a lot of data:

- item outputs;
- metric results;
- trace/span evidence;
- trajectory summaries;
- important step previews;
- full conversations;
- tool inputs/outputs;
- optimizer candidate attempts;
- quick-shot sample runs;
- failed intermediate candidates.

Not all of this data has the same value. Some data must be durable for
reproducibility. Some is only useful while an optimization is running. Some is
useful for short-term debugging but too expensive or sensitive to keep forever.

## Retention Classes

### Durable

Keep long enough to reproduce, audit, and compare important runs.

Examples:

- dataset version reference;
- resolved dataset item IDs;
- target snapshot/digest;
- metric settings;
- run policy;
- final metric aggregates;
- final per-item metric values;
- final selected candidate refs;
- promotion decision records;
- source trace/root span refs;
- summary digests.

These records are the minimum needed to explain what was evaluated and why a
candidate was selected.

### Review Window

Keep for a bounded period after a run, especially failed or changed rows.

Examples:

- `trajectorySummary`;
- `importantSteps`;
- bounded input/output previews;
- row-level comparison explanations;
- optimizer notes about why a candidate was changed;
- sampled quick-shot results.

These are useful for humans and optimizers, but may not need to live forever.

### Ephemeral

Keep only during a run or optimization session unless explicitly promoted.

Examples:

- low-ranked candidate attempts;
- scratch optimizer reasoning;
- intermediate prompt drafts;
- raw quick-shot diagnostics;
- full unbounded transcripts copied into optimizer context;
- temporary candidate comparison tables.

These should expire quickly. If a candidate becomes important, persist its
snapshot, metrics, and bounded summaries, not all scratch context.

### Trace-Retention Bound

Evaluation item runs should link to CloudGrid traces. Trace retention policy may
delete full trace detail earlier than durable evaluation summaries.

When trace detail expires, evaluation records should still keep enough durable
summary data to explain historical comparisons:

- target snapshot;
- actual final output digest or bounded retained output when policy allows;
- metric values;
- problem counts;
- trace ID/root span ID as historical refs;
- summary digest;
- retained trajectory summary if policy class allows it.

## Proposed Retention Settings

Do not expose a large raw TTL policy surface by default. Retention is deep
technical behavior and the likely audience for this area is data/eval people,
not infrastructure administrators.

Use retention profiles with opinionated defaults:

- `balanced`: default profile for most projects.
- `fast_iteration`: short retention for quick-shot and scratch artifacts.
- `audit_friendly`: longer retention for row-level summaries and selected runs.
- `minimal_storage`: aggressive cleanup, keeping only durable metadata and
  aggregates where possible.

Profiles map internal retention roles to TTLs and storage behavior.

At project or evaluation level, advanced settings may eventually control:

- durable run metadata retention.
- per-item metric retention.
- trajectory summary retention.
- important-step preview retention.
- full conversation/content retention.
- quick-shot run retention.
- optimizer scratch retention.
- candidate attempt retention.

Useful defaults to consider:

- durable metadata and aggregates: long-lived.
- per-item metric values: long-lived for selected/baseline/test runs, shorter
  for quick-shot runs.
- trajectory summaries: medium-lived.
- important-step previews: medium or short-lived.
- full conversations/tool I/O: follow trace/content retention and PII policy.
- optimizer scratch: very short-lived.
- rejected candidate attempts: short-lived unless pinned.

## Retention Roles

Every evaluation run or artifact should receive a retention role:

- `scratch`: temporary optimizer or evaluator scratch artifact.
- `quick_shot`: bounded subset evaluation used during optimization.
- `candidate`: candidate evaluation that may still become relevant.
- `baseline`: comparison baseline.
- `validation`: full validation run.
- `test`: final confidence run.
- `promoted`: evidence tied to a promoted target/candidate.
- `pinned`: user- or system-pinned run, row, or evidence set.

The retention profile maps each role to concrete TTLs for durable metadata,
per-item metrics, trajectory summaries, previews, full content refs, and
optimizer scratch.

The system should automatically promote retention roles when something becomes
important:

- selected candidate becomes `candidate` or `promoted`;
- baseline run becomes `baseline`;
- full validation run becomes `validation`;
- final test run becomes `test`;
- user-pinned run/row/evidence becomes `pinned`;
- promotion evidence becomes `promoted`.

This keeps retention mostly automatic while preserving important evidence.

## Data-Person UX

The UI should not start with raw TTL fields. It should ask operational
questions:

- How much evaluation history do you want to compare?
- Do you need reproducible audit evidence?
- Should failed examples keep row-level explanations longer?
- How aggressive should optimization scratch cleanup be?

Those answers map to a retention profile. Advanced users may inspect the
resulting policy later, but the default flow should be profile-based.

## Automated Heuristics

Suggested heuristics:

- Keep selected/baseline/test/promoted runs longer.
- Keep per-item metrics for selected runs longer than for quick-shot runs.
- Keep row summaries longer for failures, regressions, changed outputs, and
  pinned examples.
- Expire summaries sooner for rows that are unchanged from baseline.
- Keep full trace/conversation content only according to telemetry/content
  retention and PII policy.
- Expire low-ranked candidate attempts and optimizer scratch quickly.
- Preserve enough metadata to explain why a candidate was selected even after
  detailed traces expire.

## Pinning And Promotion

Users or the system should be able to pin important runs/candidates:

- baseline run;
- selected optimization candidate;
- final validation run;
- final test run;
- release/promotion evidence;
- failure analysis examples.

Pinned records move from review-window/ephemeral retention to durable retention
for the relevant summary artifacts. Pinning should not necessarily retain full
raw traces or conversations if project content retention forbids it.

## Optimization-Specific Lifecycle

Optimization creates many intermediate artifacts. The lifecycle should be:

1. Create candidate.
2. Run quick-shot evaluation.
3. Keep full quick-shot details only while candidate remains active.
4. Persist bounded metrics/summaries for candidates that survive pruning.
5. Drop scratch details for pruned candidates after a short window.
6. Run full validation/test only for selected candidates.
7. Persist selected candidate evidence durably.

This keeps optimization reproducible without keeping every internal thought,
raw trace, or intermediate prompt draft forever.

## Open Questions

- Which records are required to rerun a historical evaluation exactly?
- Should actual final output be retained in full, bounded preview, digest only,
  or according to dataset content policy?
- Should quick-shot runs be visible in normal run history or only inside the
  optimization run detail?
- How long should unpinned quick-shot data remain?
- Should users be able to pin individual row evidence?
- How should retention interact with anonymization/redaction policy?
- What happens to comparisons when one side's trace detail has expired?
