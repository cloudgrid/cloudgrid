---
id: CAP-AIE-006
title: Manage project AI settings
domain: ai-eval
layer: capability
status: approved
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-16
provenance: from-user
traits:
  interaction: http
  sync_async: sync
  visibility: user
  authentication: prepared
depends_on: [DOM-006, TEC-BE-024]
implements:
  api: [GQL-Query-projectAiSettings, GQL-Mutation-updateProjectAiSettings, MSG-control-ai-settings-get, MSG-control-ai-settings-update]
---

# Manage Project AI Settings

## Business Intent

Let project admins configure AI-eval provider profiles, model aliases, budgets,
online policies, and dataset defaults without exposing raw provider secrets to
CloudGrid services.

## Behavior

- Project admins enable or disable AI Eval for the selected project.
- Project admins configure provider profiles and model aliases.
- Project admins select default judge, optimizer, embedding, and replay model
  aliases.
- Project admins configure budget, sampling, concurrency, and dataset split
  defaults.
- Control-plane validates and persists settings with optimistic concurrency.
- The BFF exposes only GraphQL request/reply mappings. It does not merge or
  derive effective settings locally.
- Runner uses settings only through storage-read/control-plane bridge ports and
  passes provider profile references to harness; it never reads provider
  credentials.

## Acceptance Criteria

- Given no provider profile, deterministic-only local evaluation can still be
  enabled when the project budget permits deterministic execution.
- Given an LLM judge scorer without a judge profile, experiment creation or run
  start fails with a validation error before harness execution.
- Given a raw API key-like field in settings input, control-plane rejects the
  update with `ERR-001`.
- Given a viewer attempts to update settings, the mutation fails with `ERR-016`.
- Given valid settings, `Query.projectAiSettings` returns a redacted effective
  view with warnings for disabled profiles, missing aliases, and budget state.
