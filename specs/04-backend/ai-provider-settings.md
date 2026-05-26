---
id: TEC-BE-028
title: Project and company AI provider settings
layer: backend
status: draft
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-18
provenance: from-user
depends_on: [TEC-BE-009, TEC-BE-011]
---

# Project And Company AI Provider Settings

## Purpose

AI provider settings are the reusable model-provider catalog for CloudGrid.
Project settings define multiple providers and aliases for project workflows.
Company settings define the single provider used by AI Chat.

This separates provider configuration from AI Eval, judge LLM, optimizer,
embedding, and chat settings. Other settings pages store references to provider
profiles or model aliases instead of embedding provider configuration.

## Boundary

Control-plane owns provider settings metadata and redacted effective views.

Control-plane owns:

- project-scoped AI provider profiles;
- project-scoped model aliases;
- company-scoped AI Chat provider profile;
- optimistic concurrency versions;
- validation of provider kind, base URL, model names, alias names, credential
  references, and disabled state;
- redacted effective settings and missing-configuration warnings.

Control-plane does not:

- call model providers;
- resolve raw provider credentials for the frontend;
- store raw API keys, bearer tokens, refresh tokens, provider secret JSON, AWS
  access key secrets, Azure client secrets, session cookies, or Authorization
  headers in provider settings rows or return them through read APIs;
- execute AI Chat, AI Eval, judge, optimizer, embedding, or replay work.

Control-plane does own the managed provider secret vault used by SaaS and local
UI configuration. Managed secrets are encrypted at rest in dedicated
`ai_provider_secret` records and are referenced from provider settings by
`managed:<scope>/<owner>/<provider>` refs. The raw secret value is accepted only
through write-only mutation input and is returned only to the BFF/runtime over
the private `control.ai_provider_secrets.resolve` subject for an authorized
execution.

The BFF talks to control-plane through message bridge subjects. Frontend talks
only to BFF GraphQL. Harness is the only execution boundary for model calls.

## Supported Provider Kinds

Provider kinds are stable public values:

- `anthropic`
- `openai`
- `azure_foundry`
- `aws_bedrock`
- `openai_compatible`

Provider UI labels may say `Anthropic`, `OpenAI`, `Azure AI Foundry`,
`AWS Bedrock`, and `Custom OpenAI-compatible`.

`local_harness`, `custom_harness`, `azure_openai`, `google_vertex`, and
`bedrock` are not user-facing provider kinds for this settings surface. Existing
development fixtures may keep those values internally until the contract
migration updates generated types.

## Entities

### AiProviderProfile

Fields:

- `id`: opaque profile ID.
- `ownerScope`: public GraphQL field with value `project` or `company`.
- `ownerId`: public GraphQL field containing the owning project ID for
  project-scoped profiles or company ID for company-scoped profiles.
- `companyId` and `projectId`: internal control-plane persistence fields only;
  they are not returned through the public GraphQL `AiProviderProfile` type.
- `label`: user-facing name.
- `providerKind`: one supported provider kind.
- `baseUrl`: required for `openai_compatible` and `azure_foundry`; forbidden
  for `openai`, `anthropic`, and `aws_bedrock`.
- `credentialRef`: opaque reference resolved by the BFF/harness credential
  resolver.
- `credentialValue`: write-only input field for creating or rotating the
  managed secret behind `credentialRef`. It is never stored in provider settings
  and never returned by GraphQL.
- `defaultModel`: optional model identifier.
- `models`: allowed model identifiers grouped by `default`, `chat`, `judge`,
  `optimizer`, `embedding`, and `replay`.
- `parameters`: bounded provider-neutral hints and provider metadata:
  `temperature`, `maxOutputTokens`, `reasoningEffort`, `timeoutMs`,
  `region`, and `deployment`.
- `maxConcurrency`: optional execution cap.
- `disabledAt`: optional timestamp.
- `createdAt`, `updatedAt`, `updatedByUserId`.

### AiModelAlias

Fields:

- `id`: opaque alias ID.
- `companyId`.
- `projectId`.
- `name`: stable project alias such as `judge-fast`, `optimizer-best`, or
  `embedding-default`.
