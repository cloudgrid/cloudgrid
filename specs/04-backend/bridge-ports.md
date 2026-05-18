---
id: TEC-BE-002
title: Bridge ports
layer: backend
status: draft
owner: unknown@example.com
updated: 2026-05-08
provenance: inferred-draft
---

# Bridge Ports

CloudGrid services depend on message bridge ports, not NATS client APIs. NATS is
the first implemented message bridge adapter. Any additional bridge adapter must
preserve the contract-level semantics declared in
`specs/03-contracts/messages/message-bridge.asyncapi.yaml` or an approved
successor contract without changing domain, GraphQL, storage, collector, or
runner business logic.

## Message Bridge Adapter Boundary

Every service that produces or consumes bridge messages must isolate transport-specific code behind a small adapter package:

- TypeScript BFF: `apps/backend/src/bridge/adapters/nats`.
- Go collector: `core/otlp-collector/internal/adapters/nats`.
- Go storage-write: `core/storage-write/internal/adapters/nats`.
- Go storage-read: `core/storage-read/internal/adapters/nats`.
- Go control-plane: `core/control-plane/internal/adapters/nats`.
- Go ai-eval-runner: `core/ai-eval-runner/internal/adapters/nats`.

Handlers, resolvers, orchestrators, OTLP normalization, storage ports, and AI-eval workflow code must depend on local bridge interfaces only. They must not import `github.com/nats-io/nats.go`, the TypeScript `nats` package, JetStream types, NATS message handles, consumer handles, or subscription handles.

Adapter implementations own:

- connection setup and readiness checks;
- request/reply send and receive;
- durable stream publishing and consumer lifecycle;
- ephemeral sink subscription/publishing;
- ack/nack/term behavior;
- transport timeout mapping to `ERR-013` and `ERR-014`;
- serialization and deserialization of the contract payloads;
- transport-specific logging fields such as `nats_subject`.

Business code owns:

- which contract subject/operation to call;
- domain validation before messages are sent;
- decoded payload validation after messages are received;
- idempotency keys;
- domain error mapping after adapter-level transport errors are normalized.

## Portable Bridge Interfaces

The minimum Go bridge interfaces are:

```go
type RequestReplyClient interface {
  Request(ctx context.Context, subject string, request []byte) ([]byte, error)
}

type StreamPublisher interface {
  Publish(ctx context.Context, subject string, data []byte) error
}

type DurableConsumer interface {
  Run(ctx context.Context, subject string, durableName string, handler MessageHandler) error
}

type EphemeralPubSub interface {
  Subscribe(ctx context.Context, subject string, handler MessageHandler) (Subscription, error)
  Publish(ctx context.Context, subject string, data []byte) error
}

type Message interface {
  Subject() string
  Data() []byte
  Ack(ctx context.Context) error
  Nack(ctx context.Context) error
  Term(ctx context.Context) error
}
```

The minimum TypeScript bridge interfaces are:

```ts
export interface RequestReplyClient {
  request(subject: string, payload: Uint8Array, options: { timeoutMs: number }): Promise<Uint8Array>
}

export interface EphemeralPubSub {
  subscribe(subject: string, onMessage: (message: BridgeMessage) => void | Promise<void>): Promise<AsyncDisposable>
  publish(subject: string, payload: Uint8Array): Promise<void>
}

export interface BridgeMessage {
  subject: string
  data: Uint8Array
}
```

Services may wrap these minimum interfaces with typed subject-specific clients. Those typed clients still live on the business side of the adapter boundary and must not expose NATS-specific types.

## TypeScript BFF Port

```ts
export interface TelemetryQueryBridge {
  searchTraces(input: TraceSearchQuery): Promise<TraceSearchResult>
  getTraceDetail(traceId: string, input: TraceDetailQuery): Promise<TraceDetail | null>
  searchLogs(input: LogSearchQuery): Promise<LogSearchResult>
  searchMetricNames(input: MetricNameSearchInput): Promise<MetricNameSearchResult>
  queryMetricSeries(input: MetricSeriesInput): Promise<MetricSeriesResult>
  getTelemetryFacets(input: TelemetryFacetQuery): Promise<TelemetryFacetResult>
  subscribeLiveTraces(input: LiveTraceQuery, sink: LiveTraceSink): AsyncDisposable
}
```

```ts
export interface ControlPlaneBridge {
  listDashboards(input: DashboardListInput): Promise<DashboardListResult>
  saveDashboard(input: SaveDashboardInput): Promise<Dashboard>
  deleteDashboard(id: string): Promise<boolean>
  setDashboardPinned(input: SetDashboardPinnedInput): Promise<DashboardPreferences>
  reorderDashboardPins(input: ReorderDashboardPinsInput): Promise<DashboardPreferences>
}
```

The NATS adapter implementation sends request/reply messages:

