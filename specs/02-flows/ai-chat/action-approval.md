---
id: FLW-AIC-002
title: AI Chat action approval
domain: ai-chat
layer: flow
status: draft
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-18
provenance: from-user
trigger:
  type: manual
  expression: GraphQL Mutation.approveAiChatAction
orchestration: sync
delivery_semantics: request/reply with idempotent action proposal state
idempotency:
  key_fields: [actionProposalId, idempotencyKey]
  dedupe_window: P7D
  store: control-plane
retry:
  max_attempts: 1
  retryable_errors: [ERR-013, ERR-014]
  permanent_errors: [ERR-001, ERR-016, ERR-AIC-003]
terminal_failure: keep-action-proposal-failed-or-rejected
depends_on: [CAP-AIC-001, TEC-BE-029]
---

# AI Chat Action Approval

## Steps

1. Assistant proposes an action through `action.propose`.
2. BFF validates the action kind, risk, target project/company, mutation name,
   input preview, version preconditions, and redaction.
3. BFF persists `AiChatActionProposal(status=proposed)` in control-plane.
4. Frontend renders the proposal with the risk-specific approval UI.
5. User approves or rejects through `Mutation.approveAiChatAction`.
6. BFF reloads the proposal and verifies:
   - proposal belongs to the current user;
   - proposal has not expired;
   - proposal is still `proposed`;
   - selected project/company access still permits the underlying action;
   - resource version preconditions still match.
7. Rejection stores `status=rejected` and appends an approval-result message.
8. Approval stores `status=approved`, then BFF executes the mapped GraphQL
   mutation or control-plane action.
9. BFF stores `status=succeeded` or `status=failed` with sanitized problem
   details and appends an approval-result message.

## Expiry And Versioning

- Proposals expire 15 minutes after creation.
- Expired proposals cannot be approved and return `ERR-AIC-003`.
- Any action that mutates an existing versioned resource must include the
  expected version in the proposal. Stale versions fail before mutation.
- Retrying approval with the same idempotency key returns the existing terminal
  action state and does not execute the mutation twice.

## Boundaries

The assistant never executes actions directly. Only server-issued action
proposal IDs can be approved. Frontend-local mutation payloads, copied JSON, or
assistant text are not executable actions.

Secret-returning actions are outside this flow in v1. The assistant may explain
where to perform them in the regular UI, but it must not propose executable
actions that would return a raw token, API key, password, provider secret, or
session credential.
