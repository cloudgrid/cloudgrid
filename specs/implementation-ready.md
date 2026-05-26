---
id: IDX-002
title: Implementation-ready feature and improvement index
layer: foundation
status: active
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-24
provenance: user-directed
---

# Implementation-Ready Feature And Improvement Index

This index lists work that is specified enough for agents to implement without
inventing product behavior. Each item points to the source specs that own the
contract, expected write scope, acceptance evidence, and verification gates.

Implementation agents must still read the linked source specs before editing
code. If an implementation detail is missing from the linked specs, update the
source spec first instead of expanding behavior locally.

## Implementation Status

Status values:

- `complete`: required implementation and verification evidence are present.
- `partial`: implementation has landed for part of the required scope, but the
  listed acceptance evidence is not complete.
- `blocked-by-environment`: repository code exists, but completion requires an
  external deployment, release run, or benchmark target.
- `not-started`: no implementation has landed for this index item in the
  current completion pass.

| Item | Status | Current evidence | Remaining implementation requirements |
| --- | --- | --- | --- |
| IR-001 | partial | SurrealDB retention client, startup wiring, query builders, schema/readiness, storage-read soft-delete filters, storage-write soft-delete fields, and opt-in adapter tests exist. `go test ./core/storage-maintenance/...` and `go test -tags surrealdb ./core/storage-maintenance/...` pass. | Complete live SurrealDB tests for every executable data class, cover soft delete/final delete, dry-run mutation checks, and lease contention/reacquire. |
| IR-002 | complete | `control.projects.list_for_service`, alert evaluator discovery mode/startup validation, webhook/email dispatch adapters, notification adapter catalog validation, typed alert dashboard widgets, `Query.alertSummary(projectId,input)`, public API/integration scenario coverage, and dashboard UI rendering exist. `bun run contracts:check`, `bun run typecheck`, targeted BFF/frontend tests, and `go test -tags surrealdb ./core/control-plane/... ./core/alert-evaluator/...` pass. | None for the alert execution package. |
| IR-003 | complete | Collector local/deployed bearer routing and sanitized auth failures exist; control-plane final-admin safeguards exist; storage-read fails closed for SSO read/live scopes and tenant mismatch; storage-write rejects deployed ingest commands without collector-authorized tenant/company/project routing; BFF GraphQL HTTP, WebSocket, and protected app shell coverage exists. `bun test apps/backend/src/static.test.ts apps/backend/src/auth.test.ts apps/backend/src/graphql-ws.test.ts` and `go test -tags surrealdb ./core/otlp-collector/... ./core/storage-read/... ./core/storage-write/... ./core/control-plane/...` pass. | None for deployed-mode auth hardening. |
| IR-004 | blocked-by-environment | Benchmark commands, sizing/release docs, and benchmark JSON release identity fields exist. Production profiles require `CLOUDGRID_BENCH_DEPLOYMENT_PROFILE=production-like`, `CLOUDGRID_BENCH_ENVIRONMENT_ID`, and `CLOUDGRID_BENCH_IMAGE_TAG`. `bun test tooling/scripts/bench.test.mjs` passes. | Run production benchmark commands against the exact deployment being promoted and store the JSON evidence with release identity, thresholds, and pass/fail status. |
| IR-005 | complete | AI provider and AI Chat generated metadata, BFF bridge/resolvers, validation, integration scenario coverage, and contract drift checks are present. `bun run contracts:check` passes. | None for the contract wave. Runtime/UI execution remains IR-006. |
| IR-006 | partial | `/ai-chat` route, project navigation, provider status/history/conversation reads, safe artifact previews, server-issued action approval UI, company AI provider admin route, company provider update client mutation, BFF SSE stream endpoint, ordered terminal stream events, abort cleanup, public API stream client helper, follow-up prompt streaming UI, durable run create/update/finalize contracts, control-plane run idempotency, tests, and handbook docs are present. `bun run contracts:check`, `bun run typecheck`, targeted BFF/frontend tests, and `go test -tags surrealdb ./core/control-plane/...` pass. | Complete AI Elements/json-render component integration and the project provider profile/model-alias management surface at `/projects/:projectId/settings/ai-providers`. |
| IR-007 | complete | No dedicated `core/log-ingest` service is specified for this wave; the collector still serves `POST /v1/logs`, publishes `telemetry.ingest.logs`, and storage-write receives the existing durable log command contract. | None unless a future backend ingestion wave explicitly introduces `core/log-ingest`. |
| IR-008 | complete | Website handbook now covers Helm install, external NATS/SurrealDB, image customization, private registry/air-gapped installs, release verification, upgrade/rollback, and sizing. `bun run --cwd website build` passes. | None for documentation scope. Environment-specific values and verified release assets are produced outside the docs pass. |
| IR-009 | partial | Shared Go OTLP trace/log exporter now supports per-signal toggles, bounded sanitized log records, trace/span IDs, severity numbers, observed timestamps, log scope naming, dropped-buffer metrics, rate-limited exporter failure warnings, and sanitization tests. AI-eval runner now wires exporter startup, NATS handler spans/failure logs, and shutdown flush. `go test -tags surrealdb ./core/go-runtime/... ./core/otlp-collector/... ./core/control-plane/... ./core/storage-read/... ./core/storage-write/... ./core/ai-eval-runner/...` passes. | Complete full-service log event coverage evidence across BFF, collector, control-plane, storage-read, storage-write, and AI-eval runner, plus normal Logs UI inspection evidence for the self-observability project. |
| IR-010 | complete | AI Eval v2 product, backend, frontend, NFR, GraphQL, AsyncAPI, entity schema, generated TypeScript, generated Go, BFF foundation, storage-write persistence, storage-read query semantics, runner orchestration, frontend workspace, integration fixtures, docs, runtime v2 dataset shape normalization, and browser/API acceptance are aligned. `plans/ai-eval-v2-migration` is complete through `TICKET-206`, and `bun run contracts:check`, `bun run typecheck`, focused BFF/frontend/integration tests, Go workspace tests, website build, spec check, plan lint, skills check, and Playwright AI Eval smoke pass. | None for the AI Eval v2 migration scope. |

