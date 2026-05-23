# TICKET-201: Resilience Taxonomy And Implementation Contracts

Status: ready
Owner: resilience-contract-agent

## Goal

Verify and, if necessary, update specs/contracts so implementation agents do
not invent failure classification, retry behavior, health semantics, or error
mapping.

## Read Scope

- `specs/spec.md`
- `specs/00-conventions.md`
- `specs/04-backend/backend-architecture.md`
- `specs/04-backend/runtime-configuration.md`
- `specs/06-nfr/service-resilience-self-healing.md`
- `specs/06-nfr/reliability-ingest-failure.md`
- `specs/03-contracts/errors.yaml`
- `specs/03-contracts/messages/message-bridge.asyncapi.yaml`
- `.agent/IMPLEMENTATION.md`

## Write Scope

- `specs/06-nfr/service-resilience-self-healing.md`
- `specs/04-backend/runtime-configuration.md`
- `specs/03-contracts/errors.yaml`
- `specs/_registry.yaml`
- `specs/spec.md`
- `plans/service-resilience-hardening/_status.yaml`

## Implementation Approach

1. Audit `errors.yaml` for whether bridge response contract drift can be
   represented without using `MESSAGE_BRIDGE_UNAVAILABLE`.
2. If an existing error code is sufficient, document the mapping in
   `service-resilience-self-healing.md`.
3. If no existing code is sufficient, update `errors.yaml` and dependent specs
   before any implementation ticket proceeds.
4. Confirm retryable/non-retryable semantics for `ERR-006`, `ERR-013`,
   `ERR-014`, validation failures, and response contract validation failures.
5. Update `_status.yaml` with the taxonomy decision and verification evidence.

## Acceptance

- Every implementation ticket can cite explicit spec behavior for panic
  recovery, NATS reconnect, SurrealDB reconnect, readiness, shutdown, and BFF
  response validation mapping.
- No ticket needs phrases like "decide retry behavior" or "choose error code".
- `node /Users/sebastianwessel/.agents/skills/spec-architect/scripts/check_specs.mjs specs` passes or the status file records a concrete checker blocker.
- `bun run contracts:check` runs if `errors.yaml` or generated contracts change.

## Verification

```sh
node /Users/sebastianwessel/.agents/skills/spec-architect/scripts/check_specs.mjs specs
bun run contracts:check
```
