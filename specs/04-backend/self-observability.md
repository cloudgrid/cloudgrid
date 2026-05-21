---
id: TEC-BE-026
title: CloudGrid self-observability
layer: backend
status: draft
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-17
provenance: user-directed
depends_on: [TEC-BE-001, TEC-BE-005, TEC-BE-011, TEC-BE-017]
---

# CloudGrid Self-Observability

## Intent

CloudGrid must be observable through its own OpenTelemetry ingest path. Operators can inspect CloudGrid service traces, logs, and internal metrics in the same project-scoped UI used for application telemetry.

Self-observability is not a special read path. CloudGrid services export OTLP to a configured collector endpoint; the collector publishes normal ingest commands; storage-write persists; storage-read serves GraphQL view models.

## Availability

Self-observability is available in both local and deployed modes.

Local mode defaults:

- `CLOUDGRID_SELF_OBSERVABILITY_ENABLED=true` unless explicitly disabled.
- Control-plane bootstraps a visible `Personal` company project with ID `cloudgrid-system`, name `CloudGrid`, slug `cloudgrid-system`, and status `active`.
- CloudGrid services export to the local OTLP HTTP collector by default.
- The local collector must not route anonymous local-mode application ingest to
  `cloudgrid-system`. Anonymous local-mode ingest remains single-project
  development ingest and uses `CLOUDGRID_OTLP_LOCAL_PROJECT_ID` or `default`
  when no token map is configured.
- Local multi-project usage, including CloudGrid self-observability, uses
  `CLOUDGRID_OTLP_LOCAL_PROJECT_TOKENS`. CloudGrid service exporters send
  `Authorization: Bearer <CLOUDGRID_SELF_OBSERVABILITY_OTLP_BEARER_TOKEN>` and
  the token map binds that opaque token to `cloudgrid-system`.
- Implementations must not derive the routing project from OTLP resource
  attributes, span attributes, log attributes, metric attributes, query
  parameters, or custom CloudGrid HTTP headers.
- The self-observability project appears in the normal project picker and can be selected like any other project.

Deployed mode defaults:

- `CLOUDGRID_SELF_OBSERVABILITY_ENABLED=false` unless explicitly enabled.
- Enabling self-observability requires explicit company, project, OTLP endpoint, and ingest credential configuration.
- The configured OTLP endpoint must be accepted by the collector's deployed
  ingest bearer-token validator. Collector validation uses
  `CLOUDGRID_AUTH_ISSUER`, `CLOUDGRID_AUTH_AUDIENCE`, and
  `CLOUDGRID_AUTH_JWKS_URL`; browser SSO provider settings are not a substitute
  for these service-token values.
- Control-plane must not create a company in deployed mode for this feature.
- The configured project is visible only through the existing organization membership and selected-project authorization rules.
- The control-plane service validates at startup/readiness that the configured self-observability project exists and belongs to the configured company. A mismatch fails with ERR-009. Other services validate only static self-observability configuration and rely on the collector's ingest credential validation for project routing.

## Fixed Project Rules

The local self-observability project is a fixed system project, but it is not hidden.

Rules for `cloudgrid-system` in local mode:

- It is owned by the durable local company `Personal`.
- It appears in `Query.projects`, `Query.viewer.organizations.projects`, and project selection views.
- It can be selected through `Mutation.selectProject`.
- It can be queried through all project-scoped telemetry GraphQL operations.
- It can have dashboards, dashboard pins, retention policy, alert rules, and project settings when those features support ordinary projects.
- `Mutation.updateProject` must reject attempts to change its name, slug, or status with ERR-016.
- Project deletion is not currently part of the public contract. If deletion is added later, deleting this project must be rejected with ERR-016 unless a later spec explicitly changes the invariant.

The ordinary local user project remains ID `default`, name `Default project`, slug `default`, and status `active`.

## Runtime Configuration

Shared variables:

