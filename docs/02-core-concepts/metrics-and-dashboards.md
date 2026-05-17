# Metrics And Dashboards

CloudGrid separates metric exploration from dashboard composition.

- Use `/metrics` to discover metric names, inspect descriptors, test `MetricSeriesInput` queries, and follow exemplar links to traces or spans.
- Use `/dashboards` to view built-in dashboards, create personal or project dashboards, arrange widgets, and save reusable visual workspaces.

The split is intentional. Metrics are technical telemetry evidence. Dashboards are saved project configuration.

## Dashboard Workspace

Open `/dashboards` after selecting a project. The default view is the dashboard overview:

- search dashboards;
- review pinned, built-in, personal, and project dashboard groups;
- create a dashboard;
- pin or unpin dashboards through saved preferences.

Pinned dashboards may also appear in the project sidebar. Sidebar pins are not browser-local shortcuts. They come from `Query.dashboards`, `Mutation.setDashboardPinned`, and `Mutation.reorderDashboardPins`.

Selecting a dashboard opens builder mode at `/dashboards?dashboard=<dashboardId>`. Builder mode uses the dashboard canvas as the primary surface. It does not show the dashboard overview or a permanent widget inspector beside the canvas.

## Builder Mode

Builder mode has two local states:

| Mode | Purpose |
| --- | --- |
| View | Render widgets, refresh data, expand details, copy links, and follow pivots. |
| Edit | Add, edit, duplicate, remove, drag, resize, reorder, and save widgets. |

Editing creates a local draft. Layout changes, widget edits, dashboard name changes, and description changes are not persisted until the user saves the dashboard.

Built-in dashboards are read-only. Editing a built-in dashboard creates an unsaved draft that must be saved as a personal or project dashboard.

## Widget Layout

Dashboard widgets use a bounded 12-column grid:

| Field | Meaning |
| --- | --- |
| `x` | Column start, from `0` through `11`. |
| `y` | Row start, `0` or greater. |
| `w` | Width, from `1` through `12`. |
| `h` | Height, from `1` through `12`. |
| `minW` | Minimum width, from `1` through `12`. |
| `minH` | Minimum height, from `1` through `12`. |

On desktop, users can drag and resize widgets with pointer controls. Keyboard users can move and resize widgets by grid cell. Collision handling pushes affected widgets down in stable order; widgets must not overlap after compaction.

On mobile, dashboard widgets render as a stacked preview. Users can edit widget data and display settings in a sheet, duplicate or remove widgets, and reorder with explicit move controls. Mobile does not expose freeform drag-resize.

## Widget Types

Each `DashboardWidget` has exactly one source configuration matching its `DashboardWidgetKind`.

| Widget kind | Source config | Execution path |
| --- | --- | --- |
| `metric_timeseries` | `DashboardMetricWidgetInput` | `Query.metricSeries` |
| `metric_stat` | `DashboardMetricWidgetInput` | `Query.metricSeries` |
| `metric_table` | `DashboardMetricWidgetInput` | `Query.metricSeries` |
| `metric_rich` | `DashboardRichMetricWidgetInput` | `Query.richMetricSeries` |
| `log_table` | `DashboardLogWidgetInput` | `Query.logs` |
| `trace_table` | `DashboardTraceWidgetInput` | `Query.traces` |
| `live_trace_table` | `DashboardLiveTraceWidgetInput` | `Subscription.liveTraces` |

Metric widgets may render line, area, bar, pie, donut, stat, radial, radar, heatmap, histogram, or table visualizations when the backend returns the required shape.

Log and trace widgets are table-first. Live trace widgets show bounded rolling rows and do not persist live events.

## Widget Editor

The widget editor opens as a right drawer on desktop and a sheet on smaller screens. It has three groups:

- `Data`: source-specific query fields such as metric name, aggregation, filters, group-by keys, log filters, trace filters, live filters, and rich metric query rows.
- `Display`: title, visualization, legend, axes, row density, columns, and layout size.
- `Thresholds`: visual threshold values and severity labels for metric widgets.

Thresholds are visual dashboard settings. They do not create alert rules.

## Rich Metric Query Widgets

Rich metric widgets combine several metric queries and formulas in one widget without asking the frontend or BFF to compute telemetry.

A rich metric query uses:

