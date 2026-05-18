---
id: FLW-AIP-001
title: AI provider settings resolution
domain: ai-platform
layer: flow
status: draft
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-18
provenance: from-user
trigger:
  type: manual
  expression: provider settings query/update or AI feature execution
orchestration: sync
delivery_semantics: request/reply with optimistic concurrency for writes
idempotency:
  key_fields: [scope, companyId, projectId, expectedVersion]
  dedupe_window: none
  store: control-plane
retry:
  max_attempts: 1
  retryable_errors: [ERR-013, ERR-014]
  permanent_errors: [ERR-001, ERR-016, ERR-AIP-001]
terminal_failure: return-problem-details
depends_on: [CAP-AIP-001, CAP-AIP-002, TEC-BE-028]
---

# AI Provider Settings Resolution

## Settings Read Flow

1. Frontend opens a project or company provider settings page.
2. BFF validates the browser session and project/company access.
3. BFF sends the matching control-plane request:
   - `control.ai_providers.project.get`; or
   - `control.ai_providers.company.get`.
4. Control-plane loads provider profiles, model aliases, settings version, and
   structural effective warnings.
5. Control-plane returns redacted settings only. It does not resolve
   environment variables or external secret bytes.
6. BFF returns the redacted GraphQL view model.

Structural effective warnings include missing profile metadata, missing
`credentialRef` strings, disabled profiles, duplicate references, and missing
model aliases. They do not prove that a referenced environment variable or
external secret exists at BFF runtime.

## Settings Update Flow

1. Admin edits settings and submits the current `expectedVersion`.
2. BFF validates input shape and authorization, then sends the update to
   control-plane.
3. Control-plane validates provider-specific metadata, credential reference
   shape, alias references, secret-looking strings, and optimistic version.
4. Control-plane persists the settings and increments `version`.
5. Control-plane returns the redacted updated settings.
6. Frontend clears dirty state and refetches any route that depends on provider
   effective warnings.

No update path stores raw provider credentials. If the UI ever needs write-only
secret entry, a separate secret-management spec must define encryption,
rotation, redaction, audit, and deletion before implementation.

## Runtime Resolution Flow

1. AI Chat or AI Eval execution asks for a provider profile or model alias by
   ID.
2. BFF or runner loads redacted settings through control-plane.
3. The runtime credential resolver resolves `credentialRef` only inside the
   execution process:
   - `env:<NAME>` reads process environment variable `<NAME>`;
   - `external:<provider>/<path>` calls the configured external resolver.
4. The resolved credential is passed in memory to the harness integration.
5. The resolved credential is never logged, persisted, returned through
   GraphQL, added to span attributes, written to sandbox files, or included in
   action proposal previews.
6. Missing or invalid runtime credentials fail execution with `ERR-AIP-001`.

## Provider-Specific Required Metadata

| Provider kind | Required fields | Forbidden fields |
| --- | --- | --- |
| `anthropic` | `credentialRef`, at least one model | `baseUrl`, `parameters.region`, `parameters.deployment` |
| `openai` | `credentialRef`, at least one model | `baseUrl`, `parameters.region`, `parameters.deployment` |
| `azure_foundry` | `credentialRef`, HTTPS `baseUrl`, `parameters.deployment`, at least one model | `parameters.region` |
| `aws_bedrock` | `credentialRef`, `parameters.region`, at least one model | `baseUrl`, `parameters.deployment` |
| `openai_compatible` | `credentialRef`, HTTPS `baseUrl`, at least one model | `parameters.region`, `parameters.deployment` |

## Terminal Behavior

- Missing selected project or company access returns `ERR-016`.
- Invalid provider metadata returns `ERR-001`.
- Stale `expectedVersion` returns `ERR-001`.
- Missing runtime credential values return `ERR-AIP-001`.
- Provider SDK or harness provider errors are sanitized before being surfaced.
