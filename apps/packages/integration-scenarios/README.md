# @cloudgrid/integration-scenarios

Typed endpoint coverage registry and reusable scenario metadata for CloudGrid integration tests.

Scenario execution can live in local runners, but every frontend-used public endpoint should be covered by one or more scenario IDs declared here.

## AI Eval v2 Fixtures

`aiEvalV2ScenarioFixtures` describes the required dataset evaluation and
optimization quick-shot paths:

- schema-defined dataset creation;
- staged import preview and commit;
- manual ready row append;
- evaluation definition and run start;
- run detail and comparison evidence;
- optimization quick-shot progress and explicit promotion;
- failure cases for invalid expected JSON and adapter timeout;
- classification prompt optimization using
  `test_data/ai_eval/classification`;
- extraction prompt optimization using `test_data/ai_eval/extraction`;
- `PromptOptimizationStep` evidence, family diagnosis, prompt/example diffs,
  rejected candidates, external-adapter `candidateTargetContentMode` preflight,
  and explicit promotion gates.
- external-adapter skill optimization with async completion, output refs, W3C
  trace linking, and standard OTLP evidence.
- executable `skill_text_edit` optimization with protected edit rejection,
  validation-backed accepted skill edits, skill detail reads, and explicit
  promotion readiness.

Default fixtures are hermetic. External-adapter behavior in automated
integration tests is exercised only through the CloudGrid AI harness adapter
configured by `CLOUDGRID_AI_EVAL_HARNESS_URL`. That adapter returns predictable
LLM-like outputs, timeouts, and optimization proposals; integration tests must
not call live model providers.

The classification and extraction fixture packs each include public GraphQL
dataset settings, JSONL rows, a weak baseline prompt target, baseline examples,
and expected optimizer behavior. They are intentionally small enough for local
try-it runs but include enough training and validation coverage to exercise
classification confusion repair and extraction weak-field repair.

`aiEvalStandardTraceFixtures` provides deterministic standard-first adapter
traces for OTel GenAI, OTel MCP, OpenInference, and ordinary HTTP, database, and
exception failure spans. The fixtures assert that source spans do not carry
`cloudgrid.ai.semconv.flavor` unless the explicit legacy fixture emitted it.

## Skill Optimization E2E

The deterministic skill optimization scenario is part of the normal package
test suite:

```sh
bun run --cwd apps/packages/integration-scenarios test
```

The local integration runner also executes it through public GraphQL when the
local stack is running:

```sh
bun tooling/scripts/integration-local.mjs
```

The fixture data lives in
`test_data/ai_eval/skill_optimization/deterministic`. It contains no secrets and
uses the local deterministic harness.

Automated integration scenarios never call real model providers. Manual
real-LLM fixture data lives in `test_data/ai_eval/manual_real_llm` for
classification/extraction and `test_data/ai_eval/skill_optimization/real-llm`
for skill optimization. Those packs are for operator-driven testing outside this
package's integration runner. Do not add API keys or provider secrets to those
directories.
