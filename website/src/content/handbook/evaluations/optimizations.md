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
