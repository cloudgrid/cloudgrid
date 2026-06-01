---
id: TICKET-310
title: AI Chat workspace alignment
wave: 3
status: ready
parallel_group: feux_ai_chat
depends_on: [TICKET-302]
blocked_by: []
spec_refs:
  - specs/05-frontend/product-experience-contract.md
  - specs/05-frontend/product-ux-concept.md
  - specs/05-frontend/ai-chat-views.md
  - specs/04-backend/ai-chat.md
  - specs/03-contracts/graphql/public-schema.graphql
write_scope:
  - apps/frontend/src/routes/ai-chat-route.tsx
  - apps/frontend/src/features/ai-chat
  - apps/frontend/test/ai-chat-route.test.tsx
  - apps/frontend/e2e/ai-chat.e2e.ts
read_scope:
  - specs/spec.md
  - specs/05-frontend/product-experience-contract.md
  - specs/05-frontend/product-ux-concept.md
  - specs/05-frontend/ai-chat-views.md
  - specs/04-backend/ai-chat.md
  - specs/04-backend/ai-provider-settings.md
  - specs/03-contracts/graphql/public-schema.graphql
  - apps/frontend/src/routes/ai-chat-route.tsx
  - apps/frontend/src/features/ai-chat
contract_readiness:
  status: ready
  required_contracts:
    - AIChatConversation
    - AIChatMessage
    - AIChatRun
    - CompanyAIProviderSettings
  missing_contracts: []
ticket_readiness:
  status: implementation_ready
  open_decisions: []
  decision_source: spec
  ambiguous_phrases: []
---

## Goal

Align AI Chat with the product shell, project context, provider setup states,
conversation navigation, streaming transcript, approval controls, safe artifact
rendering, and disabled-action reasons.

## Context Digest

AI Chat uses company provider settings and selected project context. The
frontend renders server-issued messages, artifacts, tool states, and approvals.
Provider secrets and action semantics stay backend-owned.

## Implementation Approach

Refactor route layout to shared primitives, keep conversation selection in URL
or route state, move visible labels to i18n, and align setup-required,
streaming, abort, retry, approval, and artifact states with the product
experience contract.

## Decision Ledger

- Company AI provider settings enable Project AI Chat.
- Server-issued action approval controls are the only approval surface.
- Json-render artifacts remain inside untrusted fences.
- The route does not expose provider secrets.

## Requirements Traceability

Requirement id trace: PEX-001, PEX-004 through PEX-009, PEX-011, PEX-013,
PEX-014, PEX-015 plus AI Chat view acceptance. This ticket owns AI Chat shell,
provider setup guidance, transcript ergonomics, approvals, and artifact
rendering.

## Contract Traceability

GraphQL AI Chat conversation/history contracts, BFF SSE stream endpoint, and
company provider settings contracts are authoritative. Frontend controls submit
only generated contract shapes.

## Tasks

1. Place AI Chat in the shared route frame with project breadcrumbs and clear
   conversation navigation.
2. Render provider missing, feature disabled, no conversation, streaming,
   failed run, aborted run, and approval-required states.
3. Keep transcript and composer dense, readable, and keyboard accessible.
4. Keep safe artifact renderer behavior and untrusted fences.
5. Move route labels and status values to i18n.
6. Add route tests and Playwright checks.

## Acceptance

- Success path: users select a conversation, send a prompt, inspect streaming
  output, review artifacts, and approve or reject server-issued actions.
- Failure path: missing provider setup, denied access, stream failure, aborted
  run, and unsafe artifact content render bounded states with recovery actions.
- Provider credentials never appear in route markup or local state.
- The route does not invent local action semantics.

## Acceptance Test Matrix

| Criterion | Proof |
| --- | --- |
| Provider setup and disabled states | route tests |
| Streaming transcript states | AI Chat route tests |
| Approval controls | interaction tests |
| Safe artifact rendering | artifact renderer tests |
| Responsive workspace | Playwright screenshots |

## Operational Path Coverage

Success path covers normal prompt and approval flow. Failure path covers missing
provider setup, denied access, stream errors, abort, unsafe artifact data, and
backend unavailable states. Recovery path covers setup link, retry, abort, and
new prompt. Security/privacy covers secret redaction and artifact fences.
Observability/logging is test evidence. Performance/resilience covers bounded
transcript rendering and stream cleanup. Data integrity covers server-owned run
state. Production/release uses typecheck, build, smoke, and screenshots.
Supply-chain impact is not applicable.

## Verification

```sh
bun run --cwd apps/frontend typecheck
bun test apps/frontend/test/ai-chat-route.test.tsx
bun run --cwd apps/frontend build
bun run --cwd apps/frontend smoke --grep "ai-chat"
```

## Non-goals

- No AI Chat backend stream changes.
- No provider secret handling changes.
- No new tool/action semantics.

## Handoff

Pass setup, streaming, approval, and artifact screenshots to `TICKET-309`.
