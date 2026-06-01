# Wave 03 Frontend Integration

## End-to-End Outcome

Users can inspect skill optimization detail in the UI, integration scenarios
prove deterministic harness execution, and manual real-LLM example data is
available outside automated integration.

## Implementation Order

1. Run `TICKET-405` and `TICKET-406` in parallel after runner skill optimization
   passes.
2. Run full contract, type, Go, frontend, website, and integration checks.

## Parallel Safety

Frontend rendering and integration/example fixtures write disjoint scopes.

## Isolation Notes

`TICKET-405` writes frontend only. `TICKET-406` writes integration, tooling,
example data, and handbook docs only.

## Status Notes

Status: planned. Resume after `TICKET-404`.

## Path Coverage

Success path covers visible accepted candidate and executable deterministic
scenario. Failure path covers disabled promotion and rejected edits. Manual
real-LLM data is documented as a non-automated operator path.

## NFR Operations Supply Chain Coverage

Security/privacy coverage is no secrets in example data. Operations coverage is
deterministic automated integration plus manual real-LLM instructions.
Supply-chain coverage is no new dependency.

## Tickets

- `TICKET-405`
- `TICKET-406`
