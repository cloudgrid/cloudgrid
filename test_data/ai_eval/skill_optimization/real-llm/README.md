# Manual Real-LLM Skill Optimization Fixture

This fixture pack is for manual tests against a real model provider. It is
provider-neutral and contains no credentials. Automated integration tests must
not call a live model; they use the deterministic CloudGrid AI harness adapter.

To use it manually, import or copy the dataset rows and skill package into a
project that already has provider credentials and a model alias configured.
Run the normal CloudGrid skill optimization flow from the UI or public API.

Suggested manual run configuration:

- runtime mode: managed harness;
- model alias: a project-defined model alias for the provider you want to test;
- optimizer kind: `skill_text_edit`;
- training split: `training`;
- validation split: `validation`;
- test split: `test`;
- gate metric: the exact JSON or rubric metric configured for the dataset.

Provider credentials must come from the normal CloudGrid project/provider
configuration. Do not add API keys, bearer tokens, or provider secrets to this
fixture pack.