## IR-001: Production SurrealDB Retention Adapter

Goal: enable storage-maintenance to execute retention deletion against the real
SurrealDB telemetry schema while preserving project isolation.

Source specs:

- [Project data retention policy](./04-backend/data-retention-policy.md)
- [Data retention NFR](./06-nfr/data-retention-local.md)
- [SurrealDB persistence](./04-backend/surrealdb-persistence.md)
- [Telemetry query semantics](./04-backend/telemetry-query-semantics.md)

Write scope:

- `core/storage-maintenance`
- `core/storage-read/internal/adapters/surrealdb`
- storage-maintenance SurrealDB schema/readiness files
- website retention pages

Required implementation:

- SurrealDB-backed `RetentionStore`, `AuditStore`, and `LeaseStore`.
- `retention_lease` and `retention_audit` schema and readiness checks.
- Data-class table mapping, deletion order, soft-delete fields, final-delete
  behavior, dry-run counts, and batch limit semantics exactly as specified.
- Storage-read `deletedAt = NONE` filters for every soft-delete-capable table.
- Opt-in SurrealDB integration tests behind
  `CLOUDGRID_ENABLE_SURREALDB_RETENTION_TESTS=true`.

Acceptance:

- hard delete removes dependent rows without crossing project boundaries;
- soft delete hides rows from normal GraphQL/storage-read queries;
- final delete removes only due soft-deleted rows;
- dry run returns counts without mutating target data;
- leases block concurrent execution and are reacquired after expiry;
- one audit row is written for every attempted batch.

Verification:

```sh
go test ./core/storage-maintenance/...
go test -tags surrealdb ./core/storage-read/... ./core/storage-maintenance/...
bun run contracts:check
```

## IR-002: Production Alert Execution Completion

Goal: make alerting production-executing by replacing explicit project-ID-only
scheduling with service project discovery and adding production notification and
dashboard alert surfaces.

Source specs:

- [Project alerting](./04-backend/alerting.md)
- [Control plane and project management](./04-backend/control-plane.md)
- [Dashboard widgets](./05-frontend/dashboard-widgets.md)
- [Logs, metrics explorer, and dashboards UX concept](./05-frontend/logs-metrics-dashboards-ux-concept.md)

Write scope:

- `core/alert-evaluator`
- `core/control-plane`
- `apps/backend`
- `apps/frontend`
- `apps/packages/definition`
- `apps/packages/ui-contracts`
- `core/go-contracts`
- website alerting/dashboard pages

