# AI Evaluation

AI evaluation is an optional CloudGrid enhancement for teams that emit OpenTelemetry from AI agents.

CloudGrid keeps the core trace/log explorer intact and adds AI-specific workflows on top of preserved spans:

- agent run, model call, tool call, and retrieval projections from OTel GenAI and OpenInference attributes;
- datasets built from observed traces and spans;
- scorers for deterministic checks, RAG metrics, LLM judges, and human review;
- offline experiment runs through a configured harness adapter;
- prompt optimization through harness workflows;
- annotation queues for turning failures into regression cases.

The public CloudGrid surface remains GraphQL. Harness remains the execution surface for agent replay, judge model calls, and optimization.

## Implementation Scope

The approved CloudGrid AI-eval implementation scope is split into focused workstreams:

- Contracts and generated types for GraphQL, AsyncAPI, errors, and AI entity schemas.
- Collector extraction of AI projections from OTel GenAI and OpenInference spans.
- Storage-write persistence for AI projections, datasets, scorers, experiments, results, progress notifications, and annotation records.
- Storage-read query and live subscription semantics for AI-eval GraphQL view models.
- A Bun TypeScript harness adapter package at `apps/packages/cloudgrid-harness-adapter`.
- A Go `core/ai-eval-runner` service for online scoring, offline experiment orchestration, deterministic scoring, cancellation, and optimization delegation.
- TypeScript BFF GraphQL resolvers that validate inputs and call private message bridge subjects.
- Feature-gated frontend views for agent runs, transcripts, datasets, scorers, scoreboards, and annotation queues.
- A CLI regression gate that starts an experiment run, subscribes to progress, applies thresholds, and writes JUnit XML.

Out of scope for the current AI-eval plan: public REST AI-eval endpoints, model-provider SDKs in CloudGrid services, Python runtimes in CloudGrid, BFF/frontend telemetry derivation, runner SurrealDB access, harness calls back into GraphQL or NATS, and first-class v1 projections for OpenInference reranker, guardrail, evaluator, or prompt spans.

## Runner Boundary

`core/ai-eval-runner` is an optional Go service. It is enabled only when the AI-eval feature is configured and must stay behind the private message bridge.

The runner:

- consumes persisted AI projection notifications for online scoring;
- handles experiment start, cancellation, and optimization start subjects;
- reads datasets, scorers, projections, and experiment state only through storage-read request/reply subjects;
- writes mutable AI-eval records only through storage-write command subjects;
- calls the harness adapter over HTTP for `/v1/run`, `/v1/score`, and `/v1/optimize`;
- preserves W3C trace context on harness calls;
- executes deterministic scorers locally;
- publishes durable experiment progress notifications for storage-read live fanout.

The runner must not import SurrealDB clients, storage adapters, model-provider SDKs, provider credentials, or public HTTP handlers.

## Local And Offline Testing

The initial runner scaffold is intentionally offline and dependency-light. It contains ports and helpers only, so it can be tested without NATS, SurrealDB, the harness adapter, or generated contracts.

For runner-only scaffolding, run:

```sh
cd core/ai-eval-runner
GOWORK=off go test ./...
```

`GOWORK=off` is used because the root `go.work` does not yet include `core/ai-eval-runner`. Do not edit broad workspace files just to run the scaffold tests; add the module to the workspace only in an implementation wave that owns Go workspace wiring.

Current offline test coverage should focus on:

- deterministic scorer behavior using local, pure functions;
- idempotency key helpers for the spec-defined persistence boundaries:
  - dataset item execution: `(experimentRunId, datasetItemId)`;
  - eval result: `(targetKind, targetId, scorerId, scorerVersion)`;
  - optimization candidate: `(experimentRunId, promptVersionHash)`;
- port-level orchestration tests with fake storage-read, storage-write, harness, and progress publisher implementations.

Later integration tests should be added only when their owning workstream wires the real adapter boundary:

- NATS request/reply mapping for runner-owned subjects;
- storage-read and storage-write contract validation;
- harness adapter HTTP error mapping, timeout handling, trace-context propagation, and retry/idempotency behavior;
- experiment progress notification fanout through storage-read live subscriptions.
