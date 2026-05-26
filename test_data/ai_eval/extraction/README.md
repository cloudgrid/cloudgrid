# AI Eval Extraction Test Data

Small order-confirmation extraction dataset for validating raw JSON expected outputs, JSON schema validation, optional fields, split handling, and extraction metrics.

Files:

- `dataset-settings.json`: dataset-level input and expected-output JSON schemas.
- `rows.jsonl`: import rows with unstructured text input and structured JSON expected output.

Recommended metric: `extraction.exact_json_match` for strict checks or a field-level JSON metric when available.
