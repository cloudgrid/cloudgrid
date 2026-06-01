# Wave 02 Standard Evidence Extraction

## End-to-End Outcome

Implement standard-first trace-to-evidence behavior for storage-read and runner
adapter orchestration. These tickets can run in parallel after wave 01.

## Implementation Order

1. Run `TICKET-302` and `TICKET-303` in parallel after `TICKET-301`.
2. Finish both tickets before starting wave 03.

## Isolation

`TICKET-302` writes only `core/storage-read`. `TICKET-303` writes only
`core/ai-eval-runner`. Shared contracts are read-only.

## Status And Resume

Status: planned. Resume with both tickets after wave 01 passes.

## Operational Path Coverage

Success path: standard GenAI/MCP/OpenInference/production spans produce bounded
evidence. Failure path: missing traces, delayed trace persistence, timeout,
cancellation, and unrecognized spans follow typed recovery paths.

Security/privacy, observability, performance, resilience, recovery, data
integrity, production, release, and supply chain coverage are assigned in the
two tickets; no new external dependency is introduced.

Tickets:

- `TICKET-302`
- `TICKET-303`