- `providerProfileId`.
- `model`: provider model identifier.
- `purpose`: `default`, `chat`, `judge`, `optimizer`, `embedding`, or `replay`.
- `parameters`: bounded provider-neutral hints.
- `createdAt`, `updatedAt`, `updatedByUserId`.

Company settings v1 does not expose separate aliases. The company provider has
one `defaultModel` used by AI Chat.

### ProjectAiProviderSettings

Fields:

- `projectId`.
- `providerProfiles`: ordered project provider profiles.
- `modelAliases`: ordered project model aliases.
- `effective`: warnings, disabled profile IDs, missing credential refs, and
  missing default aliases by purpose.
- `version`.
- `updatedAt`, `updatedByUserId`.

### CompanyAiProviderSettings

Fields:

- `companyId`.
- `chatProviderProfile`: optional company provider profile.
- `effective`: `enabled`, warnings, disabled reason, missing credential reason,
  and resolved runtime-source metadata.
- `version`.
- `updatedAt`, `updatedByUserId`.

Exactly one active `chatProviderProfile` is allowed per company in v1. Company
settings do not inherit project provider settings.

## Provider-Specific Metadata

| Provider kind | Required fields | Forbidden fields |
| --- | --- | --- |
| `anthropic` | `credentialRef`, at least one `models.chat` or `defaultModel` | `baseUrl`, `parameters.region`, `parameters.deployment` |
| `openai` | `credentialRef`, at least one `models.chat` or `defaultModel` | `baseUrl`, `parameters.region`, `parameters.deployment` |
| `azure_foundry` | `credentialRef`, HTTPS `baseUrl`, `parameters.deployment`, at least one `models.chat` or `defaultModel` | `parameters.region` |
| `aws_bedrock` | `credentialRef`, `parameters.region`, at least one `models.chat` or `defaultModel` | `baseUrl`, `parameters.deployment` |
| `openai_compatible` | `credentialRef`, HTTPS `baseUrl`, at least one `models.chat` or `defaultModel` | `parameters.region`, `parameters.deployment` |

`models.chat` is required for company AI Chat settings unless `defaultModel` is
set. Project profiles may omit `models.chat` only when no project workflow uses
the profile for chat.

## Credential References And Runtime Resolution

`credentialRef` is a reference, not a secret value.

Allowed v1 forms:

- `managed:company/<companyId>/<providerProfileId>`: CloudGrid-managed,
  company-scoped encrypted provider secret. This is the default UI path for AI
  Chat in SaaS and local mode.
- `managed:project/<projectId>/<providerProfileId>`: CloudGrid-managed,
  project-scoped encrypted provider secret. This is the default UI path for
  project-level provider settings.
- `env:<NAME>`: the BFF/harness runtime reads the named environment variable.
- `external:<provider>/<path>`: an installed credential resolver reads an
  operator-managed external secret. The resolver contract must be configured at
  service startup.

The frontend may collect `credentialValue` only on create/rotate flows. The BFF
sends it to control-plane, control-plane writes an encrypted managed secret, and
the saved profile receives the derived `managed:` `credentialRef`. The frontend
may also collect `credentialRef` for advanced automation/operator flows. Raw
secret values must never be sent in `credentialRef`.

Returned GraphQL settings include only the redacted `credentialRef`, a
human-readable credential label, and effective warnings. They never include
resolved secret bytes.

Control-plane validates reference shape and structural settings. It does not
read BFF environment variables and does not call external secret resolvers.
Managed credential existence is checked by control-plane when resolving
`managed:` refs. Environment and external credential existence is checked by the
execution process immediately before harness invocation. Missing runtime
credentials fail with `ERR-AIP-001`.

Managed provider secrets use the control-plane
`CLOUDGRID_PROVIDER_SECRET_ENCRYPTION_KEY` deployment secret as key material.
Local mode may run with the built-in development key; deployed mode must provide
a stable non-default encryption key before accepting production secrets.

## Local Bootstrap

In local mode, the `Personal` company may expose an environment-backed AI Chat
provider without a saved control-plane row when all required runtime variables
are present:

