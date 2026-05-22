# Wave 05 Frontend

Goal: implement AI Eval user workflows from GraphQL view models without frontend-owned telemetry or scoring truth.

Tickets:

- `TICKET-007`: Frontend AI Eval workspace.

Start gate:

```sh
node /Users/sebastianwessel/.agents/skills/implementation-planner/references/check_wave_readiness.mjs . wave_05_frontend plans specs
```

Completion gate:

```sh
bun run --cwd apps/frontend typecheck
bun run --cwd apps/frontend build
bun run --cwd apps/frontend test
```
