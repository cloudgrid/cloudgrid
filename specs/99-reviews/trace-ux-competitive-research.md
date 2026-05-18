---
id: REV-TRACE-UX-001
title: Trace UX competitive research
layer: review
status: draft
owner: unknown@example.com
updated: 2026-05-09
provenance: research
---

# Trace UX Competitive Research

## Sources Reviewed

External product documentation and UI references were reviewed for Honeycomb, SigNoz, New Relic, Grafana, Datadog, Jaeger, Elastic APM, Dynatrace, and Monoscope. Exact URLs are intentionally not embedded in this spec file because the repository spec checker treats `/docs/` URL paths as local documentation references. The source list used for research passes is recorded in the implementation notes and final responses for the research tasks.

## Common Scenarios

1. Find slow traces by service, operation, status, duration, and time range.
2. Open a trace and immediately understand duration, span count, error count, participating services, root operation, and timing.
3. Locate the latency driver through a waterfall/timeline and a compact overview.
4. Select any span and inspect service, operation, timing, status, attributes, events, links, and exceptions.
5. Jump from span to related logs, and from logs back to trace/span context.
6. Search inside a trace for service names, operation names, attribute keys/values, errors, and duration ranges.
7. Collapse noise and focus on errors, critical path, long spans, or matching spans while keeping hierarchy understandable.
8. Handle missing parents, orphan spans, clock skew, and partial traces without breaking the mental model.
9. Navigate large traces with virtualization, summaries, and bounded previews instead of rendering every row naively.
10. Share an investigation state through URL filters and selected span IDs.

## Common Product Patterns

- Waterfall/timeline with expandable parent-child rows.
- Compact trace summary/minimap showing long spans and errors.
- Span detail panel with tabs for attributes, events, links, logs, and exception details.
- Search/filter bar inside trace detail, separate from global trace search.
- Error highlighting and next/previous match navigation.
- Service color coding and service-level duration breakdown.
- Related logs reachable from the selected span.
- Attribute/value pivots that add filters.
- Large-trace safeguards such as virtualization, preview mode, or grouped collapsed spans.

## Differentiating Features Worth Copying Carefully

- Honeycomb-style trace summary/minigraph that helps find long spans and errors before scrolling.
- SigNoz-style synchronized flamegraph and waterfall interaction for trace shape plus exact timing.
- Grafana-style trace-to-logs and span filters covering service, span name, duration, and tags.
- New Relic-style focus controls for errors/anomalies and span links with forward/backward causal direction.
- Datadog-style service map and large-trace preview that surfaces service entry spans, errors, long spans, and linked spans.
- Dynatrace-style exception relationship emphasis and strict selected-span log filtering.
- Monoscope-style query workflow that combines natural-language query assistance, explicit KQL-like text query editing, visualization mode tabs, faceted filters, and row-level trace expansion in one explorer. Copy the intent, not the exact surface: CloudGrid should keep trace investigation and log search simpler until its GraphQL contracts support broader aggregation and metrics.

## Monoscope-Specific Research Notes

Monoscope's public UI and repository show a broad observability workbench rather than a narrow trace-debugger. Its navigation centers on dashboards, explorer, API catalog/endpoints, issues or changes, monitors, reports, settings, and documentation. The explorer combines Events/Metrics tabs, live streaming and refresh controls, natural-language input, a structured query editor, visualization tabs for logs, bar, line, patterns, and sessions, summary widgets, a faceted filter sidebar, and table/tree result modes.

The most relevant UI intent for CloudGrid is progressive narrowing: start from a broad stream, use facets and query suggestions to focus, then expand individual rows into trace context or pivot to endpoint/service views. The risk is surface-area overload. CloudGrid's MVP should not merge trace detail, log search, endpoint catalog, metrics, anomaly issues, monitors, and reports into one screen. It should borrow the fast pivot mechanics and visible facet counts only where they reinforce trace/log investigation.

Monoscope's backend currently shows a PostgreSQL/TimescaleDB-centered implementation with a shared `otel_logs_and_spans` hypertable, generated flattened columns for common OpenTelemetry attributes, KQL-to-SQL query translation, precomputed facets, log-pattern aggregation, sessions aggregation, and optional TimeFusion read/write routing through a PostgreSQL-compatible pool. Its S3 story appears partly product/roadmap for telemetry storage and concretely implemented for per-project S3 configuration and session replay JSON object storage. Treat the S3 architecture as useful product pressure, not as a proven adapter shape to copy directly.

## CloudGrid Product Decisions

- MVP uses one trace investigation page, not separate competing trace-detail modes. It contains:
  - a summary header,
  - a compact service/duration overview,
  - a selectable span timeline/waterfall,
  - a span detail panel,
  - a related logs panel.
- The primary workflow is "find, focus, pivot": find a trace, focus a span or error, pivot to logs or attribute filters.
- The visual default is a timeline/waterfall. A flamegraph-style overview is allowed as a compact summary but must stay synchronized with selected span and search matches.
- The selected span is URL-addressable through `spanId`, so investigation links are shareable.
- Span exceptions are first-class UI content derived from OpenTelemetry exception span events. The UI must render stack traces as readable frames when parsing succeeds and as raw stack text otherwise.
- Span links are first-class UI content even when no linked trace is available locally. Links show trace ID, span ID, direction, attributes, and navigation affordance only when the linked trace exists.
- Related logs are split into exact span logs, trace logs, and contextual service/time logs.
- Large-trace readiness is required at the UI contract level: render virtualization is mandatory once row count exceeds 500, and the API can later add preview windows without changing the user concept.

## Explicit Deferrals

- Profiles, service graph across the whole deployment, anomaly scoring, and
  percentile baselines require explicit contracts before implementation.
- A full Datadog-style service map for a single trace is not MVP, but `TraceStructure.serviceBreakdown` keeps the data path extensible.
- AI-generated summaries are not MVP. The layout must leave room for an investigation summary panel later without making it required now.
