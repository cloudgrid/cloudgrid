---
id: CAP-AIE-006
title: Manage project AI settings
domain: ai-eval
layer: capability
status: approved
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-18
provenance: from-user
traits:
  interaction: http
  sync_async: sync
  visibility: user
  authentication: prepared
depends_on: [DOM-006, TEC-BE-024, TEC-BE-028]
implements:
  api: [GQL-Query-projectAiSettings, GQL-Mutation-updateProjectAiSettings, MSG-control-ai-settings-get, MSG-control-ai-settings-update]
---

# Manage Project AI Settings

## Business Intent

Let project admins configure AI-eval defaults, provider references, budgets,
online policies, and dataset defaults without exposing raw provider secrets to
CloudGrid services. Reusable provider profiles and model aliases are managed on
the dedicated Project AI Providers settings page.

## Behavior

- Project admins enable or disable AI Eval for the selected project.
- Project admins select default provider profiles and model aliases from
  Project AI Providers.
- Project admins configure budget, sampling, concurrency, and dataset split
  defaults.
- Project admins configure online policies, but v1 policies are disabled by
  default, must target at least one explicit production segment, and may
  reference deterministic scorers only.
- Project admins may configure manual annotation defaults for online policies.
  These defaults do not create annotation queue items automatically; they are
  used only when a user explicitly triggers annotation item creation after
  reviewing filtered online results.
- Control-plane validates and persists settings with optimistic concurrency.
- The BFF exposes only GraphQL request/reply mappings. It does not merge or
  derive effective settings locally.
- Runner uses settings only through storage-read/control-plane bridge ports,
  resolves provider references through project AI provider settings, and passes
  provider profile references to harness; it never reads provider credentials.

## Acceptance Criteria

- Given no provider profile, deterministic-only local evaluation can still be
  enabled when the project budget permits deterministic execution.
- Given an LLM judge scorer without a judge profile, experiment creation or run
  start fails with a validation error before harness execution.
- Given an enabled online policy references a non-deterministic scorer, the
  settings update fails with `ERR-001`.
- Given an enabled online policy has an empty target, unsupported target key, or
  secret-looking attribute selector, the settings update fails with `ERR-001`.
- Given a raw API key-like field in settings input, control-plane rejects the
  update with `ERR-001`.
- Given a viewer attempts to update settings, the mutation fails with `ERR-016`.
- Given valid settings, `Query.projectAiSettings` returns a redacted effective
  view with warnings for disabled profiles, missing aliases, and budget state.
