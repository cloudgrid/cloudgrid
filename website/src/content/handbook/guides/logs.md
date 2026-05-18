---
title: "Logs"
description: "Use /logs to search project logs, inspect exact evidence, and pivot to same-project traces or spans when correlation exists."
order: 4
accent: violet
eyebrow: "Handbook - Guides"
updated: 2026-05-18
---

Use `/logs` to search project logs, inspect exact evidence, and pivot to same-project traces or spans when correlation exists.

## Workflow

1. Select a project.
2. Open `/logs`.
3. Search by text, time range, service, severity, trace ID, span ID, or attributes.
4. Select a log row.
5. Inspect body, attributes, and correlation.
6. Open trace or span detail only when the log contains same-project correlation.

## Filter Ownership

Filters map to `LogSearchInput`. Storage-read owns:

- text search semantics;
- time filtering;
- severity filtering;
- trace/span correlation;
- attribute filters;
- sorting and cursors.

The frontend renders the returned rows and selected-log inspector. It does not search across projects or compute correlation locally.

## Inspector Tabs

| Tab | Purpose |
| --- | --- |
| Body | Show structured body, scalar body text, and raw JSON fallback. |
| Attributes | Search and copy bounded log attributes. |
| Correlation | Show trace ID, span ID, service, timestamp, and pivot actions. |

## Project Boundary

If a log has a trace ID or span ID, CloudGrid opens the target route in the same selected project:

```text
/traces/:traceId
/traces/:traceId?spanId=:spanId
```

If the target is missing, expired, or unauthorized, the target route shows its missing or forbidden state. The frontend never searches another project for the trace.

## States

| State | Primary action |
| --- | --- |
| No logs ingested | Copy OTLP setup. |
| No filter results | Clear filters. |
| Storage unavailable | Retry and show problem code. |
| Missing correlation | Keep log visible and disable trace/span action with a short reason. |

## Next Step

Use [Trace investigation](/handbook/guides/trace-investigation) for trace detail and [Ingest OTLP](/handbook/guides/ingest-otlp) for log sender setup.
