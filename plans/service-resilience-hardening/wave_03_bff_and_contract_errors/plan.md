# Wave 03: BFF And Contract Errors

Status: ready
Tickets: `TICKET-205`

## Goal

Make BFF bridge error reporting honest: malformed service replies are contract
or validation failures, not NATS transport outages.

## Exit Criteria

- Response validation failures have focused tests.
- Logs retain subject/path/request ID without raw payloads.
- Public GraphQL errors use the most specific taxonomy entry.