Required implementation:

- `control.projects.list_for_service` private message bridge subject.
- Alert evaluator project discovery mode controlled by
  `CLOUDGRID_ALERT_EVALUATOR_PROJECT_DISCOVERY_ENABLED`.
- Company-scoped alert notification adapter definitions and instances, with
  adapter-provided field schemas, write-only secret fields, encrypted
  control-plane secret storage, and project-effective safe adapter listing.
- Email notification adapter using company adapter instance configuration.
- Webhook notification adapter with HTTPS-only URL validation,
  HMAC-SHA256 signing, timeout, retry/terminal status mapping, and redaction.
- Adapter instance validation for `notificationAdapterIds`, including unknown,
  disabled, unconfigured, and cross-company rejection.
- Typed dashboard alert widgets: `alert_status`, `alert_history`, and
  `alert_evidence`.
- `Query.alertSummary(projectId, input)` only if aggregate dashboard counts are
  required.

Acceptance:

- scheduler rejects startup when no project source is configured;
- discovery pages active projects through control-plane with service auth;
- email adapter maps transient and terminal failures correctly using fake
  company-scoped configuration in default tests;
- webhook adapter signs canonical JSON and redacts secrets and query strings
  from company-scoped configuration;
- dashboard alert widgets read backend view models only and never mutate rules.

Verification:

```sh
bun run contracts:check
bun run typecheck
bun run test
go test -tags surrealdb ./core/control-plane/... ./core/alert-evaluator/...
bun run smoke:frontend
```

## IR-003: Production Auth Hardening

Goal: complete deployed-mode authorization enforcement across BFF, collector,
storage-read, storage-write, and control-plane boundaries.

Source specs:

- [Authentication and authorization model](./04-backend/authentication-authorization.md)
- [Organization invitations and SSO membership lifecycle](./04-backend/organization-invitations.md)
- [Project membership and roles](./04-backend/project-membership.md)
- [Error taxonomy](./03-contracts/errors.yaml)

Write scope:

- `apps/backend`
- `apps/packages/runtime`
- `core/otlp-collector`
- `core/storage-read`
- `core/storage-write`
- `core/control-plane`
- website security/configuration pages

Required implementation:

- BFF session validation for GraphQL HTTP, GraphQL WebSocket, and protected app
  shell routes.
- Company/project membership checks for queries and mutations.
- Project/company admin enforcement and final-admin safeguards.
- Collector deployed bearer validation and local opaque project-token routing.
- Storage-read enforcement of normalized read/live auth context.
- Storage-write persistence of authorized tenant/company/project routing.
- Sanitized `ERR-015` and `ERR-016` behavior with no provider token leakage.

Acceptance:

- deployed mode fails closed for missing, invalid, expired, or insufficient
  credentials;
- local mode still supports documented anonymous defaults and local project
  token routing;
- project and company access cannot be inferred from request body, URL, OTLP
  attributes, or frontend state;
- final-admin protection applies to organization and project membership changes.

Verification:

```sh
bun run typecheck
bun run test
bun run contracts:check
go test -tags surrealdb ./core/otlp-collector/... ./core/storage-read/... ./core/storage-write/... ./core/control-plane/...
```

## IR-004: Production Benchmark Evidence

Goal: produce recorded benchmark evidence for a concrete deployment before that
environment is declared production-ready.

Source specs:

- [Performance and scaling](./06-nfr/performance-and-scaling.md)
- [Release, CI/CD, and distribution](./06-nfr/release-distribution.md)
- [Production readiness docs](../website/src/content/handbook/operations/production-readiness.md)

Write scope:

- `tooling/scripts`
- `.github/workflows`
- `tmp/benchmarks` generated artifacts when intentionally recorded
- website production-readiness pages

Required implementation:

- Run `bench:production`, `bench:production:read`, or
  `bench:production:ingest` against a real NATS and SurrealDB deployment.
- Use `CLOUDGRID_BENCH_DEPLOYMENT_PROFILE=production-like`.
- Use `CLOUDGRID_BENCH_REQUIRED=true` when benchmark failure must fail the job.
- Publish or attach JSON benchmark results with environment identity, image tag,
  deployment profile, thresholds, and pass/fail status.