- `CLOUDGRID_SELF_OBSERVABILITY_ENABLED`, boolean. Default `true` in local mode and `false` in deployed mode.
- `CLOUDGRID_SELF_OBSERVABILITY_PROJECT_ID`, default `cloudgrid-system`.
- `CLOUDGRID_SELF_OBSERVABILITY_COMPANY_ID`, required when enabled in deployed mode; default `local` in local mode.
- `CLOUDGRID_SELF_OBSERVABILITY_OTLP_ENDPOINT`, OTLP HTTP base endpoint. Default `http://localhost:4318` in local mode. Required when enabled in deployed mode.
- `CLOUDGRID_SELF_OBSERVABILITY_EXPORT_INTERVAL_SECONDS`, default `10`, minimum `1`, maximum `300`.
- `CLOUDGRID_SELF_OBSERVABILITY_TRACES_ENABLED`, default `true` when self-observability is enabled.
- `CLOUDGRID_SELF_OBSERVABILITY_LOGS_ENABLED`, default `true` when self-observability is enabled.
- `CLOUDGRID_SELF_OBSERVABILITY_METRICS_ENABLED`, default `true` when self-observability is enabled.
- `CLOUDGRID_SELF_OBSERVABILITY_EXPORT_FAILURE_LOG_LEVEL`, one of `debug`,
  `info`, `warn`, `error`, or `off`. Default `warn`. This controls only
  process log records emitted when an exporter cannot deliver telemetry; it does
  not change telemetry signal collection or `cloudgrid.exporter.failures`.

Credential variables:

- `CLOUDGRID_SELF_OBSERVABILITY_OTLP_BEARER_TOKEN`, required whenever
  self-observability is enabled. In local mode it is the opaque local project
  token mapped to `CLOUDGRID_SELF_OBSERVABILITY_PROJECT_ID` by
  `CLOUDGRID_OTLP_LOCAL_PROJECT_TOKENS`; it must not fall back to anonymous
  local ingest.

Validation rules:

- `CLOUDGRID_SELF_OBSERVABILITY_ENABLED=false` disables all self-observability exporters in that process.
- In deployed mode, enabling self-observability without company ID, project ID, endpoint, or bearer token fails startup with ERR-009.
- In local mode, enabling self-observability without `CLOUDGRID_SELF_OBSERVABILITY_OTLP_BEARER_TOKEN` fails startup with ERR-009. The token must resolve to `CLOUDGRID_SELF_OBSERVABILITY_PROJECT_ID` in `CLOUDGRID_OTLP_LOCAL_PROJECT_TOKENS`; readiness fails with ERR-009 when it is mapped to another project.
- Services must not read SurrealDB credentials, browser session cookies, provider credentials, or raw API keys to populate telemetry.
- Services must not accept tenant, company, or project ownership from OTLP resource attributes. Project ownership still comes only from collector authorization and routing.
- Unknown `CLOUDGRID_SELF_OBSERVABILITY_*` variables are ignored until this spec defines them.

Boolean parsing is strict and portable across TypeScript and Go services: only
case-insensitive `true` and `false` are accepted. Numeric boolean forms such as
`1` and `0` are invalid and fail startup with ERR-009.

## Export Pipeline

Every service that records self-observability telemetry must also have an
exporter path when `CLOUDGRID_SELF_OBSERVABILITY_ENABLED=true`. Recorder seams
without an exporter are test helpers only and do not satisfy this spec.

The first production exporter is OTLP HTTP:

- The endpoint is the resolved `CLOUDGRID_SELF_OBSERVABILITY_OTLP_ENDPOINT`
  base URL.
- Metrics are sent to `<endpoint>/v1/metrics`.
- Traces are sent to `<endpoint>/v1/traces`.
- Logs are sent to `<endpoint>/v1/logs`.
- The exporter sets `Authorization: Bearer <token>` only when
  `CLOUDGRID_SELF_OBSERVABILITY_OTLP_BEARER_TOKEN` is non-empty.
