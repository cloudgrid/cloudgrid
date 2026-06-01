# Manual Real-LLM Extraction Fixture

Use this pack to manually evaluate and optimize a real LLM prompt for extracting
incident briefs from customer-facing incident notes. The data is realistic but
synthetic and contains no secrets.

Files:

- `config.template.json`: manual-only provider/model placeholders.
- `dataset-settings.json`: dataset settings for structured extraction.
- `rows.jsonl`: training/validation/test examples.
- `baseline-prompt.md`: intentionally under-specified prompt.
- `baseline-examples.jsonl`: simple starting examples.
- `expected-manual-checks.json`: expected observations after a real run.
