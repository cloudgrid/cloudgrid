# Wave 02: Frontend Parallel Work

Status: ready after `TICKET-101`
Tickets: `TICKET-102`, `TICKET-103`, `TICKET-104`

## Goal

Split route, editor, and renderer work across disjoint write scopes after the
foundation modules exist.

## Parallelism

These tickets may run in parallel after `TICKET-101`:

- `TICKET-102`: route modes, save, discard, conflict flow.
- `TICKET-103`: shared Metrics controls and widget editors.
- `TICKET-104`: widget source mappers and renderers.

## Exit Criteria

- Route file consumes foundation modules.
- Metric controls are shared with `/metrics`.
- Renderers and mappers are outside the route.