- The exporter sets `Content-Type: application/json` and emits OTLP JSON that
  follows the protobuf JSON mapping. Go implementations should build official
  OTLP protobuf message types and serialize them with `protojson`. TypeScript
  implementations may use a constrained mapper only when focused tests prove
  the emitted payload is accepted by protobuf JSON decoding. All OTLP `bytes`
  fields, including trace IDs, span IDs, parent span IDs, metric exemplars, and
  log trace/span correlation fields, must be base64-encoded byte strings in the
  exported JSON. W3C lowercase hex trace context is transport state, not the
  JSON representation for OTLP `bytes` fields.
- Export attempts run on `CLOUDGRID_SELF_OBSERVABILITY_EXPORT_INTERVAL_SECONDS`
  and must flush on graceful shutdown. Shutdown flush is best-effort and must
  not emit bridge-unavailable process log noise when the collector or message
  bridge is already stopping.
- Exporters use bounded in-memory buffers. When a buffer is full, new
  telemetry is dropped and `cloudgrid.exporter.failures` is incremented with
  `result=dropped` when the metrics signal is available.
- Export failures are logged at
  `CLOUDGRID_SELF_OBSERVABILITY_EXPORT_FAILURE_LOG_LEVEL`, are bounded and
  rate-limited, and never fail readiness, request handling, message
  acknowledgement, or process shutdown. `off` suppresses only the process log
  line; metrics still record exporter failures when the metrics signal is
  available.

Exporter resource attributes are fixed at process startup from the resolved
runtime configuration. Implementations must not derive company/project identity
from request payloads or OTLP resource attributes.

Collector recursion rule:

- The collector may export its own service telemetry to the configured endpoint.
- Self-export requests are ordinary OTLP ingest requests and must still pass
  collector auth/routing.
- The collector must not add raw self-export request IDs, sink subjects, bearer
  tokens, OTLP payload bytes, or raw export errors to metric labels or span/log
  attributes.
- Exporter failure telemetry is rate-limited to avoid unbounded recursive
  telemetry during collector outages.

## Local Setup Script

CloudGrid must provide a local setup/init script for multi-project local
observability. The script is operator-facing tooling, not runtime product code.

Required behavior:

- Command: `bun run setup:local` from the repository root.
- The script reads `.env` when present and updates only CloudGrid local
  development variables in `.env`. It must preserve comments and unrelated
  variables when practical; it must not rewrite secrets to stdout.
- It generates at least two opaque tokens with 32 or more random bytes encoded
  using URL-safe characters:
  - one token mapped to `default`;
  - one token mapped to `cloudgrid-system`.
- It writes `CLOUDGRID_OTLP_LOCAL_PROJECT_TOKENS` as a JSON object mapping token
  values to project IDs.
- It writes `CLOUDGRID_OTLP_LOCAL_PROJECT_ID=default` so anonymous fallback, when
  deliberately used without the token map, targets only the ordinary local
  project.
- It writes `CLOUDGRID_SELF_OBSERVABILITY_PROJECT_ID=cloudgrid-system`,
  `CLOUDGRID_SELF_OBSERVABILITY_COMPANY_ID=local`, and
  `CLOUDGRID_SELF_OBSERVABILITY_OTLP_BEARER_TOKEN=<system-token>`.
- It writes a developer convenience variable
  `CLOUDGRID_PROJECT_API_KEY=<default-token>` for fixture and example scripts.
- If active token mappings already contain `default` and `cloudgrid-system`, the
  script is idempotent and preserves the existing token values unless called
  with an explicitly documented rotation flag.
- The script prints only variable names, project IDs, and next-step commands. It
  must not print full token values.

Fixture and seed scripts must use `CLOUDGRID_OTLP_BEARER_TOKEN`,
`CLOUDGRID_PROJECT_API_KEY` in that precedence order
when sending local OTLP requests. They must not send unauthenticated OTLP by
default after `bun run setup:local` has configured token routing.

