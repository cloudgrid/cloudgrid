---
id: CAP-AIE-011
title: Optimize skill documents
domain: ai-eval
layer: capability
status: approved
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-31
provenance: user-directed
traits:
  interaction: http
  sync_async: async
  visibility: user
  authentication: prepared
depends_on: [DOM-006, CAP-AIE-003, CAP-AIE-004, ADR-0006, ADR-0007]
implements:
  api: [GQL-Mutation-startOptimizationRun, MSG-eval-optimization-start]
---

# Optimize Skill Documents

## Business Intent

Let teams improve reusable agent or workflow skills from evaluation evidence
without fine-tuning model weights, changing production code, or adopting an
external optimizer runtime.

The user-facing outcome is a reviewed, validation-backed skill artifact that can
be promoted like any other target snapshot.

## Rationale

This capability adapts the durable idea behind Microsoft SkillOpt: treat a
natural-language skill package as trainable text state, execute fixed-target
rollouts, reflect on scored trajectories, apply a bounded number of text edits,
and accept candidates only through held-out validation. CloudGrid does not embed
SkillOpt, Python, or benchmark-specific code. It implements the pattern through
CloudGrid datasets, evaluation runs, target snapshots, message contracts,
storage services, harness adapter calls, and explicit promotion.

CloudGrid skill artifacts follow the agent-skill package shape used by modern
agent platforms: a directory with a required `SKILL.md` entrypoint plus optional
references, examples, scripts, assets, dependency manifests, and runtime
fixtures. The optimizer may edit only declared editable package files. The
runtime may execute scripts and read lazily loaded references according to the
target harness, but CloudGrid does not flatten the package into one prompt.

## Required Behavior

- Skill optimization is an `OptimizationRun` with
  `searchPolicy.optimizerKind = skill_text_edit`.
- The baseline target snapshot must contain exactly one editable
  `TargetPartSnapshot.partKind = skill` package unless the start request
  explicitly selects a supported skill package by `partRef`.
- The selected skill package must have a manifest with:
  - required `entrypoint = SKILL.md`;
  - package file inventory with digest, byte size, and role for every file;
  - declared editable file globs;
  - declared protected file globs;
  - runtime requirements needed by the harness;
  - optional script entrypoints and dependency manifests.
- The package must not contain secrets, provider credentials, unbounded logs,
  local machine paths, or production-only side effects.
- The target model, provider alias, harness, tools, workflow code, and external
  adapter endpoint remain frozen during skill optimization.
- The runner may change only selected editable package files through bounded
  structured edits: `append`, `insert_after`, `replace`, and `delete`.
- `SKILL.md` is always editable unless the manifest marks it protected. Reference
  files and examples are editable only when they match
  `skillPolicy.editableFileGlobs`. Scripts, dependency manifests, binary assets,
  generated files, and runtime fixtures are read-only unless a later spec
  explicitly allows their mutation.
- Every accepted candidate is a new immutable `TargetSnapshot` with a new
  `skill` package digest and per-file digests.
- The runner must evaluate every candidate through normal `EvaluationRun`
  records on the configured validation split.
- A candidate is accepted only when the configured gate metric strictly
  improves the current gate score and all hard constraints pass.
- Rejected edits become run-local negative feedback and must not be exported as
  deployable skills.
- The final best skill is exported as a target snapshot and, when
  `skillPolicy.exportBestSkill = true`, as a package artifact referenced from
  `SkillOptimizationDetail.exportedSkillContentRef`.
- Promotion uses `promoteTargetSnapshot`; CloudGrid never auto-promotes.

## Runtime Setup Model

End users configure runtime once at the target or evaluation level. The
optimization flow reuses that runtime without asking users to write adapter
payloads.

There are two runtime modes.

### Managed Harness Runtime

Use the managed CloudGrid AI harness adapter when the skill can be evaluated by
sending the dataset input, selected skill package text, model alias, and
allowed CloudGrid-supported tool declarations through the project-configured
CloudGrid harness.

This mode is intended for:

- skills that do not require customer-specific MCP servers;
- skills that do not require a business filesystem or repository checkout;
- skills that do not require private application state outside the dataset row;
- skills whose tools can be simulated, disabled, or represented by deterministic
  fixtures in the CloudGrid harness.

In this mode the managed harness adapter owns AI execution and OTLP emission.
CloudGrid owns orchestration, item-run persistence, metric execution, optimizer
evidence construction, candidate selection, gates, diffs, and promotion.

### External Business Context Adapter Runtime

