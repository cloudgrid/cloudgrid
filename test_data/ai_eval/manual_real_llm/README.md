# Manual Real-LLM AI Eval Data

These fixture packs are for operator-driven manual tests against real model
providers. They are not integration scenarios and must not be referenced by the
automated integration runner.

Rules:

- configure real provider credentials only through normal CloudGrid project AI
  provider settings;
- do not add API keys, bearer tokens, cookies, or provider secrets to this
  directory;
- use the `config.template.json` files only as placeholders for project-local
  IDs and model aliases;
- keep these packs provider-neutral so the same rows can be tried with any
  supported model through the CloudGrid harness.

Available packs:

- `classification`: B2B observability support intent classification.
- `extraction`: incident brief structured extraction.
