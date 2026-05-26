# Wave 06: Integration And Chaos

Status: ready
Tickets: `TICKET-206`

## Goal

Prove resilience against a real local stack and add opt-in destructive chaos
coverage.

## Exit Criteria

- `bun run integration:local` covers stable readiness degradation/recovery.
- `CLOUDGRID_ENABLE_RESILIENCE_CHAOS_TESTS=true bun run integration:local`
  covers destructive restart/partition/panic scenarios or records explicit
  blocked gaps.
- Status evidence documents commands and observed behavior.