Acceptance:

- benchmark result JSON exists for the deployment being promoted;
- thresholds are visible in the result and failure status fails the job when
  required;
- docs identify the exact result used to declare the environment ready.

Verification:

```sh
bun run bench:production
bun run bench:production:read
bun run bench:production:ingest
bun test tooling/scripts/bench.test.mjs
```

## IR-005: AI Provider Settings And Project AI Chat Contract Wave

Goal: move AI provider settings and project AI Chat from prose scope into
machine-readable contracts and generated outputs.

Source specs:

- [Project and company AI provider settings](./04-backend/ai-provider-settings.md)
- [AI Chat runtime](./04-backend/ai-chat.md)
- [AI provider settings resolution flow](./02-flows/ai-platform/provider-settings-resolution.md)
- [AI Chat run flow](./02-flows/ai-chat/chat-run.md)
- [AI Chat action approval flow](./02-flows/ai-chat/action-approval.md)
- [AI Chat conversation compaction flow](./02-flows/ai-chat/conversation-compaction.md)

Write scope:

- `apps/packages/definition`
- `specs/03-contracts/graphql/public-schema.graphql`
- `specs/03-contracts/messages/message-bridge.asyncapi.yaml`
- `specs/03-contracts/entities`
- `apps/packages/ui-contracts`
- `core/go-contracts`
- contract-generation tests

Required implementation:

- GraphQL operations for provider settings, chat history, stream setup,
  artifacts, action approvals, and compaction.
- AsyncAPI subjects for private control-plane and runtime bridge calls.
- JSON Schemas for chat stream request/event envelopes, provider settings, and
  approval records.
- Generated TypeScript and Go contract outputs.
- Drift tests proving generated contracts match source definitions.

Acceptance:

- contract generation is deterministic;
- all new GraphQL operations validate against the SDL;
- AsyncAPI request fields match generated Go structs;
- no runtime implementation is added before the contract wave passes.

Verification:

```sh
bun run contracts:check
bun test tooling/scripts/generate-contracts.test.ts
bun run typecheck
```

## IR-006: Project AI Chat Runtime And UI

Goal: implement the approved Project AI Chat runtime and UI after IR-005 lands.

Source specs:

- [AI Chat domain](./01-domains/ai-chat.md)
- [AI Chat runtime](./04-backend/ai-chat.md)
- [AI Chat views](./05-frontend/ai-chat-views.md)
- [AI Chat run flow](./02-flows/ai-chat/chat-run.md)
- [AI Chat action approval flow](./02-flows/ai-chat/action-approval.md)
- [AI Chat conversation compaction flow](./02-flows/ai-chat/conversation-compaction.md)

Write scope:

- `apps/backend`
- `apps/frontend`
- `core/control-plane`
- `core/storage-read`
- `core/storage-write`
- generated contract packages from IR-005
- website AI Chat pages

Required implementation:

- Company/provider resolution and redacted effective provider inspection.
- Per-user, project-scoped chat history.
- Streaming run lifecycle with ordered events, duplicate submit behavior, abort,
  terminal events, and sanitized errors.
- JSON-render artifact validation and rendering.
- Explicit approval flow for risky actions.
- Conversation compaction using specified trigger and persistence rules.

Acceptance:

- frontend never receives raw provider credentials;
- one chat run cannot query across projects;
- destructive actions require explicit approval;
- stream events are ordered, terminal, and replay-safe according to contracts;
- generated UI contracts are the only frontend data source;
- local integration coverage creates a managed company provider, creates an AI
  Chat conversation, streams through `CLOUDGRID_AI_CHAT_HARNESS_MODE=mock`,
  verifies terminal events, verifies history persistence, and checks that
  credential material is absent from stream events.

Verification:

```sh
bun run contracts:check
bun run typecheck
bun run test
go test -tags surrealdb ./core/control-plane/... ./core/storage-read/... ./core/storage-write/...
bun run smoke:frontend
```

## IR-007: Log Ingestion Boundary Extraction

Goal: split log-specific ingestion controls into `core/log-ingest` only when
that service is implemented as a dedicated backend ingestion wave.

Source specs:

- [Log ingestion boundary](./04-backend/log-ingestion-boundary.md)
- [Service architecture](./04-backend/backend-architecture.md)
- [OTLP mapping](./04-backend/otlp-mapping.md)
- [Message bridge AsyncAPI contract](./03-contracts/messages/message-bridge.asyncapi.yaml)

