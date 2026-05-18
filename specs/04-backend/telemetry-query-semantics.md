---
id: TEC-BE-008
title: Telemetry query semantics
layer: backend
status: draft
owner: unknown@example.com
updated: 2026-05-09
provenance: user-directed
depends_on: [CAP-STO-002, GQL-Query-traces, GQL-Query-trace, GQL-Query-logs, GQL-Query-telemetryFacets, GQL-Subscription-liveTraces, TEC-BE-003]
---

# Telemetry Query Semantics

## Intent

CloudGrid uses a dumb-client, smart-backend read model. Public GraphQL clients receive telemetry view models that are already filtered, counted, sorted, correlated, and bounded by the backend. Frontend clients may manage presentation state, but they must not own telemetry query semantics.

## Ownership

- Public telemetry reads are GraphQL only.
- The TypeScript BFF validates GraphQL inputs, maps them to NATS request/reply payloads, validates replies, and maps errors.
- The TypeScript BFF validates GraphQL subscription inputs, starts and stops storage-read live sessions through NATS request/reply, validates live events from storage-read, and maps stream setup or stream failure errors.
- The TypeScript BFF must not filter, aggregate, rank, correlate, or enrich telemetry records.
- The Go storage-read service owns telemetry query semantics behind its storage reader port.
- The Go storage-read service owns live trace matching semantics behind the same storage reader port and must not rely on the BFF or frontend to decide whether a trace matches live filters.
- Database-specific pushdown belongs in `core/storage-read/internal/adapters/<database>/`.
- Frontend clients render GraphQL view models and own only local presentation state such as selection, expansion, keyboard focus, tab state, URL state, and virtualization windows.

## Database Pushdown

Storage-read adapters must use database built-ins before application loops when the operation can be expressed clearly and boundedly in the database.

Required SurrealDB pushdown:

- Trace search filters: service, status, inclusive time range, duration range, operation name, span name, free-text query fields, attribute predicates, cursor predicates, sort order, and limit.
- Live trace filters: service, status, lower-bound time range, duration range, operation name, span name, free-text query fields, attribute predicates, trace ID predicates from post-persist notifications, deterministic `startedAt desc, id asc` ordering, and limit.
- Trace summary aggregations: span count, error span count, log count, service count, primary service, root span, trace status, started time, ended time, and duration.
- Log search filters: service, trace ID, span ID, severity, inclusive time range, text search, attribute predicates, cursor predicates, sort order, and limit.
- Facet queries: service, operation, span name, severity, and attribute-key counts with deterministic `count desc, value asc` ordering and bounded result sizes.
- Trace detail scoped reads: trace, spans, span events, span links, correlated logs, related-log candidates, selected span lookup, match candidates, missing-parent detection, root candidates, and service-level counts.
- Trace detail view-model aggregates: root span IDs, orphan span IDs, maximum depth when derivable from the query result, service breakdown counts, error counts, and duration totals.
- Metric name search: metric name, service, time range, last seen ordering, bounded limit, and attribute-key metadata.
- Metric series: metric name, inclusive time range, attribute predicates, grouping keys, aggregation, downsampling interval, exemplar links, deterministic time ordering, and point limit.

Application code may derive values only when the database expression would be materially less clear, less portable inside the adapter, or not supported by the selected database. Allowed code-side derivations for MVP are:

- deterministic critical-path approximation from already bounded spans;
- stack trace frame parsing from OpenTelemetry exception event attributes;
- span-link direction inference when it depends on linked trace timing not already loaded;
- final warning messages from already computed flags;
- response-shape mapping, null normalization, enum normalization, and error mapping.

Every code-side derivation in a storage-read adapter must stay local to that adapter or a small storage-read helper, include a short comment explaining why it is not pushed down, and have focused tests.

## Contract Semantics

The GraphQL schema is the public read contract. Its aggregate and enriched fields are authoritative backend-derived values:

- `TraceSummary.spanCount`, `errorSpanCount`, `logCount`, and `serviceCount` are not computed by clients.
- `TraceDetail.structure` is returned by storage-read through the BFF and is not reconstructed by clients.
- `Span.depth`, `childCount`, `hasError`, `isCriticalPath`, `isOrphan`, `isServiceEntry`, `exceptionCount`, `exceptions`, and `links.direction` are backend-derived.
- `TraceDetail.spanMatches`, `relatedLogs`, and `warnings` are backend-derived and already respect `TraceDetailInput`.
- `TelemetryFacetResult` values are backend-derived suggestions with bounded counts.
- `MetricNameSearchResult`, `MetricSeriesResult`, and `DashboardListResult` are backend-derived view models. Clients do not calculate rates, percentiles, rollups, grouping, downsampling, metric descriptor metadata, or dashboard visibility/pin state.
- `LiveTraceEvent.trace` is a `TraceSummary` produced by storage-read with the same field semantics as `Query.traces`.
- `LiveTraceEvent.type` is assigned by storage-read:
  - `snapshot`: initial bounded trace summaries sent after subscription start when matching historical data exists.
  - `added`: a newly persisted trace matched the subscription and was not previously emitted for that subscription.
  - `updated`: a previously emitted trace received additional persisted spans/logs or aggregate values changed.
  - `heartbeat`: keepalive event; `trace` is absent.
