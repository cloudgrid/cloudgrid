# Wave 06 Integration

Goal: prove the full AI Eval v1 flow with hermetic integration gates and final progress evidence.

Tickets:

- `TICKET-008`: AI Eval integration gates and evidence.

Start gate:

```sh
node /Users/sebastianwessel/.agents/skills/implementation-planner/references/check_wave_readiness.mjs . wave_06_integration plans specs
```

Completion gate:

```sh
bun run contracts:check
bun run typecheck
bun run test
go test -tags surrealdb ./core/go-runtime/... ./core/go-contracts/... ./core/otlp-collector/... ./core/control-plane/... ./core/storage-read/... ./core/storage-write/... ./core/ai-eval-runner/...
```
