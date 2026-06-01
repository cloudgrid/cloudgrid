# AI Eval Extraction Prompt Optimization Fixture

This pack is a realistic, deterministic order-confirmation extraction example
for trying extraction evaluation and prompt optimization end to end. It includes
schema validation, weak fields, distractor amounts, country normalization, word
quantities, optional discounts, and train/validation/test split coverage.

Files:

- `dataset-settings.json`: public GraphQL `DatasetSettingsInput`-shaped
  settings for a structured extraction dataset.
- `rows.jsonl`: ready import rows with raw text input and normalized JSON
  expected output.
- `baseline-target.json`: example prompt target snapshot metadata.
- `baseline-prompt.md`: intentionally weak baseline prompt.
- `baseline-examples.jsonl`: weak few-shot examples attached to the baseline
  target.
- `expected-optimizer-behavior.json`: deterministic expectations for tests and
  manual review.

Recommended primary metric: `extraction.field_match_rate`.
