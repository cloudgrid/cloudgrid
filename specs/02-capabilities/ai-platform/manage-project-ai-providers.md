---
id: CAP-AIP-001
title: Manage project AI providers
domain: ai-platform
layer: capability
status: draft
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-18
provenance: from-user
traits:
  interaction: http
  sync_async: sync
  visibility: user
  authentication: prepared
depends_on: [TEC-BE-028, TEC-FE-001]
implements:
  api: [GQL-Query-projectAiProviderSettings, GQL-Mutation-updateProjectAiProviderSettings, MSG-control-ai-providers-project-get, MSG-control-ai-providers-project-update]
---

# Manage Project AI Providers

## Business Intent

Let project admins define the reusable AI provider entries for project-scoped
features. AI Eval, LLM judge scorers, prompt optimization, replay, embeddings,
and later project AI workflows reference these entries instead of each settings
page embedding its own provider configuration.

## Behavior

- Project admins open `/projects/:projectId/settings/ai-providers`.
- The page lists provider profiles and model aliases for the selected project.
- Supported provider kinds are `anthropic`, `openai`, `azure_foundry`,
  `aws_bedrock`, and `openai_compatible`.
- A project can have multiple provider profiles.
- A project can have multiple model aliases. Each alias points at one provider
  profile, one provider model identifier, and one purpose: `default`, `judge`,
  `optimizer`, `embedding`, or `replay`.
- AI Eval settings, scorer settings, and later judge-LLM settings store only
  provider profile IDs or model alias IDs from this page.
- Provider profile configuration stores metadata and opaque credential
  references only. It does not store raw API keys or provider secret JSON.
- Control-plane validates profile shape, alias uniqueness, supported purposes,
  credential reference shape, provider-specific required metadata, and
  optimistic concurrency.
- The BFF exposes GraphQL request/reply mappings only. It does not resolve
  provider secrets, call providers, or synthesize effective settings locally.

## Acceptance Criteria

- Given a project admin creates an Anthropic, OpenAI, Azure AI Foundry, AWS
  Bedrock, or OpenAI-compatible profile with valid metadata and credential
  reference, `Query.projectAiProviderSettings` returns the redacted profile.
- Given a profile is disabled, AI Eval and judge settings can still show the
  saved reference with an effective warning, but execution fails before harness
  invocation until an enabled profile or alias is selected.
- Given two aliases in one project have the same name, the update fails with
  `ERR-001`.
- Given an OpenAI-compatible profile is missing `baseUrl`, the update fails with
  `ERR-001`.
- Given an OpenAI or Anthropic profile contains `baseUrl`, the update fails with
  `ERR-001`.
- Given any string key or value looks like a raw credential, the update fails
  with `ERR-001`.
- Given a viewer attempts to update provider settings, the mutation fails with
  `ERR-016`.
- Given valid settings and an expected version that is stale, the mutation fails
  with `ERR-001` and does not overwrite newer provider settings.