- `LiveTraceEvent.seq` is monotonically increasing per live subscription, starting at `1` for the first snapshot/data event and increasing for heartbeats as well. Clients may use it to detect local gaps but must not request replay by sequence in MVP.

NATS response contracts must include every field needed by GraphQL clients so the BFF can map replies without hidden lookups or local telemetry semantics.

## Live Trace Semantics

`Subscription.liveTraces(input: LiveTraceInput)` streams trace-level updates through the BFF. `LiveTraceInput` intentionally mirrors the concise filter names from `TraceSearchInput` and omits pagination cursor, `to`, and sort:

- `from` is an optional lower bound applied to trace `startedAt`. If omitted, storage-read does not add a synthetic `startedAt` lower bound; live delivery is already limited to newly persisted trace notifications and does not replay historical notifications.
- `limit` bounds the initial snapshot and the in-memory per-subscription emitted-trace set. Default is 100 and maximum is 500.
- Sort order is always `startedAt desc, id asc`.
- `to` is not supported because live subscriptions are open-ended. To inspect a closed time range, use `Query.traces`.
- Cursor pagination is not supported on live subscriptions. Use `Query.traces` for historical paging.

Changing live filters from the frontend starts a new GraphQL subscription operation on the existing GraphQL WebSocket connection when supported by the client library. The BFF must cancel the previous operation immediately and send `telemetry.traces.live.stop` without waiting for the next heartbeat or data event. The UI may preserve already received trace summaries in a local bounded buffer across operation restarts, but server-visible filtering for newly delivered live events is always performed by storage-read.

Storage-write emits `TracePersistedNotification` only after persistence succeeds. Storage-read consumes those notifications, uses the notification trace IDs as a narrow candidate set, and reuses the trace search query builder or an equivalent shared helper to fetch matching `TraceSummary` records. Storage-read must not emit events based only on notification hints.

Storage-read maintains per-subscription state:

- `subscriptionId`, sink subject, normalized query, auth context, creation time, last heartbeat, next sequence number, and emitted trace IDs.
- A subscription expires when the BFF sends `telemetry.traces.live.stop`, when the sink subject is no longer publishable, or when storage-read reaches its configured idle timeout.
- Per-principal, per-project, and process-level subscription limits map to ERR-017.

## Non-Goals

- Do not add a generic query DSL, KQL parser, SQL passthrough, or frontend-defined aggregation language.
- Do not add bespoke fields for one frontend component when an existing GraphQL view model can express the behavior.
- Do not fetch broad raw span or log sets into the BFF or frontend to compute filters, counts, facets, or trace structure.
- Do not let the BFF consume `TELEMETRY_INGEST`, `telemetry.ingest.*`, or subscribe to `telemetry.persisted.traces` for live views.
- Do not use SurrealDB live query handles or SurrealQL strings in the BFF. If a storage adapter later uses database-native live queries, the handles stay inside storage-read adapters.
- Do not optimize by duplicating denormalized projections until current SurrealDB query tests show the read path cannot meet NFR targets.

## Metric Query Semantics

`Query.metricNames` returns descriptors for the selected project. Results sort by `lastSeenAt desc, name asc` and are limited to 200.

`Query.metricSeries` returns one or more grouped time series:

- `from` and `to` are required and must be UTC datetimes with `from < to`;
- maximum default range is 24 hours unless a saved view panel narrows the interval;
- `interval` defaults to the smallest stable interval that produces at most 300 points per returned series;
- maximum returned points across all series is `MetricSeriesInput.limit`, default 1000 and maximum 5000;
- `groupBy` accepts at most 5 keys and only keys present in `MetricDescriptor.attributeKeys`;
- labels are returned as a JSON object keyed by `groupBy` field;
- empty matching data returns `series: []`, not an error.

Aggregation compatibility is defined in [Metrics signal](./metrics-signal.md#query-semantics). Unsupported combinations return ERR-001 before any storage query.

## Verification

- Storage-read query builder tests must assert every GraphQL and NATS filter is represented in adapter query parameters or explicitly rejected by validation.
- Storage-read tests must cover database-backed counts and facet ordering.
- Storage-read metric tests must cover metric name search, aggregation compatibility, grouping, filters, interval downsampling, point limits, empty results, and exemplar trace/span links.
- BFF resolver tests must assert resolvers only validate/map/request/reply and do not aggregate telemetry records.
- BFF subscription tests must assert `liveTraces` starts storage-read live sessions, validates live events, forwards heartbeats, sends stop on unsubscribe, and never subscribes to persisted or ingest streams.
- Storage-read live tests must assert notification trace IDs are narrowed through storage query semantics, filters match `TraceSearchInput` semantics where fields overlap, authorization denial returns ERR-016, and subscription limits return ERR-017.
- Frontend tests must assert rendering and interactions, not reimplementation of telemetry semantics.
- Contract checks must fail when GraphQL fields cannot be mapped from typed NATS responses.
