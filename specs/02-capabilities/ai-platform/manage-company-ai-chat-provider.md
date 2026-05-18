---
id: CAP-AIP-002
title: Manage company AI chat provider
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
depends_on: [TEC-BE-028, TEC-FE-009]
implements:
  api: [GQL-Query-companyAiProviderSettings, GQL-Mutation-updateCompanyAiProviderSettings, MSG-control-ai-providers-company-get, MSG-control-ai-providers-company-update]
---

# Manage Company AI Chat Provider

## Business Intent

Let company admins configure the one model provider used by AI Chat for their
company. The setting is company-scoped because chat history is per user and
project, but the assistant model policy is an administrative company decision.

## Behavior

- Company admins open `/organizations/:organizationId/ai-provider`.
- The page is hidden from company users without the `admin` company role.
- Exactly one active AI Chat provider profile is allowed per company in v1.
- Supported provider kinds are `anthropic`, `openai`, `azure_foundry`,
  `aws_bedrock`, and `openai_compatible`.
- The company profile has one default chat model and optional bounded parameter
  hints for temperature, max output tokens, reasoning effort, and timeout.
- The company profile stores an opaque credential reference only.
- AI Chat is unavailable for a company until the effective settings resolve to
  one enabled provider profile with one default chat model.
- Local mode may bootstrap the `Personal` company from runtime environment
  variables and show the resulting provider as managed by runtime config until
  a company admin saves an explicit replacement.

## Acceptance Criteria

- Given a company admin saves a valid provider profile, AI Chat becomes
  available for projects in that company after the effective settings refresh.
- Given a non-admin opens the route, the UI shows a forbidden state and the BFF
  returns `ERR-016` for update attempts.
- Given an update attempts to save two active company chat providers, the
  mutation fails with `ERR-001`.
- Given an OpenAI-compatible provider has an invalid HTTPS base URL, the update
  fails with `ERR-001`.
- Given raw provider secret material appears in any returned GraphQL response,
  the implementation fails the contract test.
- Given no provider is configured, AI Chat route entry points show a setup
  state for admins and a disabled state for non-admin users.
