# Wave 01 Contracts

Goal: make machine contracts and generated artifacts the fixed base for all implementation agents.

Tickets:

- `TICKET-001`: AI Eval contracts and drift gates.

Start gate:

```sh
node /Users/sebastianwessel/.agents/skills/implementation-planner/references/check_wave_readiness.mjs . wave_01_contracts plans specs
```

Completion gate:

```sh
bun run contracts:check
bun run --cwd apps/packages/ui-contracts typecheck
go test ./core/go-contracts/...
```