Write scope:

- `core/log-ingest`
- `core/otlp-collector`
- message bridge contracts only if ownership boundaries change
- docs and deployment manifests

Required implementation:

- Preserve public OTLP `/v1/logs` compatibility.
- Preserve private `telemetry.ingest.logs` subject semantics.
- Move only log-specific validation, redaction, parsing policy, rate limits, and
  tenant/project routing.
- Keep collector trace and metric ingestion behavior unchanged.

Acceptance:

- existing OTLP log senders continue to work;
- storage-write receives the same durable log command contract;
- trace and metric ingestion tests remain unchanged;
- no public REST telemetry read endpoint is introduced.

Verification:

```sh
bun run contracts:check
go test -tags surrealdb ./core/otlp-collector/... ./core/log-ingest/... ./core/storage-write/...
bun run test
```

## IR-008: Production Release And Deployment Documentation

Goal: complete the operator-facing release documentation required before public
release.

Source specs:

- [Release, CI/CD, and distribution](./06-nfr/release-distribution.md)
- [Performance and scaling](./06-nfr/performance-and-scaling.md)
- [Kubernetes handbook](../website/src/content/handbook/configuration/deployed/kubernetes.md)
- [Production readiness docs](../website/src/content/handbook/operations/production-readiness.md)

Write scope:

- `website/src/content/handbook`
- `website/src/content/handbook`
- `.github/workflows` only when documentation needs workflow output paths
- release validation scripts only when docs reference generated artifact names

Required implementation:

- Enterprise Helm install guide.
- External NATS and SurrealDB configuration guide.
- Image customization and custom base image guide.
- Air-gapped or private-registry mirroring guide.
- Upgrade and rollback guide.
- Release artifact verification guide using signatures, checksums, SBOMs, and
  image digests.
- Sizing guide aligned with benchmark profiles and scaling variables.

Acceptance:

- public docs keep local evaluation simple and production hardening explicit;
- production examples do not recommend default SurrealDB credentials, plaintext
  public endpoints, local auth, or mutable image tags;
- release verification docs name the exact artifacts produced by the release
  workflow;
- website handbook and repository docs stay aligned.

Verification:

```sh
bun run lint
bun run smoke:frontend
git diff --check
```

## IR-009: CloudGrid Self-Observability Logs Completion

Goal: make CloudGrid's own service logs visible in the normal project-scoped
Logs UI through the same OTLP ingest path used for application logs.

Source specs:

- [CloudGrid self-observability](./04-backend/self-observability.md)
- [Log ingestion boundary](./04-backend/log-ingestion-boundary.md)
- [Telemetry query semantics](./04-backend/telemetry-query-semantics.md)
- [Logs, metrics explorer, and dashboards UX concept](./05-frontend/logs-metrics-dashboards-ux-concept.md)

Write scope:

- `apps/backend`
- `apps/packages/runtime`
- `core/go-runtime`
- `core/otlp-collector`
- `core/control-plane`
- `core/storage-read`
- `core/storage-write`
- `core/ai-eval-runner`
- website self-observability/logging pages

Required implementation:

- OTLP log exporters for all self-observability-covered services.
- Bounded log record queues, interval flush, shutdown flush, and full-buffer
  drop behavior.
- BFF, collector, control-plane, storage-read, storage-write, and AI-eval
  runner lifecycle/error event recording as specified.
- Trace/span correlation for log records when a current span context exists.
- Sanitization for GraphQL documents, OTLP bodies, credentials, provider
  secrets, SurrealDB/NATS secrets, local project tokens, emails, and arbitrary
  request bodies.
- Exporter failure rate limiting and recursion protection.
- Documentation showing operators how to inspect CloudGrid logs in the
  `cloudgrid-system` project or configured deployed self-observability project.

Acceptance:

- selecting the self-observability project shows CloudGrid service logs in the
  normal Logs route;
- service logs carry bounded service, event, operation, request, and CloudGrid
  error attributes;
- log rows pivot to CloudGrid traces when trace/span IDs are present;
- disabling `CLOUDGRID_SELF_OBSERVABILITY_LOGS_ENABLED` stops OTLP log export
  without disabling stdout/stderr process logs;
