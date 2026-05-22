# Wave 04: Rich Metric Gate

Status: ready after `TICKET-102`, `TICKET-103`, and `TICKET-104`
Tickets: `TICKET-107`

## Goal

Verify and enforce the rich metric production gate after the dashboard UI has
been decomposed. This wave does not enable rich metric creation/editing.

## Exit Criteria

- Production UI hides rich metric creation/editing.
- Saved rich widgets render read-only or unsupported-contract states.
- Tests prove the gate remains closed until the full contract/storage/BFF/frontend
  implementation gate passes.
