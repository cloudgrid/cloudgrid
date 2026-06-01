# Wave 03 Route Workspaces

## End-to-End Outcome

Traces, trace detail, Logs, Metrics, Dashboards, AI Chat, AI Eval, and Alerts
use the same flat product shell, route frame, URL-state rules, inspector
grammar, empty states, disabled states, and responsive behavior.

## Implementation Order

1. Start `TICKET-303` through `TICKET-308`, `TICKET-310`, and `TICKET-311`
   after `TICKET-302` is complete.
2. Keep route-owned tests and screenshots with each ticket.
3. Send cross-route defects to `TICKET-309` only after the owning route ticket
   has no remaining route-local work.

## Parallelization

Route tickets are parallel work. Write scopes are isolated by route and feature
folder: traces, trace detail, logs, metrics, dashboards, AI Chat, AI Eval, and Alerts. Shared
primitives come from `TICKET-301`; project context comes from `TICKET-302`.

## Resume And Status

Resume each route ticket independently. Record per-route current proof,
screenshots, and partial status in `_status.yaml` before handoff.

## Operational Path Coverage

Success path: each route renders populated data and primary actions in place.
Failure path: GraphQL errors, denied actions, feature disabled states, empty
data, filtered empty data, and backend unavailable states are visible and
actionable. Recovery path: filters can be cleared, retries are available on
load failures, and URL state restores selected rows or spans.

## NFR Operations And Supply Chain Coverage

Security/privacy keeps frontend state presentation-only and project-scoped.
Performance/resilience covers virtualized or bounded tables, stable panes, and
independent scroll containers. Observability/logging uses route test and smoke
evidence. Data integrity/recovery covers URL state, discard confirmation, and
read-only built-ins. Production/release uses build and smoke; supply-chain and
SBOM/provenance are not applicable without dependency changes.
