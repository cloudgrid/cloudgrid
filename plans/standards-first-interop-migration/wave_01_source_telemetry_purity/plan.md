# Wave 01 Source Telemetry Purity

## End-to-End Outcome

Remove CloudGrid-owned semantic attributes from customer source telemetry while
preserving derived AI projection metadata.

## Implementation Order

1. Complete `TICKET-301`.

## Isolation

Only the collector agent writes `core/otlp-collector`. No parallel implementation
work starts until this ticket passes.

## Status And Resume

Status: planned. Resume at `TICKET-301`.

## Operational Path Coverage

Success path: OTel GenAI/OpenInference spans still create AI projections.
Failure path: non-AI spans remain generic telemetry and source attributes stay
unchanged.

Security/privacy, observability, recovery, data integrity, production, release,
and supply chain coverage are handled in `TICKET-301`; no new dependencies or
release artifacts are introduced.

Tickets:

- `TICKET-301`
