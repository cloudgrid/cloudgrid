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
- failure cases for invalid expected JSON and adapter timeout.

Default fixtures are hermetic. External adapter execution is opt-in by pointing
the runner at an adapter with `CLOUDGRID_AI_EVAL_HARNESS_URL`.