- `CLOUDGRID_AI_CHAT_PROVIDER_KIND`
- `CLOUDGRID_AI_CHAT_MODEL`
- `CLOUDGRID_AI_CHAT_CREDENTIAL_REF`
- `CLOUDGRID_AI_CHAT_BASE_URL` for `azure_foundry` and `openai_compatible`
- `CLOUDGRID_AI_CHAT_AZURE_DEPLOYMENT` for `azure_foundry`
- `CLOUDGRID_AI_CHAT_AWS_REGION` for `aws_bedrock`

The BFF presents this as `runtimeSource=environment`. Saving company provider
settings creates a stored provider and stops using the environment-backed
bootstrap for that company. Deleting the stored provider restores the
environment-backed provider only in local mode.

## Public Contract Requirements

The contract wave for this spec must add:

- GraphQL `AiProviderKind`, `AiProviderProfile`, `AiModelAlias`,
  `ProjectAiProviderSettings`, `CompanyAiProviderSettings`, and redacted
  effective view types.
- GraphQL `Query.projectAiProviderSettings(projectId: ID!)`.
- GraphQL `Mutation.updateProjectAiProviderSettings(input:
  UpdateProjectAiProviderSettingsInput!)`.
- GraphQL `Query.companyAiProviderSettings(companyId: ID!)`.
- GraphQL `Mutation.updateCompanyAiProviderSettings(input:
  UpdateCompanyAiProviderSettingsInput!)`.
- AsyncAPI request/reply subjects:
  - `control.ai_providers.project.get`;
  - `control.ai_providers.project.update`;
  - `control.ai_providers.company.get`;
  - `control.ai_providers.company.update`;
  - `control.ai_provider_secrets.resolve`.
- JSON Schema `specs/03-contracts/entities/ai/ai-provider-settings.schema.json`.
- Generated TypeScript UI contracts and Go contracts.

## Authorization

- Reading project provider settings requires selected-project read access.
- Updating project provider settings requires project `admin` or company
  `admin`.
- Reading company AI provider settings requires company membership.
- Updating company AI provider settings requires company `admin`.
- Local mode treats the Personal user as company admin and project admin.

## Validation

Updates fail with `ERR-001` when:

- profile IDs or alias IDs are duplicated;
- alias names are duplicated within one project;
- a profile has an unsupported provider kind;
- `openai_compatible` is missing an HTTPS `baseUrl`;
- `azure_foundry` is missing an HTTPS `baseUrl`;
- `openai` or `anthropic` has a `baseUrl`;
- `aws_bedrock` is missing required region metadata in `parameters.region`;
- `azure_foundry` is missing required deployment metadata in
  `parameters.deployment`;
- alias references are missing or disabled;
- neither `credentialRef` nor write-only `credentialValue` is provided for an
  enabled profile;
- `credentialRef` does not use an allowed prefix;
- `credentialValue` is empty when present;
- strings contain secret-looking keys such as `authorization`, `cookie`,
  `x-api-key`, `api_key`, `token`, `secret`, `password`,
  `aws_secret_access_key`, or `client_secret`;
- `temperature` is outside `0..2`;
- `maxOutputTokens` is less than `1` or greater than `200000`;
- `timeoutMs` is less than `1000` or greater than `300000`;
- `expectedVersion` is stale.

Updates fail with `ERR-016` when the caller is not authorized.

## AI Eval Migration Rule

`specs/04-backend/ai-eval-project-settings.md` remains the AI Eval policy,
budget, sampling, and dataset-default settings spec. Provider profiles and
model aliases move to this spec.

The contract migration must update AI Eval settings so default judge,
optimizer, embedding, replay, and default model settings reference
`ProjectAiProviderSettings` profile IDs or alias IDs. Implementation agents
must not add new provider profile arrays inside AI Eval-specific settings after
this spec is active.

## Verification

Required tests:

- project admin can create, update, disable, and reference project profiles;
- company admin can configure exactly one company AI Chat provider;
- non-admin company users cannot update company provider settings;
- raw secret-looking strings are rejected;
- redacted reads never include resolved credential values;
- disabled profiles produce effective warnings;
- stale versions are rejected;
- BFF resolvers call only control-plane message subjects;
- provider settings are reused by AI Eval settings instead of duplicated there.