- `searchTraces` -> `telemetry.traces.search`
- `getTraceDetail` -> `telemetry.traces.get`
- `searchLogs` -> `telemetry.logs.search`
- `searchMetricNames` -> `telemetry.metrics.names`
- `queryMetricSeries` -> `telemetry.metrics.query`
- `getTelemetryFacets` -> `telemetry.facets`
- `subscribeLiveTraces` -> `telemetry.traces.live.start`, then receives `LiveTraceEvent` messages from the storage-read-managed ephemeral sink subject, then sends `telemetry.traces.live.stop` when the GraphQL subscription ends.

The control-plane NATS adapter implementation sends request/reply messages:

- `listDashboards` -> `control.dashboards.list`
- `saveDashboard` -> `control.dashboards.save`
- `deleteDashboard` -> `control.dashboards.delete`
- `setDashboardPinned` -> `control.dashboard_pins.set`
- `reorderDashboardPins` -> `control.dashboard_pins.reorder`

`LiveTraceSink` is a BFF-local callback/async iterator boundary. It must expose only decoded `LiveTraceEvent` or mapped GraphQL errors and must not expose transport subscriptions, JetStream consumers, NATS messages, or SurrealDB live query handles.

## Go Storage Read Handler Port

```go
type TelemetryReadStore interface {
  SearchTraces(ctx context.Context, query TraceSearchQuery, authContext *AuthContext) (TraceSearchResult, error)
  GetTraceDetail(ctx context.Context, traceID string, query TraceDetailQuery, authContext *AuthContext) (*TraceDetail, error)
  SearchLogs(ctx context.Context, query LogSearchQuery, authContext *AuthContext) (LogSearchResult, error)
  SearchMetricNames(ctx context.Context, input MetricNameSearchInput, authContext *AuthContext) (MetricNameSearchResult, error)
  QueryMetricSeries(ctx context.Context, input MetricSeriesInput, authContext *AuthContext) (MetricSeriesResult, error)
  GetTelemetryFacets(ctx context.Context, query TelemetryFacetQuery, authContext *AuthContext) (TelemetryFacetResult, error)
  StartLiveTraces(ctx context.Context, request LiveTraceStartRequest, sink LiveTraceSink) (LiveTraceStartData, error)
  StopLiveTraces(ctx context.Context, subscriptionID string) error
  ResolveLiveTraceCandidates(ctx context.Context, traceIDs []string, query LiveTraceQuery, authContext *AuthContext) ([]LiveTraceEvent, error)
}
```

`ResolveLiveTraceCandidates` must reuse trace search filter construction for all overlapping fields. It may use a dedicated adapter query only to add a `traceId IN $traceIds` predicate and omit cursor handling.

## Read View Model Rules

- `GetTraceDetail` must derive `TraceStructure`, selected span, span matches, related logs, warnings, critical-path markers, orphan markers, span depth, child counts, and exception view models from stored trace, span, event, link, and log records.
- Storage adapters may compute derived fields directly or return raw records to a service-layer mapper, but the BFF must receive the normalized contract shape.
- `showMatchesOnly=true` never removes ancestor spans required to render hierarchy. Non-matching ancestors remain in the response and are distinguished by missing `SpanMatch` entries.
- `GetTelemetryFacets` returns bounded suggestions for filter controls and must not scan unbounded raw payload bodies. Attribute-key facets are derived from persisted attribute keys only.
- `StartLiveTraces` may send an initial bounded `snapshot` using the same trace summary shape as `SearchTraces`.
- Live trace delivery assigns `seq` in storage-read. The BFF forwards the sequence without modification.
- `StopLiveTraces` is idempotent. Stopping an unknown subscription returns success.

## Go Storage Write Handler Port

```go
type TelemetryWriteStore interface {
  PersistTelemetry(ctx context.Context, input PersistTelemetryInput) (PersistTelemetryResult, error)
}
```

## Error Mapping

- Validation failures: ERR-001.
- Invalid cursors: ERR-003.
- Trace missing: ERR-004.
- Storage connection failures: ERR-006.
- Partial non-transactional writes: ERR-007.
- Message bridge unavailable: ERR-013.
- Message bridge timeout: ERR-014.
- Missing authentication: ERR-015.
- Authorization denied: ERR-016.
- Live subscription limits exceeded: ERR-017.

## Implementation Rule

No TypeScript BFF interface may expose SurrealDB record IDs, query builders, live queries, transactions, SurrealQL strings, or storage adapter constructors.

No TypeScript BFF interface may expose JetStream consumer handles for telemetry ingest, and the BFF must not subscribe to post-persist notification subjects. The only live telemetry event source visible to the BFF is a storage-read-owned ephemeral sink subject created for one GraphQL subscription operation.

No service handler may take `*nats.Msg`, `nats.JetStreamContext`, `NatsConnection`, or equivalent transport-native types as a business dependency. Transport adapters convert native messages into the portable `Message` shape before invoking handlers.
