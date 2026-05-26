---
id: CAP-AIE-006
title: Manage project AI settings
domain: ai-eval
layer: capability
status: approved
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-24
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

Let project admins configure AI Eval enablement, provider references, budgets,
run defaults, dataset defaults, anonymization defaults, and external adapters
without exposing secrets to frontend or BFF logs.

## Required Behavior

- Control-plane owns project AI settings.
- Project AI provider profiles and model aliases are referenced by ID.
- Settings include run policy defaults, dataset defaults, dataset pipeline
  defaults, retention defaults, and external adapter configs.
- Production measurement policies are backlog and must not be implemented from
  the old scorer model.
- BFF exposes settings through GraphQL and does not derive effective settings
  locally.
- Runner reads settings through control-plane/storage-read bridge ports and
  never reads raw provider or adapter secrets.
- Raw API key-like fields in settings input are rejected unless they are written
  through an approved secret reference mechanism.

## Acceptance Criteria

- A project admin can enable AI Eval and set dataset defaults using
  `training`, `validation`, or `test`.
- A viewer cannot update settings.
- External adapter settings return redacted secret refs only.
- Invalid legacy split defaults are rejected.
