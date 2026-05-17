# Advanced Topics

Advanced changes start in `specs/`. Do not add behavior such as storage adapters, GraphQL fields, NATS subjects, retention rules, auth flows, scaling switches, or deployment topology changes until the relevant spec and contracts define them.

## AI Evaluation

Optional AI evaluation workflows are covered in [AI Evaluation](./ai-eval.md). Start there when configuring datasets, scorers, experiments, harness adapters, online policies, or the AI eval runner.

## Performance And Scaling Concept

CloudGrid scales by keeping the hot paths short and moving expensive work to the owner service.

### Ingest Path

Default path:

1. Collector validates payload and ingest authorization.
2. Collector publishes one `PersistTelemetryCommand` to JetStream.
3. storage-write consumes through a durable consumer.
4. storage-write performs one idempotent persistence transaction.
5. storage-write acknowledges only after persistence succeeds.

Recommended next scaling improvements:

- Use pull consumers for storage-write when sustained ingest requires horizontal workers and client-driven batching.
- Expose batch size, max waiting, ack wait, max delivery, and max ack pending as typed runtime config.
- Keep project-status auth cache in the collector and fail closed in deployed mode when stale.
- Add bounded OTLP request size and span/log/metric count limits before accepting very large payloads.
- Publish only routing hints in post-persist notifications.

NATS JetStream documentation recommends pull consumers for new scalable processing because they give detailed flow control and easier horizontal scaling. JetStream `MaxAckPending` is the main outstanding-message backpressure knob for consumers.

### Read Path

Default path:

1. Frontend sends GraphQL to the BFF.
2. BFF forwards typed request/reply to storage-read.
3. storage-read builds parameterized SurrealQL.
4. SurrealDB returns bounded rows or facets.
5. storage-read returns GraphQL-ready view models.

Recommended next scaling improvements:

- Add measured query budgets per GraphQL operation.
- Require `EXPLAIN`/`EXPLAIN ANALYZE` opt-in integration tests for hot SurrealQL shapes.
- Add query complexity/depth limits for GraphQL.
- Return `application/graphql-response+json` where clients opt in, while keeping `application/json` compatibility.
- Add response-size and page-size guards to every GraphQL read.

### SurrealDB Shape

CloudGrid should keep using SurrealDB-specific strengths inside the adapter:

- strict project databases
- schemafull hot telemetry tables
- flexible attribute/body fields for OpenTelemetry payloads
- graph relations for low-volume control-plane relationships
- exact indexes for hot trace/log filters
- full-text/vector features only behind explicit specs and measured write-path impact

SurrealDB indexes should be verified by integration tests. Indexes that need to be built on existing data should use concurrent index creation where supported so normal operations are not blocked.

### Frontend Shape

The frontend should stay a thin GraphQL client:

- no NATS
- no OTLP
- no stored OAuth tokens
- no telemetry aggregation over broad raw datasets
- virtualized large trace/log surfaces
- stable selected-project routing
- inline error panels with retry actions

### Production Readiness Gaps

Before a real production deployment, CloudGrid still needs:

- production deployment manifests
- storage-maintenance retention execution worker and deletion run operations
- operational dashboards for NATS, SurrealDB, BFF, collector, storage-read, storage-write, and control-plane
- alert evaluator scheduling/execution and non-core notification adapter specs
- per-service resource requests/limits
- load tests and documented capacity envelopes
- secret rotation procedures
- SSO provider verification in the target environment

## Future Extension Areas

- Dedicated `core/log-ingest`.
- Storage-maintenance retention execution.
- Alert evaluator execution and external notification adapters.
- Storage adapter alternatives.
- Service topology materialization.
- AI investigation views using explicit embedding/vector specs.

Each extension must update specs, contracts, tests, docs, and verification commands in the same wave.