## Service Coverage

The first implementation wave covers:

- TypeScript BFF (`apps/backend`).
- Go OTLP collector (`core/otlp-collector`).
- Go control-plane service (`core/control-plane`).
- Go storage-read service (`core/storage-read`).
- Go storage-write service (`core/storage-write`).
- Go AI evaluation runner (`core/ai-eval-runner`) when the service is enabled.

Every instrumented service must set OpenTelemetry resource attributes:

- `service.name`, one of `cloudgrid.bff`, `cloudgrid.otlp_collector`, `cloudgrid.control_plane`, `cloudgrid.storage_read`, `cloudgrid.storage_write`, or `cloudgrid.ai_eval_runner`.
- `service.namespace=cloudgrid`.
- `cloudgrid.deployment_mode`, copied from `CLOUDGRID_DEPLOYMENT_MODE`.
- `cloudgrid.self_observability.project_id`, copied from the resolved project ID.
- `cloudgrid.self_observability.company_id`, copied from the resolved company ID.

Service version is optional until release metadata is specified. If emitted, use the standard `service.version` resource attribute.

## Traces

When trace self-export is enabled, services must create spans at public and private boundaries where they already own request lifecycle behavior:

- BFF HTTP GraphQL requests and GraphQL subscription lifecycle operations.
- BFF NATS request/reply calls.
- Collector OTLP HTTP and gRPC export requests after request-size checks and before publish acknowledgement.
- Collector NATS JetStream publish attempts.
- Control-plane NATS request handlers.
- Storage-read NATS request handlers, live trace subscription start/stop, and bounded database query operations.
- Storage-write JetStream message handling and bounded persistence operations.
- AI-eval runner NATS request handling, harness adapter calls, and storage-read/storage-write message calls.

CloudGrid service spans must use W3C Trace Context for propagation:

- HTTP and gRPC public/private entrypoints extract incoming `traceparent` and
  `tracestate` when present and valid.
- NATS request/reply, publish/subscribe, JetStream publish, and JetStream
  consumer paths propagate the current trace context in NATS message headers
  named exactly `traceparent` and `tracestate`.
- Services must create child spans from the extracted context rather than
  creating unrelated root spans for each boundary.
- When no valid context exists, a service creates a new trace root and injects
  that context into downstream NATS or OTLP calls.
- Implementations must not invent CloudGrid-specific parent-span headers.
  `cloudgrid.request_id` remains a correlation attribute and is not a trace
  parent.
- Propagation headers are transport metadata only. They are never used for
  tenant, company, project, principal, or permission decisions and must not be
  persisted as telemetry attributes.
- Trace context propagation must preserve lowercase hex OpenTelemetry trace IDs
  and span IDs. Invalid `traceparent` or `tracestate` values are ignored and
  must not fail the user request.

Exporter span payloads must include:

- the propagated or newly created trace ID;
- a generated span ID;
- `parentSpanId` when the span has an extracted parent or enclosing local span;
- `startTimeUnixNano` and `endTimeUnixNano` with millisecond-or-better
  precision.

Spans must not include raw GraphQL query text, raw OTLP payloads, Authorization headers, bearer tokens, SurrealDB credentials, provider keys, cookie values, or unbounded user-controlled payload attributes.

Allowed span attributes:

- `cloudgrid.request_id`.
- `messaging.system=nats` for NATS operations.
- `messaging.destination.name` for NATS subjects, when the subject is not an ephemeral live sink containing user-controlled values.
- `rpc.method` or `graphql.operation.name` when the value is a bounded operation name, not raw query text.
- `http.route`, `http.request.method`, and status attributes for public HTTP handlers.
- `db.system=surrealdb` and bounded query operation labels such as `trace_search`, `metric_series`, or `project_list`; do not emit raw SurrealQL.
- `cloudgrid.project_id` only when already present in normalized auth context.