- exporter failures never fail readiness, request handling, message
  acknowledgement, or shutdown;
- tests prove forbidden values are not present in exported log payloads.

Verification:

```sh
bun run typecheck
bun run test
go test -tags surrealdb ./core/go-runtime/... ./core/otlp-collector/... ./core/control-plane/... ./core/storage-read/... ./core/storage-write/... ./core/ai-eval-runner/...
bun run smoke:frontend
```

## IR-010: AI Eval v2 Implementation Migration

Goal: replace legacy Scorer/Experiment behavior with the v2 Dataset,
Evaluation, Metric, Target, Comparison, and Optimization model while preserving
CloudGrid service boundaries and leaving production measurement as backlog-only
product scope.

Source specs:

- [AI Eval domain](./01-domains/ai-eval.md)
- [AI Eval v2 contract rewrite](./03-contracts/ai-eval-v2-contract-rewrite.md)
- [AI Eval message contracts](./04-backend/ai-eval-message-contracts.md)
- [AI Eval query semantics](./04-backend/ai-eval-query-semantics.md)
- [AI Eval runner](./04-backend/ai-eval-runner.md)
- [AI Eval UX concept](./05-frontend/ai-eval-ux-concept.md)
- [AI Eval views](./05-frontend/ai-eval-views.md)
- [AI Eval content capture](./06-nfr/ai-eval-content-capture.md)
- [AI Eval cost bounds](./06-nfr/ai-eval-cost-bounds.md)

Implementation plan:

- [AI Eval v2 migration plan](../plans/ai-eval-v2-migration/implementation-plan.md)

Required implementation:

- Storage-write persists v2 datasets, immutable dataset versions, item
  revisions, evaluation runs, item runs, metric results, aggregates,
  comparisons, target snapshots, optimization runs, and promotion records.
- Storage-read owns all AI Eval v2 query filtering, pagination, aggregates, and
  live matching semantics for GraphQL-facing view models.
- The AI Eval runner executes dataset evaluations through target snapshots,
  optional external adapters, OpenTelemetry trace context, quick-shot subsets,
  row-level summaries, metric results, retention roles, and deterministic
  failure semantics.
- The frontend exposes Dataset Evaluations and Optimization flows, raw JSON
  schema editing and validation, dataset row curation, trace-to-dataset import
  for datasets with extraction settings, run detail, comparisons, and
  optimization progress without primary Scorer, Check, Gate, Experiment, or
  Production Quality v2 tabs.
- Integration fixtures, handbook docs, and final gates prove the end-to-end
  dataset evaluation and optimization path.

Acceptance:

- no public v2 route, GraphQL field, AsyncAPI subject, entity schema, generated
  type, frontend tab, or handbook page reintroduces legacy Scorer/Experiment
  product concepts;
- BFF access to private AI Eval behavior stays behind NATS request/reply;
- storage-write remains the only AI Eval persistence mutator and storage-read
  remains the only AI Eval query owner;
- dataset versions and target snapshots provide durable replay semantics for
  future prompt, skill, tool, workflow, and adapter optimization;
- production measurement remains backlog-only until dataset evaluation and
  optimization are implemented.

Verification:

```sh
bun run contracts:check
bun run typecheck
node /Users/sebastianwessel/.agents/skills/spec-architect/scripts/check_specs.mjs specs
node /Users/sebastianwessel/.agents/skills/implementation-planner/references/check_plan.mjs . plans/ai-eval-v2-migration specs
node /Users/sebastianwessel/.agents/skills/implementation-planner/references/check_wave_readiness.mjs . wave_02_parallel_services plans/ai-eval-v2-migration specs
node /Users/sebastianwessel/.agents/skills/implementation-planner/references/check_wave_readiness.mjs . wave_03_runner_frontend plans/ai-eval-v2-migration specs
```

## Cross-Cutting Rules

- Update source specs before implementation when a required behavior is absent.
- Do not add GraphQL fields, NATS subjects, SurrealDB fields, route modes,
  error codes, env vars, or retry behavior outside the linked specs.
- For contract changes, run `bun run contracts:check`.
- For frontend UX changes, follow
  [Enterprise product UX concept](./05-frontend/product-ux-concept.md).
- For deployment or release changes, update website handbook pages in
  the same branch.
