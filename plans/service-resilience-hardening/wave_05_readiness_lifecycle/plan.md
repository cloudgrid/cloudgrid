# Wave 05: Readiness And Lifecycle

Status: ready
Tickets: `TICKET-210`, `TICKET-207`

## Goal

Align Go health/config safety first, then startup dependency behavior,
readiness semantics, and shutdown ordering across BFF and Go services after the
adapter-level resilience work is in place.

## Exit Criteria

- `/livez` remains process-only for every service.
- `/readyz` checks only local dependencies and uses operational dependency
  checks.
- Go health check execution is bounded, config-driven, and panic-safe.
- Startup dependency mode is explicit and tested.
- Shutdown is ordered, bounded, and idempotent.