Use an external adapter when the skill needs the customer environment to be
meaningful: MCP tools, proprietary APIs, files/folders, repositories, business
rules, permissions, workflow state, or enterprise systems that CloudGrid must
not replicate.

In this mode CloudGrid does not host the runtime. The user provides a
project-approved adapter URL/profile that implements the CloudGrid evaluation
adapter interface. CloudGrid sends dataset item input, target snapshot refs,
candidate skill package refs, run metadata, content policy, and W3C trace
context. The adapter executes the skill in the customer environment and reports
progress through the async adapter protocol.

External business context adapters must emit OTLP traces to CloudGrid for
optimization-grade evidence. Adapter HTTP responses are control-plane responses:
start accepted, status polling, cancellation, terminal status, small
`actualOutput` or `actualOutputRef`, bounded problem details, usage/cost/timing,
and a root trace/span reference. They must not be the primary carrier for
tool/MCP/file step evidence.

CloudGrid must not require customer runtimes to add CloudGrid-specific span
attributes when standard conventions can express the same fact. External adapter
traces are accepted when they satisfy these minimal requirements:

- the adapter preserves the W3C `traceparent`/`tracestate` context CloudGrid
  sends for the item run, or returns the produced `traceId` and `rootSpanId` in
  the terminal control response;
- model calls use OTel GenAI semantic conventions when available;
- MCP calls use OTel MCP semantic conventions when available;
- existing OpenInference attributes are accepted for AI, tool, and retriever
  spans;
- ordinary business calls keep their production instrumentation such as HTTP,
  RPC, database, messaging, filesystem, exception, and service/resource
  conventions.

CloudGrid derives optimizer evidence using standard span semantics first:

1. OTel GenAI and OpenInference agent/LLM/tool/retriever spans become AI
   projections and high-signal important steps.
2. OTel MCP spans become tool/resource important steps when they are inside the
   item trace.
3. Standard HTTP, RPC, database, messaging, filesystem, and exception spans may
   contribute bounded context and failure summaries when the adapter profile
   marks them as optimizer-relevant.
4. Custom adapter attributes are optional extensions only. They must never be
   required when a standard semantic convention or adapter control field can
   represent the same information.

Artifact refs belong in the terminal adapter response or in standard span
events/links when the customer already emits them. They do not inline files.
CloudGrid stores full trace detail only through the telemetry pipeline.
Optimizer prompts receive normalized evidence and refs derived by storage-read,
not raw full traces or environment dumps.

The execution adapter and optimizer adapter are separate responsibilities. A
customer adapter is required to execute the target in complex runtime mode, but
it does not need to generate skill edits. CloudGrid can still run the optimizer
loop from normalized evidence. A custom optimizer endpoint is optional only when
the project wants customer-owned reflection/merge/rank behavior.

The required user-facing runtime setup is:

- **Skill package**: upload, connect, or select a package with `SKILL.md`,
  optional references/examples/scripts, and a generated manifest preview.
- **Runtime mode**: select `Managed CloudGrid harness` for simple skills or
  `External business context adapter` for skills that need customer tools,
  MCP, files, repositories, or business state.
- **Runtime connector**: for adapter mode, select a project-defined enterprise
  connector. The connector declares supported skill package formats, script
  execution support, evidence capabilities, trace export support, environment
  variables, and timeout limits through adapter capabilities.
- **Model/tool profile**: select the model alias and allowed tools/workflow
  binding used for all baseline, candidate, validation, and final test runs.
- **Environment profile**: select a named project environment containing
  non-secret configuration. Secret values stay in the runtime connector or
  project secret store and are never embedded in skill packages, datasets,
  traces, optimizer evidence, or exported artifacts.
- **Execution command or entrypoint**: for custom harnesses, select a
  project-approved command/profile such as `run_customer_support_skill`. Users
  do not paste arbitrary shell commands into the optimization wizard.

The setup screen must validate the runtime with a dry-run capability check
before optimization can start. The dry run verifies package readability,
`SKILL.md` parsing, declared script availability, dependency lock presence when
required, model/tool profile resolution, adapter authentication when applicable,
trace propagation, OTLP ingestion, standard semantic-convention coverage, and
terminal status polling.

## Test Data And Trace Setup Model

Users should be able to create useful evaluation data by three paths:

- **Manual examples**: add task input and expected result/rubric rows in a
  dataset.
- **Trace-derived examples**: select traces or spans from CloudGrid telemetry,
  preview extracted task input, observed output, tool steps, and expected result
  candidates, then commit reviewed dataset rows.
- **Import**: upload CSV/JSONL/ZIP test packs that map to the dataset schema and
  optional trace refs.

