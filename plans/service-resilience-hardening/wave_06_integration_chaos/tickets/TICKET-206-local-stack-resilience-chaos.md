# TICKET-206: Local-Stack Resilience And Chaos Integration Scenarios

Status: ready
Owner: integration-agent
Depends on: `TICKET-207`

## Goal

Prove resilience behavior against a real local CloudGrid stack and add opt-in
chaos coverage for destructive dependency failure scenarios.

## Read Scope

- `specs/06-nfr/service-resilience-self-healing.md`
- `specs/06-nfr/integration-test-suite.md`
- `plans/service-resilience-hardening/_status.yaml`
- `plans/service-resilience-hardening/wave_05_readiness_lifecycle/tickets/TICKET-207-readiness-startup-shutdown-lifecycle.md`
- `tooling`
- `apps/packages/integration-scenarios`
- Go service health tests

## Write Scope

- `tooling`
- `apps/packages/integration-scenarios`
- focused backend/integration tests
- focused Go tests where local-stack hooks need coverage
- `plans/service-resilience-hardening/_status.yaml`

## Implementation Approach

1. Extend local integration orchestration to observe service process exits,
   `/livez`, and `/readyz`.
2. Add stable scenarios for startup readiness and non-cascading health checks.
3. Add NATS stop/restart and SurrealDB stop/restart scenarios where the stack
   must degrade readiness, keep processes alive, and recover.
4. Add uncertain-write and duplicate-command scenarios for storage-write.
5. Add BFF response-contract validation scenarios for malformed service replies.
6. Add saturation scenarios for bounded queues, in-flight limits, and health
   checks under load.
7. Add opt-in chaos scenarios behind
   `CLOUDGRID_ENABLE_RESILIENCE_CHAOS_TESTS=true`.
8. Record evidence commands and observed recovery behavior in `_status.yaml`.

## Acceptance

- Default `bun run integration:local` covers stable degradation/recovery.
- Opt-in chaos tests skip with explicit reason unless the flag is set.
- With the flag set, destructive tests prove process survival or record a
  concrete blocker tied to a spec/implementation gap.
- Scenarios produce bounded diagnostic artifacts on failure instead of hanging.
- No test relies on one service calling another service's health endpoint.

## Verification

```sh
bun run integration:local
CLOUDGRID_ENABLE_RESILIENCE_CHAOS_TESTS=true bun run integration:local
```