## Logs

Structured application logs remain stdout/stderr JSON as defined in the engineering conventions. When log self-export is enabled, services must export bounded OpenTelemetry log records for important lifecycle and error events.

Allowed log event classes:

- startup configuration accepted or rejected;
- readiness state changes;
- request/reply handler failures mapped to CloudGrid error codes;
- ingest accepted/rejected counts as metric events, not raw payload logs;
- exporter failures, sampled and rate-limited.

Log records must not include raw OTLP bodies, GraphQL documents, cookies, authorization headers, bearer tokens, SurrealDB credentials, provider secrets, or arbitrary request bodies.

Log self-observability is implementation-ready when every covered service emits
OTLP log records for the same bounded events that already matter operationally
in stdout/stderr logs. Log export is not a replacement for process logs; it is
the project-scoped CloudGrid copy used by the Logs UI.

Required service coverage:

- BFF: startup config result, GraphQL operation failures, NATS bridge request
  failures, GraphQL subscription setup/stream failures, and self-observability
  exporter failures.
- OTLP collector: startup config result, OTLP request rejection, publish
  failures, invalid local/deployed ingest credential failures, and
  self-observability exporter failures.
- Control-plane: startup config result, NATS handler failures, membership or
  invitation mutation failures mapped to CloudGrid errors, and
  self-observability exporter failures.
- Storage-read: startup config result, NATS handler failures, SurrealDB query
  failures mapped to `ERR-006`, live subscription drops, and
  self-observability exporter failures.
- Storage-write: startup config result, JetStream consumer failures,
  persistence failures mapped to CloudGrid errors, publish notification
  failures, and self-observability exporter failures.
- AI-eval runner when enabled: startup config result, harness call failures,
  scoring/optimization failures mapped to CloudGrid errors, and
  self-observability exporter failures.

OTLP log record mapping:

- `TimestampUnixNano`: event time in UTC.
- `ObservedTimeUnixNano`: export/record time in UTC.
- `SeverityText`: one of `DEBUG`, `INFO`, `WARN`, or `ERROR`.
- `SeverityNumber`: OpenTelemetry severity number matching `SeverityText`.
- `Body`: bounded human-readable event summary, maximum 512 characters after
  sanitization.
- `TraceId` and `SpanId`: set when a current span context exists.
- Resource attributes: same resource attributes defined in Service Coverage.
- Scope name: `cloudgrid.self_observability.logs`.

Allowed log attributes:

- `cloudgrid.event`, bounded event name such as `startup_ready`,
  `graphql_operation_failed`, `nats_request_failed`,
  `storage_query_failed`, `live_subscription_dropped`,
  `otlp_request_rejected`, or `self_observability_export_failed`;
- `cloudgrid.request_id`, when already generated by the service;
- `cloudgrid.error_id`, one of the CloudGrid error IDs from `errors.yaml`;
- `cloudgrid.error_code`, one of the CloudGrid error codes from `errors.yaml`;
- `cloudgrid.service`, one of the service names from Service Coverage;
- `cloudgrid.operation`, bounded GraphQL operation name, handler name, storage
  query label, or alert/eval operation label;
- `messaging.destination.name`, only for stable non-ephemeral NATS subjects;
- `http.route`, `http.request.method`, and sanitized status attributes.

Forbidden log attributes:

- raw GraphQL documents or variables;
- OTLP request bodies, decoded span/log/metric payloads, log bodies from user
  applications, or arbitrary request bodies;
- bearer tokens, cookies, SSO provider tokens, SMTP credentials, webhook
  signing secrets, SurrealDB credentials, provider API keys, or local project
  tokens;
- raw SurrealQL, SurrealDB connection strings, NATS credentials, ephemeral live
  sink subjects, emails, user IDs, tenant IDs, company IDs, and project IDs
  unless the value is the configured self-observability project ID resource
  attribute.

Export and recursion controls:

- log exporters use the same bounded queue and flush interval as trace/metric
  exporters;
- exporter failure logs are rate-limited to one event per service per interval;
- exporter failure logs must not recursively enqueue unbounded additional
  exporter failure logs;
- when the log queue is full, new log records are dropped and
  `cloudgrid.exporter.failures{signal="logs",result="dropped"}` increments when
  metrics export is available;
- disabling `CLOUDGRID_SELF_OBSERVABILITY_LOGS_ENABLED` disables only OTLP log
  export and does not disable stdout/stderr process logs.

Operator-facing behavior:

- exported CloudGrid logs are visible in the normal Logs route when the
  `cloudgrid-system` project or configured deployed self-observability project
  is selected;
- CloudGrid log rows must pivot to CloudGrid traces when `traceId` and `spanId`
  are present;
- log facets must include `serviceName`, severity, `cloudgrid.event`, and
  `cloudgrid.error_code` through the normal log facet/query path.

## Metrics

Self-observability metrics use the existing OTLP metrics signal and must be queryable through `Query.metricNames`, `Query.metricSeries`, and dashboards.

Required metric instruments:

- `cloudgrid.ingest.requests`: counter, unit `{request}`, attributes `signal`, `transport`, `result`.
- `cloudgrid.ingest.bytes`: histogram, unit `By`, attributes `signal`, `transport`, `result`.
- `cloudgrid.ingest.publish.duration`: histogram, unit `s`, attributes `signal`, `result`.
- `cloudgrid.ingest.commands.published`: counter, unit `{command}`, attributes `signal`, `result`.
- `cloudgrid.storage.persist.commands`: counter, unit `{command}`, attributes `signal`, `result`.
- `cloudgrid.storage.persist.duration`: histogram, unit `s`, attributes `signal`, `result`.
- `cloudgrid.storage.persist.records`: counter, unit `{record}`, attributes `record_kind`, `result`.
- `cloudgrid.storage.read.requests`: counter, unit `{request}`, attributes `operation`, `result`.
- `cloudgrid.storage.read.duration`: histogram, unit `s`, attributes `operation`, `result`.
- `cloudgrid.bff.graphql.operations`: counter, unit `{operation}`, attributes `operation_type`, `operation_name`, `result`.
- `cloudgrid.bff.graphql.duration`: histogram, unit `s`, attributes `operation_type`, `operation_name`, `result`.
- `cloudgrid.message_bridge.requests`: counter, unit `{request}`, attributes `service`, `subject`, `result`.
- `cloudgrid.message_bridge.duration`: histogram, unit `s`, attributes `service`, `subject`, `result`.
- `cloudgrid.live.subscriptions`: up-down counter, unit `{subscription}`, attributes `service`, `result`.
- `cloudgrid.exporter.failures`: counter, unit `{failure}`, attributes `service`, `signal`.

Attribute value constraints:

- `signal` is one of `traces`, `logs`, `metrics`, `ai_projections`, or `unknown`.
- `transport` is one of `http`, `grpc`, `nats`, or `internal`.
- `result` is one of `accepted`, `rejected`, `published`, `persisted`, `success`, `error`, `timeout`, or `dropped`.
- `operation`, `operation_name`, `subject`, `service`, and `record_kind` must come from bounded enums or known handler names.
- Do not emit tenant IDs, company IDs, project IDs, trace IDs, span IDs, user IDs, emails, tokens, raw paths with IDs, or raw error messages as metric labels.

Storage-write owns persisted-record counters because it is the only telemetry mutator. The collector owns accepted/rejected and publish counters. Storage-read owns read counters and query latency. The BFF owns GraphQL operation counters and GraphQL-to-bridge latency. Shared runtime helpers can expose common instruments, but service ownership remains as listed here.

## Deployed Mode Access Control

Self-observability in deployed mode relies on existing company membership and project selection semantics:

