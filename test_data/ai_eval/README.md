# AI Eval Fixture Packs

This directory contains checked-in example data for AI Eval local runs and
integration scenarios.

Prompt optimization try-it packs:

- `classification`: support-intent classification with a weak baseline prompt,
  baseline examples, training/validation/test rows, and expected optimizer
  behavior.
- `extraction`: order-confirmation extraction with a weak baseline prompt,
  baseline examples, training/validation/test rows, and expected optimizer
  behavior.

Skill optimization packs:

- `skill_optimization/deterministic`: hermetic skill text-edit fixture.
- `skill_optimization/real-llm`: provider-neutral opt-in fixture for manual
  live-model validation.

Manual real-LLM prompt optimization packs:

- `manual_real_llm/classification`: realistic B2B support routing data for
  manual live-model classification runs.
- `manual_real_llm/extraction`: realistic incident brief extraction data for
  manual live-model extraction runs.

The classification and extraction packs use public GraphQL dataset settings
shape and JSONL rows with `curationStatus`, split values, source refs, and
realistic anonymized content. They contain no secrets.

Automated integration tests must use the deterministic CloudGrid AI harness
adapter, not these manual real-LLM packs.
