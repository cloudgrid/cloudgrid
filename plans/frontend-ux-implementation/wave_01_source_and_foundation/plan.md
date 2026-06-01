# Wave 01 Source And Foundation

## End-to-End Outcome

The approved frontend source order is verified, stale UX planning cannot drive
implementation, and shared shell primitives exist for route agents.

## Implementation Order

1. Complete `TICKET-300` source-gate checks and readiness updates.
2. Complete `TICKET-301` shared shell, route frame, navigation, disabled-state,
   i18n, inspector, and dialog foundations.

## Parallelization

This wave is serial. `TICKET-301` consumes the source-gate proof from
`TICKET-300` and owns shared files that later route tickets must reuse.

## Resume And Status

Resume from `TICKET-300` while no proof exists in `_status.yaml`. After source
proof is recorded, resume from `TICKET-301`.

## Operational Path Coverage

Success path: source drift is clean and shared primitives render normal project
workspace routes. Failure path: stale Live route, MetricView, card-wrapped route
workspace, hard-coded copy, or missing disabled-state affordance blocks the
wave. Recovery path: update the owning source spec or shared primitive before
route work starts.

## NFR Operations And Supply Chain Coverage

Security and privacy remain frontend-only with no secret persistence.
Performance and resilience use independent scroll containers and bounded local
state. Observability/logging is limited to test evidence. Production/release
and supply chain are covered by typecheck, build, smoke, and no dependency
changes; SBOM/provenance impact is not applicable.
