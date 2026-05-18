# Integration Test Suite

CloudGrid must have a real end-to-end integration suite that exercises public
entrypoints against real runtime services:

- TypeScript BFF GraphQL and HTTP endpoints.
- Go control-plane, storage-read, storage-write, and OTLP collector services.
- NATS message bridge and JetStream.
- SurrealDB with an isolated, disposable in-memory database process.

The default local integration command must not reuse developer persistence. It
starts disposable NATS and SurrealDB containers on random localhost ports, starts
the real CloudGrid services with random health/API ports, drives public HTTP and
GraphQL requests from TypeScript, and tears all processes down at the end.

The suite must verify at least:

- readiness for every public service;
- local viewer bootstrap and project selection through public GraphQL;
- organization, project, invitation, member, project settings, retention,
  ingest credential, alerting, and project AI settings GraphQL workflows through
  the BFF and control-plane service;
- dashboard CRUD, pinning, and widget runtime execution for every saved and
  built-in dashboard widget through the same public GraphQL operation documents
  used by the frontend;
- OTLP trace, log, and metric ingest through public collector endpoints;
- GraphQL trace search/detail, log search, metric name search, and metric series
  reads through the BFF;
- AI Eval workspace reads, dataset import upload/preview/commit, dataset export,
  quality overview, and live experiment subscription startup through the BFF,
  storage-read, and storage-write services;
- collector error mappings for invalid public requests;
- duplicate JetStream ingest command handling.

## Coverage Expansion Contract

The suite grows by adding typed TypeScript scenarios, not ad hoc shell scripts.
Scenario code must use generated GraphQL/UI contract types where available and
typed fixture builders for OTLP/control-plane/AI-eval data. Every scenario must
drive CloudGrid through public HTTP, GraphQL, GraphQL WebSocket, or OTLP
collector endpoints; direct NATS publishing is allowed only for bridge
idempotency/error cases that do not have a public endpoint.

## Frontend Endpoint Conformance

Frontend routes and integration scenarios must share one executable public API
surface owned by `apps/packages/public-api-client`. The frontend must not define
route-local GraphQL documents or call `/graphql` directly outside its thin
client wrapper. The integration suite must import the same operation documents,
operation names, variable builders, HTTP endpoint descriptors, and WebSocket
subscription helpers that the frontend uses.

Every frontend-used public endpoint must have a scenario coverage entry:

- GraphQL descriptors declare the operation name, document, variable envelope,
  response selector, and the public schema operation they cover.
- HTTP descriptors declare method, path, body shape, expected response shape,
  and the OpenAPI operation they cover.
- OTLP descriptors declare signal, path, media type, and expected public
  problem mapping for failures.
- Scenario metadata lives in `apps/packages/integration-scenarios` and lists
  covered GraphQL/OpenAPI operation IDs. The drift gate fails when a frontend
  operation has no scenario coverage, a scenario claims an operation that no
  longer exists, or a scenario is not executed against the full local stack.
  Contract-only checks are useful as unit/static drift tests, but they do not
  count as real integration coverage. Real integration scenario metadata must
  remain `local-e2e`.

`tooling/scripts/integration-local.mjs` owns disposable infrastructure and
process orchestration only. Endpoint scenario logic belongs in typed TypeScript
scenario modules that use the shared public API client instead of inline GraphQL
strings, hand-built fetch calls, or service-private NATS subjects.

Next required public endpoint coverage:

- HTTP health and auth: BFF `/api/health`, `/livez`, `/readyz`,
  `/auth/login`, `/auth/callback`, `/auth/logout`, and Go service health ports.
- OTLP media matrix: JSON and protobuf success for traces, logs, and metrics;
  unsupported media type; invalid JSON; invalid protobuf; and response problem
  shape validation.
- GraphQL control plane: organizations, projects, project create/update,
  ingest credential create/revoke, organization members/invitations, dashboards,
  dashboard pins, retention, and alerting.
- GraphQL telemetry: `telemetryFacets`, trace filters and cursors, trace detail
  span/log filters, log filters and cursors, `metricNames`, `metricSeries`, and
  `richMetricSeries`.
- GraphQL dashboards: saved and built-in dashboard widgets must be executed
  end-to-end against the local stack before a dashboard scenario is considered
  passing. Metric widgets use `MetricSeries`, rich metric widgets use
  `RichMetricSeries`, log widgets use `LogSearch`, trace widgets use
  `TraceSearch`, and live trace widgets must have local live subscription
  coverage.
- GraphQL WebSocket live traces: start a `liveTraces` subscription, ingest a
  matching trace through OTLP, assert `added`/`updated` live event delivery from
  storage-read, then stop the subscription and assert no direct BFF ingest or
  persisted-notification subscription is used.
- AI-eval transfer and GraphQL workflows: dataset import upload, unsafe upload
  rejection, import preview/commit, export lookup/download states, dataset,
  scorer, experiment, annotation, quality overview, live experiment heartbeat,
  and project AI settings.

## Fixture Requirements

Integration fixtures must be realistic enough to prove query semantics:

- generated development telemetry must use current timestamps by default and
  regenerate trace IDs, span IDs, log IDs, metric timestamps, and a run marker
  for every seed batch;
- continuous development ingest must be opt-in, send only generated OTLP JSON
  telemetry through the public collector endpoint, and be stoppable by the
  caller without introducing service-internal test hooks;
- multi-service traces with root/child spans, an error span, exception events,
  span links, rich attributes, and at least one missing-parent/orphan case;
- correlated and uncorrelated logs across severities with trace/span IDs,
  resource attributes, scope attributes, JSON bodies, and text bodies;
- gauge, sum, histogram, and exemplar-linked metrics across multiple services,
  routes, and environments for group-by and filtering;
- control-plane data for multiple projects, members, invitations, ingest
  credentials, dashboards, pins, retention, and alert rules;
- AI-eval datasets, dataset items, scorers, experiments, prompt versions,
  annotation queue items, JSONL/CSV/ZIP import files, and export artifacts.

The default `bun run test` command must not require Docker. Docker-backed
integration scenarios run through `bun run integration:local`; CI may promote
them into a separate required job once service image startup replaces local
`go run`/`bun run` service startup.
