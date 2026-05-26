# TICKET-205: BFF Bridge Response Validation Error Classification

Status: ready
Owner: bff-agent
Depends on: `TICKET-201`

## Goal

Make BFF bridge error classification honest so invalid decoded service replies
are reported as contract/validation failures rather than NATS outages.

## Read Scope

- `specs/06-nfr/service-resilience-self-healing.md`
- `specs/04-backend/backend-architecture.md`
- `specs/03-contracts/errors.yaml`
- `specs/03-contracts/messages/message-bridge.asyncapi.yaml`
- `apps/backend/src`
- `apps/packages/runtime`
- `apps/packages/definition`

## Write Scope

- `apps/backend/src`
- `apps/packages/runtime`
- `apps/packages/definition`
- focused backend tests
- `plans/service-resilience-hardening/_status.yaml`

## Implementation Approach

1. Locate BFF NATS response decoding and Zod validation failure mapping.
2. Add a distinct internal error class/event for response contract validation.
3. Preserve `MESSAGE_BRIDGE_UNAVAILABLE` only for actual NATS transport,
   connection, publish/request setup, and JetStream availability failures.
4. Classify no responders, closed connection, reconnecting, permission errors,
   timeout, malformed response envelope, and invalid response data separately.
5. Make BFF health prove connected/operational lifecycle state, not only
   `isClosed()`.
6. Ensure GraphQL subscription sink iterator failures close only the affected
   subscription and run best-effort storage-read stop cleanup.
7. Log validation issues with subject, request ID, and bounded issue paths, not
   raw response payloads.
8. Add regression coverage for the dashboard alert-array shape failure mode.

## Acceptance

- A decoded response with missing fields no longer maps to
  `MESSAGE_BRIDGE_UNAVAILABLE`.
- Actual NATS unavailable/timeout behavior is unchanged.
- Malformed response envelopes, invalid response data, and NATS transport
  failures have separate tests and logs.
- Live subscription iterator and stop-cleanup failures are bounded and do not
  leak the local async queue.
- GraphQL errors expose canonical problem details from the taxonomy.
- Backend tests prove both branches.

## Verification

```sh
bun test apps/backend/src
bun run typecheck
bun run contracts:check
```
