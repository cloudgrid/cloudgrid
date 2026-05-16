---
id: TEC-FE-003
title: Trace investigation UX
layer: frontend
status: draft
owner: unknown@example.com
updated: 2026-05-09
provenance: research-informed
---

# Trace Investigation UX

This spec defines trace-specific workflow and data requirements. Concrete route layout, visualization placement, detail inspector behavior, and implementation acceptance are defined in [Traces and metrics UX concept](./traces-and-metrics-ux-concept.md). When the two files overlap, `traces-and-metrics-ux-concept.md` owns visual placement and interaction detail, and this file owns trace investigation requirements.

## Goal

The trace UI must help an engineer find the right telemetry quickly, understand the request path at a glance, and dive into exact span, stack trace, event, link, and log evidence without losing context.

## Primary Workflow

1. Find candidate traces with global filters, search, and sortable result columns.
2. Open a trace and see summary signals without scrolling: service, operation, status, duration, span count, error span count, log count, service count, start time, root span, and trace ID.
3. Focus the investigation with trace-detail filters: span search, service, operation/span name, status, duration, attribute filters, errors, and critical path.
4. Select a span in the waterfall or overview.
5. Inspect selected span details in a persistent panel.
6. Review exact span logs first, then trace logs, then contextual service/time logs.
7. Pivot from any attribute, service, operation, trace ID, span ID, or log row into a narrowed trace or log search.

## Layout

The `/traces/:traceId` route uses a stable three-zone layout:

- Header: one concise information bar with trace identity, high-signal metrics, status, copy action, and back navigation.
- Main timeline: optional service scope plus virtualized span waterfall.
- Detail panel: selected span details and related evidence.

The detail panel remains visible while the user scrolls the waterfall on desktop. On narrow screens it becomes a shadcn sheet opened by selecting a span.

## Trace Overview

The overview must show:

- total trace duration,
- service duration breakdown,
- error span markers,
- critical path markers,
- selected span location,
- search-match markers.

The overview may use a compact flamegraph/minimap representation. It must not replace the waterfall because the user still needs exact parent-child and timing context.

## Trace Tree Waterfall

The main timeline is a tree-first waterfall. It must preserve parent-child trace structure while keeping timeline duration context visible in every row.

Rows include:

- expand/collapse control,
- depth indentation,
- service,
- span name,
- kind icon,
- status marker,
- duration text,
- duration bar scaled to trace duration,
- event markers,
- link marker,
- log marker when exact span logs exist,
- selected and keyboard focus states.

Rows are keyboard navigable. `Enter` selects a span, arrow up/down move between visible rows, arrow right expands a collapsed parent or moves to its first visible child, and arrow left collapses an expanded parent or moves to its parent.

Expansion and collapse behavior:

- default expansion opens the root path, selected-span ancestor path, critical-path ancestor path, and error-span ancestor paths;
- collapsing a parent hides descendants and moves selection to the parent when the previous selected span becomes hidden;
- search and filters keep required ancestors visible so matched descendants retain context;
- non-matching required ancestors are visually muted, not removed;
- expand-all is available only when the visible row set is at most 2,000 spans.

Virtualization is required when a trace has more than 500 spans. Rendered row count must remain bounded by viewport size plus overscan. The page must never render thousands of DOM rows at once.

## Span Search And Filters

Trace-detail search matches:

- span name,
- service name,
- kind,
- status,
- span attribute keys and string values,
- event names and string values,
- exception type, message, and stacktrace,
- linked trace IDs and span IDs.

Filters include service, span name, status, duration range, attribute filters, errors only, critical path only, and matches only.

Span filters must open from a compact icon button in the trace tree waterfall header and render in a shadcn dialog. Do not render trace-detail span filters as a separate full-width panel above the waterfall.

When matches-only mode is enabled, ancestors required for hierarchy remain visible. Non-matching ancestors are visually muted, not removed.

## Span Detail Panel

Tabs:

- Overview: name, IDs, service, kind, status, start, duration, parent, child count, depth, critical-path flag, orphan flag, and copy controls.
- Attributes: searchable key/value table with pin and pivot actions.
- Events: timeline of span events with timestamp offsets and attributes.
- Exceptions: readable stack traces derived from OpenTelemetry exception events.
- Links: linked trace/span references with direction, trace state, attributes, and local navigation when the linked trace exists.
- Logs: exact span logs, trace logs, and contextual logs, grouped and filterable.

Stack trace rendering:

- Prefer parsed frames with function, file, line, and column.
- Preserve raw stack text when parsing is incomplete.
- Highlight top application frame when recognizable from service/language attributes.
- Never hide the raw exception message or type.

## Related Logs

Related logs are grouped in this order:

1. Exact span logs: `traceId` and `spanId` match selected span.
2. Trace logs: `traceId` matches the trace but `spanId` is absent or different.
3. Contextual logs: service and time-window correlation from CAP-OBS-004.

The panel shows timestamp offset from trace start, severity, service, body preview, and trace/span chips. Opening a log row shows full JSON body and attributes.

## Global Trace Explorer

The `/traces` route supports:

- free text query,
- service,
- operation/span name,
- status,
- duration range,
- time range,
- attribute filters,
- sort by start time, duration, and error-first.

The table columns are service, operation/root span, trace ID, started time, duration, status, span count, error span count, log count, and participating service count.

## Log Explorer

The `/logs` route supports:

- free text search,
- service,
- trace ID,
- span ID,
- severity,
- time range,
- attribute filters,
- sort by timestamp and severity.

Log rows link to `/traces/:traceId?spanId=:spanId` when both IDs are present, and to `/traces/:traceId` when only the trace ID is present.

## URL State

All filters, active tab, selected span ID, collapsed search state, and sort order are encoded in URL query parameters. Copying the URL must preserve the investigation state.

## Empty And Degraded States

- No telemetry: explain that no OTLP data has been ingested and link to getting started docs.
- No filter results: show active filters and a clear action.
- Missing parent: show affected spans at root level with a missing-parent warning.
- Missing root: show earliest span as synthetic root candidate and warn.
- Clock skew: show warning when child timing starts before parent by more than 100 milliseconds.
- Large trace preview: show a warning and explicit fetch-more affordance when the API returns a preview in the future.

## Design Constraints

- Use shadcn primitives and default theme tokens.
- Keep the waterfall dense and stable; avoid card-heavy trace rows.
- The trace detail header must be one compact horizontal information bar where viewport width allows. Do not split trace identity and metrics into separate stacked panels.
- Do not put cards, bordered panels, or card-like rounded sections inside other cards or bordered panels.
- Do not add a wrapper title/header around a component that already owns its visible title, count, or controls.
- Trace detail must avoid duplicate overview surfaces. The waterfall is the primary trace timeline; service breakdown appears only when it adds multi-service context.
- Use icons for copy, expand/collapse, search, filter, critical path, error, link, logs, and stack trace affordances.
- Expand/collapse controls must expose the next action in their label, icon, tooltip, and `aria-label`.
- Text must not overlap bars, chips, or controls at 320px mobile width or wide desktop.
- Attribute values and JSON bodies use monospace with copy controls.
