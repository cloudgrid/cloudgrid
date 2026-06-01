# Manual Real-LLM Classification Fixture

Use this pack to manually evaluate and optimize a real LLM prompt for routing
B2B observability support messages. The rows are realistic but synthetic and
contain no customer secrets.

This data intentionally includes mixed signals: security messages that mention
latency, performance issues that mention alerts, retention requests that mention
billing admins, and onboarding questions that look like sales handoffs.

Files:

- `config.template.json`: manual-only provider/model placeholders.
- `dataset-settings.json`: dataset settings for a closed-label classifier.
- `rows.jsonl`: training/validation/test examples.
- `baseline-prompt.md`: intentionally under-specified prompt.
- `baseline-examples.jsonl`: simple starting examples.
- `expected-manual-checks.json`: expected observations after a real run.