- `DashboardMetricQueryInput.timeWindow`;
- `DashboardMetricQueryInput.interval`;
- `DashboardMetricQueryInput.queries`;
- `DashboardMetricQueryInput.formulas`;
- `DashboardMetricQueryInput.displaySeries`.

Each query row has `id`, `label`, `metricName`, `aggregation`, optional `groupBy`, optional `filters`, and optional `maxSeries`. Formula expressions are typed trees. They are not SQL, SurrealQL, JavaScript, arbitrary JSON, or freeform executable strings.

Formula expression kinds are `ref`, `number`, `binary`, `unary`, and `function`. Binary operators are `add`, `subtract`, `multiply`, and `divide`. Supported functions are `sum_series`, `avg_series`, `min_series`, `max_series`, `ratio`, `clamp_min`, `clamp_max`, and `moving_average`.

Example: error rate panel.

```graphql
mutation SaveErrorRateDashboard($input: SaveDashboardInput!) {
  saveDashboard(input: $input) {
    id
    version
    widgets {
      id
      kind
    }
  }
}
```

```json
{
  "input": {
    "name": "Service error rate",
    "visibility": "project",
    "defaultTimeWindow": "PT1H",
    "widgets": [
      {
        "id": "w_error_rate",
        "title": "HTTP error rate",
        "kind": "metric_rich",
        "layout": { "x": 0, "y": 0, "w": 8, "h": 5, "minW": 5, "minH": 3 },
        "richMetric": {
          "visualization": "line",
          "legend": true,
          "maxSeries": 20,
          "query": {
            "timeWindow": "PT1H",
            "interval": "PT1M",
            "queries": [
              {
                "id": "errors",
                "label": "Errors",
                "metricName": "http.server.requests",
                "aggregation": "count",
                "filters": [
                  { "key": "http.response.status_code", "operator": "gte", "value": "500" }
                ],
                "maxSeries": 20
              },
              {
                "id": "total",
                "label": "Total",
                "metricName": "http.server.requests",
                "aggregation": "count",
                "maxSeries": 20
              }
            ],
            "formulas": [
              {
                "id": "error_rate",
                "label": "Error rate",
                "unit": "ratio",
                "expression": {
                  "kind": "function",
                  "function": "ratio",
                  "arguments": [
                    { "kind": "ref", "refId": "errors" },
                    { "kind": "ref", "refId": "total" }
                  ]
                }
              }
            ],
            "displaySeries": [
              {
                "id": "display_error_rate",
                "label": "Error rate",
                "sourceId": "error_rate",
                "visible": true
              }
            ]
          }
        }
      }
    ]
  }
}
```

The same query can be previewed through `Query.richMetricSeries`:

```graphql
query PreviewRichMetric($input: RichMetricSeriesInput!) {
  richMetricSeries(input: $input) {
    interval
    series {
      id
      label
      sourceId
      unit
      points {
        timestamp
        value
      }
    }
    warnings {
      code
      message
      field
    }
  }
}
```

## Computation Ownership

CloudGrid uses a dumb-client, smart-backend model for dashboards:

| Layer | Owns |
| --- | --- |
| Frontend | Draft state, layout editing, display choices, local shape feedback, and rendering returned view models. |
| TypeScript BFF | Public GraphQL validation, project authorization context, message bridge request/reply mapping, and error mapping. |
| Go control-plane | Dashboard definitions, visibility, built-ins, versioning, save/delete validation, and dashboard pins. |
| Go storage-read | Metric query semantics, aggregation compatibility, grouping, filters, timestamp alignment, rich formula evaluation, result limits, warnings, and chart-ready series. |

The frontend and BFF must not compute metric rates, percentiles, rollups, joins, formulas, trace counts, log counts, or dashboard widget telemetry from raw records.

## What Not To Store

Dashboard definitions store typed configuration only. They must not store:

- bearer tokens or API keys;
- SurrealDB credentials;
- executable code;
- raw SQL or SurrealQL;
- arbitrary JSON widget configuration;
- external embeds;
- `MetricView` compatibility records.

CloudGrid dashboard work uses `Dashboard` and `DashboardWidget`. It does not use `MetricView`, `MetricViewPanel`, `metricViews`, `saveMetricView`, or `deleteMetricView`.

Next: [Operations](../03-operations/README.md#working-with-logs-metrics-and-dashboards) covers day-to-day use and troubleshooting.
