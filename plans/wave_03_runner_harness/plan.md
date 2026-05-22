# Wave 03 Runner Harness

Goal: implement AI Eval orchestration and harness lifecycle after storage contracts exist.

Parallel group: `runner_harness_parallel`.

Tickets:

- `TICKET-004`: Runner AI Eval orchestration.
- `TICKET-005`: Harness adapter lifecycle.

Start gate:

```sh
node /Users/sebastianwessel/.agents/skills/implementation-planner/references/check_wave_readiness.mjs . wave_03_runner_harness plans specs
```

Completion gate:

```sh
go test -tags surrealdb ./core/ai-eval-runner/...
bun run --cwd apps/packages/cloudgrid-harness-adapter typecheck
bun test apps/packages/cloudgrid-harness-adapter
```
