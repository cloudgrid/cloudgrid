---
id: DOM-007
title: AI chat
layer: domain
status: draft
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-18
provenance: from-user
depends_on: [VIS-001, CNV-001, TEC-BE-001, TEC-BE-008, TEC-BE-028]
---

# AI Chat

## Purpose

AI Chat is a project-scoped assistant for investigating and operating
CloudGrid. A user can ask questions about traces, logs, metrics, dashboards,
alerts, and AI-evaluation evidence, receive rendered analytical artifacts, and
request guided actions that are executed only through existing CloudGrid
contracts and authorization checks.

AI Chat is not a replacement storage backend, telemetry query engine, or model
provider proxy. It is an assistant workflow that uses the same BFF, message
bridge, storage-read, control-plane, and harness boundaries as the regular UI.

## Main Entities

- ENT-AIC-001: AiChatConversation
- ENT-AIC-002: AiChatMessage
- ENT-AIC-003: AiChatRun
- ENT-AIC-004: AiChatArtifact
- ENT-AIC-005: AiChatActionProposal
- ENT-AIC-006: AiChatCompaction
- ENT-AIP-001: AiProviderProfile
- ENT-AIP-002: AiModelAlias
- ENT-AIP-003: ProjectAiProviderSettings
- ENT-AIP-004: CompanyAiProviderSettings

## Capabilities

- CAP-AIP-001: Manage project AI providers.
- CAP-AIP-002: Manage company AI chat provider.
- CAP-AIC-001: Use project AI Chat.

## Key Invariants

- Every AI Chat conversation belongs to exactly one user and exactly one
  project. History is listed per user, grouped by project, ordered by
  `lastMessageAt` descending within each group.
- The company-level AI provider is the only model configuration used by AI Chat
  v1. Project-level AI providers are used by project workflows such as AI Eval,
  judge LLMs, prompt optimization, and later project-owned AI features.
- Model calls go through the AI harness integration. CloudGrid services do not
  call OpenAI, Anthropic, Azure AI Foundry, AWS Bedrock, or OpenAI-compatible
  providers directly.
- The TypeScript BFF owns the v1 AI Chat runtime integration because it already
  owns browser sessions, GraphQL auth, streaming HTTP/SSE, and frontend static
  serving. The BFF still must not import SurrealDB clients or bypass private
  service contracts.
- AI Chat data access uses approved GraphQL resolver paths or private message
  bridge ports. Storage-read remains the owner of telemetry query semantics.
  Control-plane remains the owner of company, project, provider, dashboard,
  alert, membership, and conversation metadata.
- Assistant-side analysis scripts run only inside a per-run sandbox. Scripts
  operate on bounded files materialized by CloudGrid tools and cannot access
  network, environment variables, host paths, provider credentials, session
  cookies, NATS, SurrealDB, or OTLP endpoints.
- Rendered assistant output uses a typed JSON-render catalog. The assistant
  cannot send arbitrary React, HTML, iframe, JavaScript, CSS, or external script
  URLs to the browser.
- User-visible mutating actions are never executed directly by model text.
  Critical and destructive actions require explicit user approval in the UI,
  and all mutations re-run normal GraphQL/control-plane authorization checks.
- Chat summaries, compactions, artifacts, approvals, and run telemetry must not
  contain raw provider secrets, session cookies, SurrealDB credentials, NATS
  credentials, bearer tokens, or raw Authorization headers.
- AI Chat self-observability is emitted through the normal OTLP path. Local mode
  enables AI Chat tracing by default; deployed mode requires an explicit runtime
  flag before prompts, tool timings, or sanitized run spans are emitted.

## Boundaries

### In Scope

- Project-scoped chat route and per-user conversation history.
- Company admin configuration of one AI Chat provider.
- Project admin configuration of multiple reusable AI providers and model
  aliases for AI Eval and later project workflows.
- BFF-integrated harness runtime for AI Chat v1 with streaming response
  delivery to the browser.
- Bounded data acquisition tools for traces, logs, metrics, dashboards, alerts,
  and AI-evaluation read models.
- Sandbox file storage, script generation, script execution, and bounded
  assistant artifacts for larger analysis tasks.
- JSON-render outputs for charts, tables, diagrams, Mermaid, trace waterfalls,
  log excerpts, structured JSON, diffs, and action approval cards.
- Explicit action proposal, approval, execution, audit, and failure states.
- Conversation auto-compaction and manual compaction.

### Out Of Scope

- SaaS-hosted CloudGrid model execution.
- Raw provider credential storage in frontend, BFF responses, generated assets,
  logs, or telemetry attributes.
- Arbitrary database, NATS, filesystem, network, shell, or browser automation
  tools exposed to the assistant.
- Cross-project queries inside one chat run. A future company-level assistant
  may define a separate cross-project authorization and query plan.
- Automatic execution of destructive actions, membership changes, provider
  settings changes, retention deletion, alert deletion, or project deletion.
- Fine tuning, vector backfill, autonomous background agents, scheduled chat
  runs, and proactive notifications.
