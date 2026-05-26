# Wave 02 Storage

Goal: implement AI Eval persistence and read semantics behind the approved message bridge contracts.

Parallel group: `storage_parallel`.

Tickets:

- `TICKET-002`: Storage-write AI Eval persistence.
- `TICKET-003`: Storage-read AI Eval query semantics.

Start gate:

```sh
node /Users/sebastianwessel/.agents/skills/implementation-planner/references/check_wave_readiness.mjs . wave_02_storage plans specs
```

Completion gate:

```sh
go test -tags surrealdb ./core/storage-write/... ./core/storage-read/...
```
