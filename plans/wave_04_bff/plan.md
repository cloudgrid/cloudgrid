# Wave 04 BFF

Goal: expose AI Eval GraphQL behavior through BFF validation and NATS bridge calls only.

Tickets:

- `TICKET-006`: BFF AI Eval GraphQL bridge.

Start gate:

```sh
node /Users/sebastianwessel/.agents/skills/implementation-planner/references/check_wave_readiness.mjs . wave_04_bff plans specs
```

Completion gate:

```sh
bun test --coverage apps/backend/src
bun run contracts:check
```
