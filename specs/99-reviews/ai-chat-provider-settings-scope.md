---
id: REV-007
title: AI provider settings and AI Chat scope
layer: review
status: draft
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-18
provenance: from-user
depends_on: [DOM-007, TEC-BE-028, TEC-BE-029, TEC-FE-009]
---

# AI Provider Settings And AI Chat Scope

## Scope Decision

CloudGrid has a draft implementation scope for reusable AI provider settings
and project AI Chat.

The wave is intentionally separate from the currently approved AI Eval
implementation readiness report. It becomes implementation-ready only after the
GraphQL SDL, AsyncAPI contracts, generated TypeScript/Go contracts, contract
tests, and a wave-specific readiness report are updated and approved.

## Product Direction

1. Project settings get a dedicated `AI Providers` page.
2. Project AI Providers support Anthropic, OpenAI, Azure AI Foundry, AWS
   Bedrock, and custom OpenAI-compatible providers.
3. AI Eval, LLM judge scorers, prompt optimization, embeddings, replay, and
   later project AI features reference Project AI Provider entries.
4. Company settings get one company-level AI provider for AI Chat.
5. AI Chat is a project route that uses company provider settings, per-user
   chat history grouped by project, AI Elements UI components, json-render
   artifacts, sandboxed scripts, and explicit approval for risky actions.
6. The BFF hosts the v1 AI Chat runtime and harness integration because it owns
   browser auth and streaming HTTP/SSE. It still talks to private services only
   through approved contracts.

## Implementation Wave Order

1. Contract wave: add GraphQL, AsyncAPI, JSON Schema, generated TypeScript, and
   generated Go contracts for provider settings, chat history, stream setup,
   artifacts, action approvals, and compaction.
2. Control-plane wave: persist provider settings, chat metadata, messages,
   artifacts, compactions, and approval records.
3. BFF wave: add provider settings resolvers, chat history resolvers, action
   approval resolvers, AI Chat stream endpoint, harness integration, tool
   orchestration, sandbox, render validation, and telemetry.
4. Frontend wave: add AI Providers settings pages, company AI Provider page,
   AI Chat route, AI Elements transcript/composer integration, json-render
   catalog wrappers, and approval UI.
5. Verification wave: contract drift checks, BFF streaming tests, sandbox
   escape tests, frontend smoke tests, and redaction tests.

## Current Readiness State

The specs define the product and architecture direction, but this wave is not
approved for implementation until the machine-readable public contracts and
readiness gate are updated.

Implementation agents may read these specs for context. They must not implement
AI Chat or provider-settings behavior from prose alone when GraphQL, AsyncAPI,
generated contracts, or validation tests are missing.

## Critical Gap Pass

The scope must not proceed to planning unless these specified areas
remain covered in the contract wave:

- provider runtime resolution is separate from control-plane structural
  validation;
- local environment-backed AI Chat provider bootstrap has explicit variable
  names and provider-specific required fields;
- AI Chat stream request, event envelope, event order, duplicate submit, abort,
  and terminal behavior are fixed;
- harness chat integration is behind an internal BFF port with BFF-owned tool
  execution;
- read tools have fixed backend paths and hard result limits;
- sandbox imports, filesystem access, network access, environment access, and
  retained artifact behavior are explicitly denied or bounded;
- json-render catalog keys and payload caps are fixed;
- action proposal whitelist, risk levels, expiry, version preconditions, and
  retry behavior are fixed;
- frontend AI Elements attachment, screenshot, web-search, and model-picker
  controls are disabled in v1;
- chat history grouping across accessible projects has an explicit selected
  project switch behavior.
