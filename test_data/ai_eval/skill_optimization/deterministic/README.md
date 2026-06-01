# Deterministic Skill Optimization Fixture

This fixture pack is for hermetic skill optimization tests. It contains a small
agent skill package, a manifest preview, and split JSONL rows that can be used
without live model calls or secrets.

The deterministic harness adapter returns one protected-file edit proposal for
runner rejection tests and one valid proposal that edits `SKILL.md` and
`references/escalation.md`.

Run the hermetic scenario with:

```sh
bun run --cwd apps/packages/integration-scenarios test
bun tooling/scripts/integration-local.mjs
```

The manifest preview includes bounded file content so the runner can build an
editable skill package snapshot. It intentionally marks `scripts/**` as
protected.