Trace and flow data are not a separate optimizer-specific artifact. They become
normal dataset rows, candidate rows, item-run trace refs, trajectory summaries,
and bounded important steps. This keeps the workflow easy for users and keeps
storage-read responsible for trace detail and optimization evidence views.

For external adapters, trace and flow data enter CloudGrid through OTLP emitted
by the adapter during evaluation runs. The HTTP adapter response may include the
terminal actual output or output ref, but optimizer-relevant step evidence comes
from traces.

The optimizer evidence builder always consumes the normalized storage-read view:
actual output or output ref, metric results, problems, important steps derived
from OTLP spans, trajectory summary, trace/span refs, and artifact refs. It must
not scrape adapter logs, call customer systems directly, or require access to
the customer's file tree.

The dataset setup screen must make split readiness explicit:

- training rows teach the optimizer where the current skill succeeds or fails;
- validation rows decide whether a candidate skill is accepted;
- test rows are reserved for the final unbiased check;
- CloudGrid may suggest a split but must show leakage warnings before start.

## Evidence Rules

- Training reflection may use training split input, expected value, actual
  output, metric problems, bounded important steps, bounded trajectory
  summaries, trace/span refs, and artifact refs whose content policy allows
  optimizer use.
- Success and failure evidence are reflected separately before merging so the
  optimizer can preserve working behavior while correcting recurring failures.
- Validation split execution may produce normal item/run evidence, but
  validation row content and validation trajectories must not be fed into later
  reflection prompts, rejected-edit buffers, slow update, or meta memory.
- Test split rows must never be used for candidate generation, reflection,
  rejected-edit feedback, slow update, or meta memory.
- Hidden chain-of-thought must not be requested, inferred, stored, or sent to
  the optimizer adapter.

## Default Search Policy

- `maxEpochs`: 4.
- `rolloutBatchSize`: 40 or all eligible training rows when fewer than 40
  exist.
- `reflectionMinibatchSize`: 8.
- `editBudget`: 4.
- `minEditBudget`: 2.
- `editSchedule`: `cosine`.
- `gateMode`: `strict_improvement`.
- `selectionSplit`: `validation`.
- `allowSlowUpdate`: true.
- `allowMetaMemory`: true.
- `skillPolicy.maxPackageBytes`: 262144.
- `skillPolicy.maxSkillBytes`: 65536 for the model-visible entrypoint and
  editable text loaded into optimizer context.
- `skillPolicy.maxSkillTokens`: 8000 for optimizer-visible text.
- `skillPolicy.allowedEditOps`: `append`, `insert_after`, `replace`, `delete`.
- `skillPolicy.editableFileGlobs`: `["SKILL.md", "references/**/*.md",
  "examples/**/*.md"]`.
- `skillPolicy.protectedFileGlobs`: `["scripts/**", "**/*.lock",
  "**/*.{png,jpg,jpeg,gif,webp,pdf,zip,tar,gz}"]`.
- `skillPolicy.allowScriptEdits`: false.
- `skillPolicy.exportBestSkill`: true.

## Acceptance Criteria

- Starting a skill optimization without a valid target snapshot skill package
  fails before any harness call.
- Starting with a package that lacks `SKILL.md`, has an invalid manifest, exceeds
  package size limits, references undeclared runtime requirements, or marks no
  editable files fails before any optimizer call.
- A training step persists proposed edits, selected edits, candidate snapshot,
  validation result, gate decision, and rejection summary when rejected.
- A validation-rejected candidate is visible in optimization detail but cannot
  be promoted.
- A user can inspect package-level and file-level diffs for the best skill and
  promote the selected target snapshot explicitly.
- Any request that uses `test` for reflection, candidate generation, slow
  update, or meta memory fails before execution.
- Oversized package or file candidates fail with a bounded problem and do not
  start validation.

## Verification

- Contract tests cover `OptimizationSearchPolicyInput`,
  `optimizerKind = skill_text_edit`, `TargetPartKind.skill`, and
  `SkillOptimizationDetail`.
- Runner tests cover preflight failure without a skill part, strict validation
  gate rejection, rejected-edit memory truncation, test-split exclusion, and
  best-skill artifact export.
- Frontend route tests cover the skill search controls, accepted/rejected step
  timeline, Markdown diff, disabled promotion without validation evidence, and
  explicit promotion.
- End-to-end scenarios cover deterministic skill optimization through public
  entrypoints using the CloudGrid AI harness adapter. Automated integration
  scenarios must not call live model providers. Manual real-LLM test data must
  be checked in separately so operators can run the same user workflow against
  a configured provider outside CI.
