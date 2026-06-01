# Wave 02 Services

## End-to-End Outcome

Storage can persist/read skill optimization detail, and runner can execute the
bounded deterministic skill text edit loop.

## Implementation Order

1. Complete `TICKET-403` after public start/detail shapes are aligned.
2. Complete `TICKET-404` after storage and harness adapter support exists.

## Parallel Safety

Storage and runner write scopes are separate, but runner depends on storage
ports and persistence behavior, so this wave runs sequentially.

## Isolation Notes

`TICKET-403` writes storage services only. `TICKET-404` writes runner only after
storage behavior exists.

## Status Notes

Status: planned. Resume after wave 01 passes.

## Path Coverage

Success path covers accepted candidate persistence. Failure path covers invalid
edit rejection and test-split exclusion. Recovery path covers missing trace
evidence exclusion.

## NFR Operations Supply Chain Coverage

Security/privacy coverage is bounded evidence and no raw trace dumps. Operations
coverage is idempotent runner/storage behavior. Supply-chain coverage is no new
dependencies.

## Tickets

- `TICKET-403`
- `TICKET-404`