- Operators configure `CLOUDGRID_SELF_OBSERVABILITY_COMPANY_ID` and `CLOUDGRID_SELF_OBSERVABILITY_PROJECT_ID` to identify the project that receives CloudGrid telemetry.
- The ingest credential used by `CLOUDGRID_SELF_OBSERVABILITY_OTLP_BEARER_TOKEN` must authorize only that configured project.
- Control-plane project listing and selection must not expose the project to users who are not members of the configured company.
- BFF and frontend must not add bypass routes, hidden global telemetry tabs, or admin-only backdoors for this project.
- A user who cannot select the configured project cannot query its traces, logs, metrics, dashboards, live traces, alerts, or AI-eval projections.

## Failure Behavior

- If self-observability export fails, the emitting service logs a bounded warning and continues serving traffic.
- Exporter failure must increment `cloudgrid.exporter.failures` when metrics export is still available.
- Self-observability must not make service readiness depend on the OTLP collector except for deployed-mode static configuration validation.
- If the collector receives CloudGrid self-telemetry with invalid credentials, it rejects it using the same ERR-016 behavior as other ingest requests.
- If metrics cardinality limits reject a self-observability metric, storage-write applies the normal metrics cardinality policy; no self-observability exception exists.

## Verification

- Runtime config tests cover local defaults, deployed disabled defaults, deployed required-variable validation, and per-signal toggles.
- Control-plane tests prove local bootstrap returns both `default` and `cloudgrid-system`, both are selectable, and `cloudgrid-system` update attempts return ERR-016.
- Collector tests prove self-observability metrics for accepted, rejected, published, and publish-duration paths are emitted without raw payload attributes.
- Storage-write tests prove persist command, duration, and record counters are emitted by signal and result.
- Storage-read tests prove request and duration counters are emitted by operation and result without raw query text.
- BFF tests prove GraphQL operation metrics use bounded operation names and do not include raw GraphQL documents.
- Trace-context tests prove BFF NATS request/reply calls inject `traceparent`,
  Go NATS handlers extract it, child spans use the incoming span ID as
  `parentSpanId`, and downstream NATS/JetStream publishes continue the same
  trace ID.
- Local setup tests prove `bun run setup:local` produces idempotent `.env`
  updates, configures separate default and `cloudgrid-system` tokens, does not
  print full token values, and causes fixture scripts to send a bearer token.
- Production wiring tests prove service startup or subscription/consumer
  composition passes the resolved metrics recorder/exporter into message
  handlers. Tests that call private handlers directly are not sufficient for
  production wiring acceptance.
- Exporter tests use local fake HTTP servers and must prove OTLP JSON endpoint
  path selection, bearer token handling, resource attributes, buffer draining,
  failure isolation, and shutdown flush behavior without requiring NATS,
  SurrealDB, or an external collector.
- Log export tests prove each covered service emits bounded OTLP log records for
  required lifecycle/error events, includes trace/span IDs when a span context
  exists, maps severity correctly, applies resource/scope attributes, redacts
  forbidden values, rate-limits exporter failures, and drops full-buffer log
  records without affecting readiness or request handling.
- Coverage acceptance for the backend target is measured as:
  - TypeScript BFF: `bun test --coverage apps/backend/src`, line coverage
    must be at least 80%.
  - Go backend services: `go test -tags surrealdb -coverprofile=/tmp/cloudgrid-go-backend.out ./core/otlp-collector/... ./core/control-plane/... ./core/storage-read/... ./core/storage-write/...`
    followed by `go tool cover -func=/tmp/cloudgrid-go-backend.out | tail -1`,
    total statement coverage must be at least 80%.
  - If the aggregate Go target is missed, the report must name the packages
    under 80% and no implementation ticket may be called complete.
- Contract checks remain mandatory if implementation adds or changes GraphQL, AsyncAPI, generated UI contracts, or Go message contracts. The first implementation wave must not add public contract changes unless the matching spec and machine-readable contract are updated first.
