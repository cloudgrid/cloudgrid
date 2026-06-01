# Wave 01 Contract Adapter

## End-to-End Outcome

Public start/detail code accepts `skill_text_edit`, and the deterministic
harness adapter can return bounded skill edit proposals.

## Implementation Order

1. Run `TICKET-401` and `TICKET-402` in parallel.
2. Verify contracts and package tests.
3. Unblock storage and runner work.

## Parallel Safety

`TICKET-401` writes public TypeScript/BFF/client surfaces. `TICKET-402` writes
only harness adapter and skill fixture files.

## Isolation Notes

The tickets have disjoint write scopes and do not write generated contracts.

## Status Notes

Status: planned. Start both tickets in parallel.

## Path Coverage

Success path covers accepted public start and deterministic valid edit
proposal. Failure path covers invalid optimizer kind and invalid protected-file
edit proposal.

## NFR Operations Supply Chain Coverage

Security/privacy coverage is no-secret fixtures and bounded adapter responses.
Operations coverage is default deterministic execution. Supply-chain coverage is
no new dependencies.

## Tickets

- `TICKET-401`
- `TICKET-402`
