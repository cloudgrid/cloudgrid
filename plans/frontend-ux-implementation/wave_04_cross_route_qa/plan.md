# Wave 04 Cross-Route QA

## End-to-End Outcome

The migrated frontend passes the route matrix across desktop, tablet, and
mobile, with consistent navigation, copy, disabled states, keyboard behavior,
visual density, and forbidden-pattern checks.

## Implementation Order

1. Complete `TICKET-303` through `TICKET-308`, `TICKET-310`, and `TICKET-311`.
2. Run `TICKET-309` route matrix, screenshots, static scans, and smoke.
3. Assign route-owned defects back to the owning ticket status before closing
   final QA.

## Parallelization

This wave is serial because it validates the full route set and records final
evidence. It may run test commands concurrently outside source edits.

## Resume And Status

Resume from the first failed route matrix entry. Keep `_status.yaml` partial
with current proof until every route has passing evidence.

## Operational Path Coverage

Success path: all project workspace routes navigate and render in the approved
shell. Failure path: visual overlap, blocked keyboard path, raw string, stale
Live route, MetricView residue, card-in-card layout, or immediate destructive
action fails QA. Recovery path: the owning route ticket receives the defect and
QA reruns only the affected matrix entries.

## NFR Operations And Supply Chain Coverage

Security/privacy checks secret and token display constraints. Performance and
resilience checks layout stability, scrolling, and smoke behavior. Observability
and logging are covered through test artifacts and route evidence. Production
and release use build and smoke results; supply-chain, SBOM, and provenance are
not applicable without dependency or release workflow changes.
