# AI Eval Classification Prompt Optimization Fixture

This pack is a realistic, deterministic support-intent classification example
for trying classification evaluation and prompt optimization end to end. It is
small enough for local runs but includes label confusions, distractors, edge
cases, and split coverage that an optimizer can improve.

Files:

- `dataset-settings.json`: public GraphQL `DatasetSettingsInput`-shaped
  settings for a closed-label classification dataset.
- `rows.jsonl`: ready import rows with `input`, `expected`, `reason`, `split`,
  `curationStatus`, source refs, and metadata.
- `baseline-target.json`: example prompt target snapshot metadata.
- `baseline-prompt.md`: intentionally weak baseline prompt.
- `baseline-examples.jsonl`: weak few-shot examples attached to the baseline
  target.
- `expected-optimizer-behavior.json`: deterministic expectations for tests and
  manual review.

Recommended primary metric: `classification.accuracy`.
