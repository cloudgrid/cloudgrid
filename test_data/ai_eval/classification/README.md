# AI Eval Classification Test Data

Small customer-support intent classification dataset for validating dataset creation, JSON schema settings, row import, split handling, optional reasons, and classification metrics.

Files:

- `dataset-settings.json`: dataset-level input and expected-output JSON schemas.
- `rows.jsonl`: import rows with `input`, `expected`, optional `reason`, `split`, `reviewStatus`, and metadata.

Recommended metric: `classification.accuracy`.
